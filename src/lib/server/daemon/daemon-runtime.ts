import http from 'node:http'
import { URL } from 'node:url'

import { loadConnectors } from '@/lib/server/connectors/connector-repository'
import {
  clearReconnectState,
  getConnectorPresence,
  getConnectorQR,
  getConnectorStatus,
  getReconnectState,
  hasConnectorCredentials,
  isConnectorAuthenticated,
  listRunningConnectors,
  repairConnector,
  startConnector,
  stopConnector,
} from '@/lib/server/connectors/manager'
import { log } from '@/lib/server/logger'
import {
  getDaemonHealthSummary,
  getDaemonStatus,
  runDaemonHealthCheckNow,
  startDaemon,
  stopDaemon,
} from '@/lib/server/runtime/daemon-state'
import {
  clearDaemonAdminMetadata,
  readDaemonAdminMetadata,
  writeDaemonAdminMetadata,
} from '@/lib/server/daemon/admin-metadata'
import {
  loadDaemonStatusRecord,
  patchDaemonStatusRecord,
} from '@/lib/server/daemon/daemon-status-repository'
import type {
  DaemonAdminMetadata,
  DaemonConnectorRuntimeState,
  DaemonHealthSummaryPayload,
  DaemonRunningConnectorInfo,
  DaemonStatusPayload,
} from '@/lib/server/daemon/types'

const TAG = 'daemon-runtime'
const HEARTBEAT_FLUSH_INTERVAL_MS = 5_000

type AdminSnapshotResponse = {
  status: DaemonStatusPayload
  healthSummary: DaemonHealthSummaryPayload
}

function parseArgs(argv: string[]): { port: number; token: string } {
  let port = Number.parseInt(process.env.SWARMCLAW_DAEMON_ADMIN_PORT || '', 10)
  let token = (process.env.SWARMCLAW_DAEMON_ADMIN_TOKEN || '').trim()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port' && index + 1 < argv.length) {
      port = Number.parseInt(argv[index + 1] || '', 10)
      index += 1
    } else if (arg === '--token' && index + 1 < argv.length) {
      token = (argv[index + 1] || '').trim()
      index += 1
    }
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Missing daemon admin port.')
  }
  if (!token) {
    throw new Error('Missing daemon admin token.')
  }
  return { port, token }
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function buildSnapshot(): AdminSnapshotResponse {
  return {
    status: getDaemonStatus() as DaemonStatusPayload,
    healthSummary: getDaemonHealthSummary() as DaemonHealthSummaryPayload,
  }
}

function buildConnectorRuntimeSnapshot(): Record<string, DaemonConnectorRuntimeState> {
  const connectors = loadConnectors()
  const snapshot: Record<string, DaemonConnectorRuntimeState> = {}
  for (const connector of Object.values(connectors)) {
    const runtimeStatus = getConnectorStatus(connector.id)
    const reconnectState = getReconnectState(connector.id)
    snapshot[connector.id] = {
      status: runtimeStatus === 'running'
        ? 'running'
        : connector.lastError
          ? 'error'
          : 'stopped',
      authenticated: connector.platform === 'whatsapp' ? isConnectorAuthenticated(connector.id) : undefined,
      hasCredentials: connector.platform === 'whatsapp' ? hasConnectorCredentials(connector.id) : undefined,
      qrDataUrl: connector.platform === 'whatsapp' ? getConnectorQR(connector.id) : undefined,
      reconnectAttempts: reconnectState?.attempts,
      nextRetryAt: reconnectState?.nextRetryAt,
      reconnectError: reconnectState?.error ?? null,
      reconnectExhausted: reconnectState?.exhausted,
      presence: runtimeStatus === 'running' ? getConnectorPresence(connector.id) : null,
    }
  }
  return snapshot
}

async function buildConnectorActionSnapshot(
  connectorId: string,
  action: 'start' | 'stop' | 'repair',
): Promise<DaemonConnectorRuntimeState | null> {
  if (!loadConnectors()[connectorId]) return null
  if (action === 'start') {
    clearReconnectState(connectorId)
    await startConnector(connectorId)
  } else if (action === 'stop') {
    await stopConnector(connectorId)
  } else {
    clearReconnectState(connectorId)
    await repairConnector(connectorId)
  }
  return buildConnectorRuntimeSnapshot()[connectorId] || null
}

let shuttingDown = false
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let server: http.Server | null = null

function persistHeartbeat(): void {
  const snapshot = buildSnapshot()
  patchDaemonStatusRecord((current) => ({
    ...current,
    pid: process.pid,
    desiredState: snapshot.status.running ? 'running' : current.desiredState,
    manualStopRequested: current.manualStopRequested,
    startedAt: current.startedAt || Date.now(),
    stoppedAt: snapshot.status.running ? null : current.stoppedAt,
    adminPort: readDaemonAdminMetadata()?.port ?? current.adminPort,
    lastHeartbeatAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
    lastStatus: snapshot.status,
    lastHealthSummary: snapshot.healthSummary,
  }))
}

async function shutdown(source: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
  try {
    await stopDaemon({ source, manualStop: false })
  } catch (err: unknown) {
    log.warn(TAG, `Daemon runtime stop failed (${source})`, err)
  }
  const snapshot = buildSnapshot()
  patchDaemonStatusRecord((current) => ({
    ...current,
    pid: null,
    adminPort: null,
    desiredState: 'stopped',
    startedAt: current.startedAt,
    stoppedAt: Date.now(),
    lastHeartbeatAt: current.lastHeartbeatAt,
    updatedAt: Date.now(),
    lastStopSource: source,
    lastStatus: {
      ...snapshot.status,
      running: false,
      schedulerActive: false,
    },
    lastHealthSummary: {
      ...snapshot.healthSummary,
      ok: false,
      components: {
        ...snapshot.healthSummary.components,
        daemon: { status: 'stopped' },
      },
    },
  }))
  clearDaemonAdminMetadata()
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
}

