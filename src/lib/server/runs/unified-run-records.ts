import type { ProtocolRun, ProtocolRunEvent, RunEventRecord, SessionRunRecord, SessionRunStatus } from '@/types'

function mapProtocolStatus(status: ProtocolRun['status']): SessionRunStatus {
  switch (status) {
    case 'draft':
      return 'queued'
    case 'running':
    case 'waiting':
    case 'paused':
      return 'running'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
    case 'archived':
      return 'cancelled'
    default:
      return 'queued'
  }
}

function buildProtocolMessagePreview(run: ProtocolRun): string {
  return (
    run.title
    || run.config?.goal
    || run.config?.kickoffMessage
    || run.templateName
    || 'Structured session run'
  )
}

function buildProtocolResultPreview(run: ProtocolRun): string {
  const summary = typeof run.summary === 'string' ? run.summary.trim() : ''
  if (summary) return summary
  const latestArtifact = Array.isArray(run.artifacts)
    ? [...run.artifacts].sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))[0]
    : null
  const artifactContent = typeof latestArtifact?.content === 'string' ? latestArtifact.content.trim() : ''
  if (artifactContent) return artifactContent
  return ''
}

export function protocolRunToSessionRunRecord(run: ProtocolRun): SessionRunRecord {
  return {
    id: run.id,
    sessionId: run.sessionId || run.transcriptChatroomId || `protocol-run:${run.id}`,
    kind: 'protocol_step',
    ownerType: 'protocol_run',
    ownerId: run.id,
    source: run.sourceRef.kind === 'schedule' ? 'structured schedule' : 'structured session',
    internal: run.systemOwned === true,
    mode: run.templateId,
    status: mapProtocolStatus(run.status),
    messagePreview: buildProtocolMessagePreview(run),
    queuedAt: run.createdAt,
    startedAt: run.startedAt || undefined,
    endedAt: run.endedAt || run.archivedAt || undefined,
    error: run.lastError || undefined,
    resultPreview: buildProtocolResultPreview(run) || undefined,
  }
}

export function protocolEventToRunEventRecord(run: ProtocolRun, event: ProtocolRunEvent): RunEventRecord {
  const status = event.type === 'failed'
    ? 'failed'
    : event.type === 'completed'
      ? 'completed'
      : event.type === 'cancelled'
        ? 'cancelled'
        : event.type === 'created'
          ? 'queued'
          : undefined
  return {
    id: event.id,
    runId: run.id,
    sessionId: run.sessionId || run.transcriptChatroomId || `protocol-run:${run.id}`,
    kind: 'protocol_step',
    ownerType: 'protocol_run',
    ownerId: run.id,
    timestamp: event.createdAt,
    phase: status ? 'status' : 'event',
    status,
    summary: event.summary,
    event: {
      t: status === 'failed' ? 'err' : status ? 'status' : 'md',
      text: event.summary,
    },
    citations: event.citations,
  }
}
