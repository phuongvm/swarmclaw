import { getRunById, listRunEvents, listRuns } from '@/lib/server/runtime/session-run-manager'
import {
  listProtocolRunEventsForRun,
  listProtocolRuns,
  loadProtocolRunById,
} from '@/lib/server/protocols/protocol-queries'
import {
  protocolEventToRunEventRecord,
  protocolRunToSessionRunRecord,
} from '@/lib/server/runs/unified-run-records'
import type {
  ProtocolRun,
  ProtocolRunStatus,
  RunEventRecord,
  SessionRunRecord,
  SessionRunStatus,
} from '@/types'

function protocolStatusesForRunStatus(status?: SessionRunStatus): ProtocolRunStatus[] {
  switch (status) {
    case 'queued':
      return ['draft']
    case 'running':
      return ['running', 'waiting', 'paused']
    case 'completed':
      return ['completed']
    case 'failed':
      return ['failed']
    case 'cancelled':
      return ['cancelled', 'archived']
    default:
      return []
  }
}

function uniqueProtocolRuns(runs: ProtocolRun[]): ProtocolRun[] {
  return Array.from(new Map(runs.map((run) => [run.id, run])).values())
}

export function listUnifiedRuns(params: {
  sessionId?: string
  status?: SessionRunStatus
  limit?: number
} = {}): SessionRunRecord[] {
  const fetchLimit = Math.max(1, Math.min(1000, Math.trunc(params.limit ?? 200)))
  const sessionRuns = listRuns({ sessionId: params.sessionId, status: params.status, limit: fetchLimit })
  const protocolRuns = params.status
    ? protocolStatusesForRunStatus(params.status).flatMap((protocolStatus) => listProtocolRuns({
      includeSystemOwned: true,
      sessionId: params.sessionId,
      status: protocolStatus,
      limit: fetchLimit,
    }))
    : listProtocolRuns({
      includeSystemOwned: true,
      sessionId: params.sessionId,
      limit: fetchLimit,
    })

  return [
    ...sessionRuns,
    ...uniqueProtocolRuns(protocolRuns)
      .filter((run) => run.status !== 'archived')
      .map(protocolRunToSessionRunRecord)
      .filter((run) => !params.status || run.status === params.status),
  ]
    .sort((left, right) => (right.queuedAt || 0) - (left.queuedAt || 0))
    .slice(0, fetchLimit)
}

export function getUnifiedRunById(runId: string): SessionRunRecord | null {
  const run = getRunById(runId)
  if (run) return run
  const protocolRun = loadProtocolRunById(runId)
  return protocolRun ? protocolRunToSessionRunRecord(protocolRun) : null
}

export function listUnifiedRunEvents(runId: string, limit = 200): RunEventRecord[] {
  const run = getRunById(runId)
  if (run) return listRunEvents(runId, limit)
  const protocolRun = loadProtocolRunById(runId)
  if (!protocolRun) return []
  return listProtocolRunEventsForRun(runId, limit).map((event) => protocolEventToRunEventRecord(protocolRun, event))
}
