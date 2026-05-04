import { getMission, listMissionReports } from '@/lib/server/missions/mission-repository'
import { loadProtocolRunById } from '@/lib/server/protocols/protocol-queries'
import { listShareLinks, type ShareLink } from '@/lib/server/sharing/share-link-repository'
import { loadTask } from '@/lib/server/tasks/task-repository'
import { getUnifiedRunById, listUnifiedRunEvents } from '@/lib/server/runs/unified-run-queries'
import type {
  BoardTask,
  EvidenceArtifact,
  KnowledgeCitation,
  Mission,
  MissionReport,
  ProtocolRun,
  RunEventRecord,
  SessionRunRecord,
} from '@/types'

const MAX_PREVIEW = 360

function compactText(value: string | null | undefined, maxChars = MAX_PREVIEW): string | null {
  const text = (value || '').split(/\s+/).filter(Boolean).join(' ').trim()
  if (!text) return null
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}...` : text
}

function fileServeUrl(filePath: string): string {
  return `/api/files/serve?path=${encodeURIComponent(filePath)}`
}

function addUnique(items: EvidenceArtifact[], item: EvidenceArtifact, seen: Set<string>): void {
  const key = `${item.kind}:${item.id}`
  if (seen.has(key)) return
  seen.add(key)
  items.push(item)
}

function artifactsForTask(task: BoardTask, seen: Set<string>): EvidenceArtifact[] {
  const items: EvidenceArtifact[] = []
  for (const artifact of task.artifacts || []) {
    addUnique(items, {
      id: `${task.id}:${artifact.filename}`,
      kind: 'task_artifact',
      title: artifact.filename || artifact.type,
      description: `${artifact.type} artifact from task ${task.title}`,
      url: artifact.url,
      createdAt: task.completedAt || task.updatedAt || task.createdAt,
      source: { type: 'task', id: task.id, label: task.title },
    }, seen)
  }
  for (const outputPath of task.outputFiles || []) {
    addUnique(items, {
      id: `${task.id}:output:${outputPath}`,
      kind: 'task_output',
      title: outputPath.split('/').pop() || outputPath,
      description: 'Task output file',
      url: fileServeUrl(outputPath),
      createdAt: task.completedAt || task.updatedAt || task.createdAt,
      source: { type: 'task', id: task.id, label: task.title },
    }, seen)
  }
  if (task.completionReportPath) {
    addUnique(items, {
      id: `${task.id}:completion-report`,
      kind: 'completion_report',
      title: 'Completion report',
      description: task.completionReportPath,
      url: fileServeUrl(task.completionReportPath),
      createdAt: task.completedAt || task.updatedAt || task.createdAt,
      source: { type: 'task', id: task.id, label: task.title },
    }, seen)
  }
  if (task.file) {
    addUnique(items, {
      id: `${task.id}:source-file`,
      kind: 'task_output',
      title: task.file.split('/').pop() || task.file,
      description: 'Linked task file',
      url: fileServeUrl(task.file),
      createdAt: task.updatedAt || task.createdAt,
      source: { type: 'task', id: task.id, label: task.title },
    }, seen)
  }
  if (task.result) {
    addUnique(items, {
      id: `${task.id}:result`,
      kind: 'task_result',
      title: 'Task result',
      preview: compactText(task.result),
      createdAt: task.completedAt || task.updatedAt || task.createdAt,
      source: { type: 'task', id: task.id, label: task.title },
    }, seen)
  }
  return items
}

function artifactsForProtocolRun(run: ProtocolRun, seen: Set<string>): EvidenceArtifact[] {
  const items: EvidenceArtifact[] = []
  for (const artifact of run.artifacts || []) {
    addUnique(items, {
      id: artifact.id,
      kind: 'protocol_artifact',
      title: artifact.title || artifact.kind,
      description: artifact.kind,
      preview: compactText(artifact.content),
      createdAt: artifact.createdAt,
      source: { type: 'protocol', id: run.id, label: run.title || run.templateName },
    }, seen)
  }
  return items
}

function citationArtifact(run: SessionRunRecord, event: RunEventRecord, citation: KnowledgeCitation): EvidenceArtifact {
  return {
    id: `${run.id}:${citation.sourceId}:${citation.chunkId}:${citation.chunkIndex}`,
    kind: 'run_citation',
    title: citation.sourceTitle || citation.sourceLabel || citation.sourceId,
    description: citation.whyMatched || `Citation ${citation.chunkIndex + 1} of ${citation.chunkCount}`,
    preview: compactText(citation.snippet),
    url: citation.sourceUrl || null,
    createdAt: event.timestamp,
    source: { type: 'run', id: run.id, label: run.messagePreview || run.source },
  }
}

function artifactsForRun(run: SessionRunRecord, events: RunEventRecord[], seen: Set<string>): EvidenceArtifact[] {
  const items: EvidenceArtifact[] = []
  if (run.resultPreview) {
    addUnique(items, {
      id: `${run.id}:result`,
      kind: 'run_result',
      title: 'Run result',
      preview: compactText(run.resultPreview),
      createdAt: run.endedAt || run.startedAt || run.queuedAt,
      source: { type: 'run', id: run.id, label: run.messagePreview || run.source },
    }, seen)
  }
  if (run.error) {
    addUnique(items, {
      id: `${run.id}:error`,
      kind: 'run_error',
      title: 'Run error',
      preview: compactText(run.error),
      createdAt: run.endedAt || run.startedAt || run.queuedAt,
      source: { type: 'run', id: run.id, label: run.messagePreview || run.source },
    }, seen)
  }
  for (const event of events) {
    for (const citation of [...(event.citations || []), ...(event.retrievalTrace?.hits || [])]) {
      addUnique(items, citationArtifact(run, event, citation), seen)
    }
  }
  return items
}

function artifactsForMission(mission: Mission, reports: MissionReport[], shareLinks: ShareLink[], seen: Set<string>): EvidenceArtifact[] {
  const items: EvidenceArtifact[] = []
  for (const report of reports) {
    addUnique(items, {
      id: report.id,
      kind: 'mission_report',
      title: report.title,
      description: `${report.format} report`,
      preview: compactText(report.body),
      createdAt: report.generatedAt,
      source: { type: 'mission', id: mission.id, label: mission.title },
    }, seen)
  }
  for (const milestone of mission.milestones || []) {
    if (!milestone.evidence?.length) continue
    addUnique(items, {
      id: milestone.id,
      kind: 'mission_milestone',
      title: milestone.summary,
      description: milestone.kind,
      preview: milestone.evidence.join('\n'),
      createdAt: milestone.at,
      source: { type: 'mission', id: mission.id, label: mission.title },
    }, seen)
  }
  for (const link of shareLinks.filter((entry) => entry.entityType === 'mission' && entry.entityId === mission.id)) {
    addUnique(items, {
      id: link.id,
      kind: 'share_link',
      title: link.label || 'Mission share link',
      description: link.revokedAt ? 'Revoked public share' : 'Active public share',
      href: `/s/${link.token}`,
      createdAt: link.createdAt,
      source: { type: 'share', id: link.id, label: mission.title },
    }, seen)
  }
  return items
}

export function buildEvidenceArtifactsFromRecords(input: {
  run?: SessionRunRecord | null
  runEvents?: RunEventRecord[]
  protocolRun?: ProtocolRun | null
  task?: BoardTask | null
  mission?: Mission | null
  missionReports?: MissionReport[]
  shareLinks?: ShareLink[]
}): EvidenceArtifact[] {
  const seen = new Set<string>()
  const items: EvidenceArtifact[] = []
  if (input.run) {
    for (const item of artifactsForRun(input.run, input.runEvents || [], seen)) items.push(item)
  }
  if (input.protocolRun) {
    for (const item of artifactsForProtocolRun(input.protocolRun, seen)) items.push(item)
  }
  if (input.task) {
    for (const item of artifactsForTask(input.task, seen)) items.push(item)
  }
  if (input.mission) {
    for (const item of artifactsForMission(input.mission, input.missionReports || [], input.shareLinks || [], seen)) items.push(item)
  }
  return items.sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
}

export function listEvidenceArtifacts(params: {
  runId?: string | null
  missionId?: string | null
  taskId?: string | null
  mission?: Mission | null
}): EvidenceArtifact[] {
  const run = params.runId ? getUnifiedRunById(params.runId) : null
  const runEvents = params.runId && run ? listUnifiedRunEvents(params.runId, 300) : []
  const protocolRun = params.runId ? loadProtocolRunById(params.runId) : null
  const protocolTask = protocolRun?.taskId ? loadTask(protocolRun.taskId) : null
  const task = params.taskId ? loadTask(params.taskId) : protocolTask
  const mission = params.mission || (params.missionId ? getMission(params.missionId) : null)

  return buildEvidenceArtifactsFromRecords({
    run,
    runEvents,
    protocolRun,
    task,
    mission,
    missionReports: params.missionId ? listMissionReports(params.missionId, 20) : [],
    shareLinks: params.missionId ? listShareLinks() : [],
  })
}
