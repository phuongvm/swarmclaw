import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { BoardTask, KnowledgeCitation, Mission, MissionReport, ProtocolRun, RunEventRecord, SessionRunRecord } from '@/types'
import type { ShareLink } from '@/lib/server/sharing/share-link-repository'

test('buildEvidenceArtifactsFromRecords merges run, task, protocol, mission, and share evidence', async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-artifacts-'))
  process.env.ACCESS_KEY = 'test-key'
  process.env.CREDENTIAL_SECRET = 'test-secret-32-characters-long!!'

  const { buildEvidenceArtifactsFromRecords } = await import('./artifact-resolver')
  const run: SessionRunRecord = {
    id: 'run_1',
    sessionId: 'sess_1',
    source: 'chat',
    internal: false,
    mode: 'direct',
    status: 'completed',
    messagePreview: 'Release QA',
    queuedAt: 1000,
    endedAt: 5000,
    resultPreview: 'QA finished.',
  }
  const citation: KnowledgeCitation = {
    sourceId: 'source_1',
    sourceTitle: 'Runbook',
    sourceKind: 'manual',
    sourceUrl: 'https://example.test/runbook',
    sourceLabel: null,
    chunkId: 'chunk_1',
    chunkIndex: 0,
    chunkCount: 1,
    charStart: 0,
    charEnd: 10,
    sectionLabel: null,
    snippet: 'Attach evidence.',
    whyMatched: null,
    score: 0.8,
  }
  const events: RunEventRecord[] = [{
    id: 'event_1',
    runId: 'run_1',
    sessionId: 'sess_1',
    timestamp: 4000,
    phase: 'event',
    event: { t: 'md', text: 'cited' },
    citations: [citation],
  }]
  const protocolRun = {
    id: 'protocol_1',
    title: 'Protocol',
    templateName: 'Template',
    artifacts: [{ id: 'artifact_1', kind: 'summary', title: 'Summary', content: 'Structured output.', createdAt: 3000 }],
  } as ProtocolRun
  const task = {
    id: 'task_1',
    title: 'Build package',
    description: '',
    status: 'completed',
    agentId: 'agent_1',
    createdAt: 1000,
    updatedAt: 3500,
    completedAt: 3500,
    outputFiles: ['dist/report.md'],
    completionReportPath: 'reports/task.md',
    result: 'Package built.',
  } as BoardTask
  const mission = {
    id: 'mission_1',
    title: 'Mission',
    goal: 'Ship',
    status: 'completed',
    milestones: [{ id: 'ms_1', at: 4500, kind: 'completed', summary: 'Done', evidence: ['run_1'] }],
  } as Mission
  const report = { id: 'report_1', missionId: 'mission_1', title: 'Report', body: 'Launch report.', format: 'markdown', generatedAt: 6000 } as MissionReport
  const share = { id: 'share_1', token: 'token_1', entityType: 'mission', entityId: 'mission_1', label: 'Public report', createdAt: 6500, expiresAt: null, revokedAt: null } as ShareLink

  const artifacts = buildEvidenceArtifactsFromRecords({
    run,
    runEvents: events,
    protocolRun,
    task,
    mission,
    missionReports: [report],
    shareLinks: [share],
  })

  assert.deepEqual(
    artifacts.map((artifact) => artifact.kind),
    ['share_link', 'mission_report', 'run_result', 'mission_milestone', 'run_citation', 'task_output', 'completion_report', 'task_result', 'protocol_artifact'],
  )
  assert.equal(artifacts.find((artifact) => artifact.kind === 'run_citation')?.url, 'https://example.test/runbook')
  assert.equal(artifacts.find((artifact) => artifact.kind === 'task_output')?.url, '/api/files/serve?path=dist%2Freport.md')
})