async function main(): Promise<void> {
  const { port, token } = parseArgs(process.argv.slice(2))
  const metadata: DaemonAdminMetadata = {
    pid: process.pid,
    port,
    token,
    launchedAt: Date.now(),
    source: loadDaemonStatusRecord().lastLaunchSource,
  }
  writeDaemonAdminMetadata(metadata)

  const started = startDaemon({ source: 'daemon-runtime:boot', manualStart: true })
  const snapshot = buildSnapshot()
  if (!started && !snapshot.status.running) {
    patchDaemonStatusRecord((current) => ({
      ...current,
      pid: null,
      adminPort: null,
      desiredState: 'stopped',
      stoppedAt: Date.now(),
      updatedAt: Date.now(),
      lastError: 'Daemon runtime could not acquire execution lease.',
      lastStatus: {
        ...snapshot.status,
        running: false,
        schedulerActive: false,
      },
      lastHealthSummary: {
        ...snapshot.healthSummary,
        ok: false,
        components: {
          ...snapshot.healthSummary.components,
          daemon: { status: 'stopped' },
        },
      },
    }))
    clearDaemonAdminMetadata()
    process.exitCode = 1
    return
  }

  persistHeartbeat()
  heartbeatInterval = setInterval(() => {
    persistHeartbeat()
  }, HEARTBEAT_FLUSH_INTERVAL_MS)

  server = http.createServer(async (req, res) => {
    try {
      const auth = req.headers.authorization || ''
      if (auth !== `Bearer ${token}`) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
      if (req.method === 'GET' && url.pathname === '/status') {
        sendJson(res, 200, buildSnapshot())
        return
      }
      if (req.method === 'POST' && url.pathname === '/health-check') {
        await runDaemonHealthCheckNow()
        persistHeartbeat()
        sendJson(res, 200, buildSnapshot())
        return
      }
      if (req.method === 'POST' && url.pathname === '/stop') {
        sendJson(res, 200, { ok: true })
        void shutdown('daemon-admin:stop').finally(() => process.exit(0))
        return
      }
      if (req.method === 'GET' && url.pathname === '/connectors') {
        sendJson(res, 200, { connectors: buildConnectorRuntimeSnapshot() })
        return
      }
      if (req.method === 'GET' && url.pathname === '/connectors/running') {
        const platform = url.searchParams.get('platform') || undefined
        sendJson(res, 200, { connectors: listRunningConnectors(platform) as DaemonRunningConnectorInfo[] })
        return
      }
      const connectorMatch = url.pathname.match(/^\/connectors\/([^/]+)$/)
      if (req.method === 'GET' && connectorMatch) {
        const connectorId = decodeURIComponent(connectorMatch[1] || '')
        sendJson(res, 200, { connector: buildConnectorRuntimeSnapshot()[connectorId] || null })
        return
      }
      const actionMatch = url.pathname.match(/^\/connectors\/([^/]+)\/actions$/)
      if (req.method === 'POST' && actionMatch) {
        const connectorId = decodeURIComponent(actionMatch[1] || '')
        const body = await readJsonBody(req)
        const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : ''
        if (action !== 'start' && action !== 'stop' && action !== 'repair') {
          sendJson(res, 400, { error: 'Invalid connector action.' })
          return
        }
        const connector = await buildConnectorActionSnapshot(connectorId, action)
        sendJson(res, connector ? 200 : 404, { connector })
        return
      }
      sendJson(res, 404, { error: 'Not found' })
    } catch (err: unknown) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'Daemon admin failure' })
    }
  })

  await new Promise<void>((resolve) => {
    server!.listen(port, '127.0.0.1', () => resolve())
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(`signal:${signal}`).finally(() => process.exit(0))
    })
  }
  process.on('uncaughtException', (err: Error) => {
    try {
      patchDaemonStatusRecord((current) => ({
        ...current,
        lastError: err.message,
        updatedAt: Date.now(),
      }))
    } catch (patchErr) {
      log.error(TAG, 'Failed to record uncaughtException in daemon status', patchErr)
    }
    void shutdown('uncaughtException').finally(() => process.exit(1))
  })
  process.on('unhandledRejection', (reason: unknown) => {
    try {
      patchDaemonStatusRecord((current) => ({
        ...current,
        lastError: reason instanceof Error ? reason.message : String(reason),
        updatedAt: Date.now(),
      }))
    } catch (patchErr) {
      log.error(TAG, 'Failed to record unhandledRejection in daemon status', patchErr)
    }
    void shutdown('unhandledRejection').finally(() => process.exit(1))
  })
}

void main().catch((err: unknown) => {
  try {
    patchDaemonStatusRecord((current) => ({
      ...current,
      pid: null,
      adminPort: null,
      desiredState: 'stopped',
      stoppedAt: Date.now(),
      updatedAt: Date.now(),
      lastError: err instanceof Error ? err.message : 'Daemon runtime failed to start',
    }))
  } catch (patchErr) {
    log.error(TAG, 'Failed to record fatal daemon error in status', patchErr)
  }
  clearDaemonAdminMetadata()
  log.error(TAG, 'Fatal daemon runtime error', err)
  process.exit(1)
})
