import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildRunBrief } from './run-brief'
import type { KnowledgeCitation, RunEventRecord, SessionRunRecord } from '@/types'

function run(overrides: Partial<SessionRunRecord>): SessionRunRecord {
  return {
    id: overrides.id || 'run_1',
    sessionId: overrides.sessionId || 'sess_1',
    source: overrides.source || 'chat',
    internal: overrides.internal ?? false,
    mode: overrides.mode || 'direct',
    status: overrides.status || 'completed',
    messagePreview: overrides.messagePreview || 'Review release evidence',
    queuedAt: overrides.queuedAt ?? 1000,
    ...overrides,
  }
}

function citation(overrides: Partial<KnowledgeCitation> = {}): KnowledgeCitation {
  return {
    sourceId: overrides.sourceId || 'source_1',
    sourceTitle: overrides.sourceTitle || 'Release checklist',
    sourceKind: overrides.sourceKind || 'manual',
    sourceUrl: overrides.sourceUrl ?? 'https://example.test/checklist',
    sourceLabel: overrides.sourceLabel ?? null,
    chunkId: overrides.chunkId || 'chunk_1',
    chunkIndex: overrides.chunkIndex ?? 0,
    chunkCount: overrides.chunkCount ?? 2,
    charStart: overrides.charStart ?? 0,
    charEnd: overrides.charEnd ?? 120,
    sectionLabel: overrides.sectionLabel ?? null,
    snippet: overrides.snippet || 'Run release QA and attach the verification evidence.',
    whyMatched: overrides.whyMatched ?? null,
    score: overrides.score ?? 0.92,
  }
}

function event(overrides: Partial<RunEventRecord>): RunEventRecord {
  return {
    id: overrides.id || 'event_1',
    runId: overrides.runId || 'run_1',
    sessionId: overrides.sessionId || 'sess_1',
    timestamp: overrides.timestamp ?? 2000,
    phase: overrides.phase || 'event',
    status: overrides.status,
    summary: overrides.summary,
    event: overrides.event || { t: 'md', text: 'Collected evidence.' },
    citations: overrides.citations,
    retrievalTrace: overrides.retrievalTrace,
  }
}

describe('buildRunBrief', () => {
  it('summarizes objective, timeline, usage, and citations', () => {
    const brief = buildRunBrief(
      run({
        startedAt: 1500,
        endedAt: 3000,
        resultPreview: 'Release QA completed with two attached artifacts.',
        totalInputTokens: 100,
        totalOutputTokens: 50,
        estimatedCost: 0.012,
        retrievalSummary: { citationCount: 1, sourceIds: ['source_1'] },
      }),
      [
        event({ id: 'started', phase: 'status', status: 'running', timestamp: 1500, summary: 'Started' }),
        event({ id: 'done', phase: 'status', status: 'completed', timestamp: 3000, citations: [citation()] }),
      ],
      4000,
    )

    assert.equal(brief.runId, 'run_1')
    assert.equal(brief.objective, 'Review release evidence')
    assert.equal(brief.result, 'Release QA completed with two attached artifacts.')
    assert.deepEqual(brief.usage.sourceIds, ['source_1'])
    assert.equal(brief.usage.estimatedCost, 0.012)
    assert.deepEqual(brief.timeline.map((item) => item.status), ['queued', 'running', 'running', 'completed', 'completed'])
    assert.equal(brief.evidence[0].title, 'Release checklist')
    assert.equal(brief.evidence[0].url, 'https://example.test/checklist')
  })

  it('flags failed and long-running runs for operator review', () => {
    const failed = buildRunBrief(run({ status: 'failed', error: 'Provider timed out.', endedAt: 4000 }), [], 5000)
    assert.ok(failed.warnings.some((warning) => warning.includes('failed')))
    assert.ok(failed.warnings.some((warning) => warning.includes('No replay events')))

    const running = buildRunBrief(run({ status: 'running', startedAt: 1000 }), [], 1_900_000)
    assert.ok(running.warnings.some((warning) => warning.includes('30 minutes')))
  })
})
