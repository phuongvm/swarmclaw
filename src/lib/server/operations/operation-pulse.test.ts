import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildOperationPulse, normalizeOperationPulseRange } from './operation-pulse'
import type { ApprovalRequest, Connector, Mission, SessionRunRecord } from '@/types'

const now = 10_000_000

function run(overrides: Partial<SessionRunRecord>): SessionRunRecord {
  return {
    id: overrides.id || 'run_1',
    sessionId: overrides.sessionId || 'sess_1',
    source: overrides.source || 'chat',
    internal: false,
    mode: 'direct',
    status: overrides.status || 'completed',
    messagePreview: overrides.messagePreview || 'Run',
    queuedAt: overrides.queuedAt ?? now - 1000,
    ...overrides,
  }
}

function mission(overrides: Partial<Mission>): Mission {
  return {
    id: overrides.id || 'mission_1',
    title: overrides.title || 'Release QA',
    goal: overrides.goal || 'Verify release',
    successCriteria: overrides.successCriteria || [],
    rootSessionId: overrides.rootSessionId || 'sess_1',
    agentIds: overrides.agentIds || [],
    status: overrides.status || 'running',
    budget: overrides.budget || { maxUsd: 10 },
    usage: overrides.usage || {
      usdSpent: 9,
      tokensUsed: 0,
      toolCallsUsed: 0,
      turnsRun: 3,
      wallclockMsElapsed: 0,
      startedAt: now - 60_000,
      lastUpdatedAt: now,
      warnFractionsHit: [],
    },
    milestones: overrides.milestones || [],
    reportSchedule: null,
    reportConnectorIds: [],
    createdAt: overrides.createdAt ?? now - 5000,
    updatedAt: overrides.updatedAt ?? now - 1000,
    ...overrides,
  }
}

function approval(overrides: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: overrides.id || 'approval_1',
    category: overrides.category || 'human_loop',
    title: overrides.title || 'Approve tool use',
    data: {},
    createdAt: overrides.createdAt ?? now - 3000,
    updatedAt: overrides.updatedAt ?? now - 3000,
    status: overrides.status || 'pending',
    ...overrides,
  }
}

function connector(overrides: Partial<Connector>): Connector {
  return {
    id: overrides.id || 'conn_1',
    name: overrides.name || 'Slack',
    platform: overrides.platform || 'slack',
    agentId: overrides.agentId,
    chatroomId: overrides.chatroomId,
    credentialId: overrides.credentialId,
    config: overrides.config || {},
    isEnabled: overrides.isEnabled ?? true,
    status: overrides.status || 'stopped',
    lastError: overrides.lastError,
    createdAt: overrides.createdAt ?? now - 4000,
    updatedAt: overrides.updatedAt ?? now - 2000,
  }
}

describe('operation pulse', () => {
  it('normalizes unsupported ranges to the 24-hour default', () => {
    assert.equal(normalizeOperationPulseRange('7d'), '7d')
    assert.equal(normalizeOperationPulseRange('30d'), '24h')
    assert.equal(normalizeOperationPulseRange(null), '24h')
  })

  it('combines failed runs, approvals, connector readiness, and budget pressure', () => {
    const pulse = buildOperationPulse({
      range: '24h',
      now,
      missions: [mission({})],
      runs: [run({ id: 'failed', status: 'failed', error: 'bad', endedAt: now - 100 }), run({ id: 'running', status: 'running' })],
      approvals: [approval({ category: 'budget_change' })],
      connectors: [connector({ lastError: 'token rejected' })],
    })

    assert.equal(pulse.kpis.activeMissions, 1)
    assert.equal(pulse.kpis.runningRuns, 1)
    assert.equal(pulse.kpis.failedRuns, 1)
    assert.equal(pulse.kpis.pendingApprovals, 1)
    assert.equal(pulse.kpis.connectorAttention, 1)
    assert.equal(pulse.kpis.budgetWarnings, 1)
    assert.deepEqual(pulse.actions.slice(0, 3).map((action) => action.severity), ['high', 'high', 'high'])
    assert.ok(pulse.actions.some((action) => action.kind === 'budget' && action.summary.includes('90%')))
  })
})
