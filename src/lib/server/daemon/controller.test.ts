import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

const originalEnv = {
  DATA_DIR: process.env.DATA_DIR,
  WORKSPACE_DIR: process.env.WORKSPACE_DIR,
  SWARMCLAW_BUILD_MODE: process.env.SWARMCLAW_BUILD_MODE,
  SWARMCLAW_DAEMON_AUTOSTART: process.env.SWARMCLAW_DAEMON_AUTOSTART,
  SWARMCLAW_DAEMON_BACKGROUND_SERVICES: process.env.SWARMCLAW_DAEMON_BACKGROUND_SERVICES,
}

let tempDir = ''
let daemonState: typeof import('@/lib/server/runtime/daemon-state')
let controller: typeof import('@/lib/server/daemon/controller')
let adminMetadata: typeof import('@/lib/server/daemon/admin-metadata')

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-daemon-controller-'))
  process.env.DATA_DIR = path.join(tempDir, 'data')
  process.env.WORKSPACE_DIR = path.join(tempDir, 'workspace')
  process.env.SWARMCLAW_BUILD_MODE = '1'
  process.env.SWARMCLAW_DAEMON_AUTOSTART = '0'

  daemonState = await import('@/lib/server/runtime/daemon-state')
  controller = await import('@/lib/server/daemon/controller')
  adminMetadata = await import('@/lib/server/daemon/admin-metadata')
})

after(async () => {
  try { await daemonState.stopDaemon({ source: 'test-cleanup' }) } catch { /* ignore */ }
  adminMetadata.clearDaemonAdminMetadata()
  for (const [key, val] of Object.entries(originalEnv)) {
    if (val === undefined) delete process.env[key]
    else process.env[key] = val
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('daemon controller in-process mode', () => {
  it('reports in-process daemon as running', async () => {
    daemonState.startDaemon({ source: 'test', manualStart: true })
    try {
      const status = await controller.getDaemonStatusSnapshot()
      const health = await controller.getDaemonHealthSummarySnapshot()
      assert.equal(status.running, true)
      assert.equal(status.schedulerActive, true)
      assert.equal(health.components.daemon.status, 'healthy')
    } finally {
      await daemonState.stopDaemon({ source: 'test-cleanup' })
    }
  })

  it('starts daemon in-process when manually requested', async () => {
    await daemonState.stopDaemon({ source: 'test-prep' })
    adminMetadata.clearDaemonAdminMetadata()

    const started = await controller.ensureDaemonProcessRunning('test-start', { manualStart: true })
    try {
      assert.equal(started, true)
      assert.equal(daemonState.getDaemonStatus().running, true)
      assert.equal(adminMetadata.readDaemonAdminMetadata(), null)
    } finally {
      await daemonState.stopDaemon({ source: 'test-cleanup' })
    }
  })

  it('stops in-process daemon via controller without subprocess metadata', async () => {
    daemonState.startDaemon({ source: 'test-stop', manualStart: true })
    adminMetadata.clearDaemonAdminMetadata()

    const stopped = await controller.stopDaemonProcess({ source: 'test-stop', manualStop: true })
    assert.equal(stopped, true)
    assert.equal(daemonState.getDaemonStatus().running, false)
  })
})
