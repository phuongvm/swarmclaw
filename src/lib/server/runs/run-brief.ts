import type { RunBrief, RunBriefEvidenceItem, RunBriefTimelineItem, RunEventRecord, SessionRunRecord } from '@/types'

const MAX_TEXT = 420
const MAX_EVIDENCE = 10
const LONG_RUNNING_MS = 30 * 60_000

function compactText(value: string | null | undefined, maxChars = MAX_TEXT): string | null {
  const text = (value || '').split(/\s+/).filter(Boolean).join(' ').trim()
  if (!text) return null
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}...` : text
}

function timelineItem(label: string, at: number | undefined, status?: RunBriefTimelineItem['status'], detail?: string | null): RunBriefTimelineItem | null {
  if (!at || !Number.isFinite(at)) return null
  return { label, status, at, detail: detail || null }
}

function eventText(event: RunEventRecord): string | null {
  return compactText(event.summary || event.event.text || event.event.toolOutput || event.event.toolName || event.event.t || '')
}

function collectEvidence(events: RunEventRecord[]): RunBriefEvidenceItem[] {
  const evidence: RunBriefEvidenceItem[] = []
  const seen = new Set<string>()
  for (const event of events) {
    const citations = [
      ...(event.citations || []),
      ...(event.retrievalTrace?.hits || []),
    ]
    for (const citation of citations) {
      const id = `${citation.sourceId}:${citation.chunkId}:${citation.chunkIndex}`
      if (seen.has(id)) continue
      seen.add(id)
      evidence.push({
        id,
        kind: event.retrievalTrace?.hits?.includes(citation) ? 'retrieval' : 'citation',
        title: citation.sourceTitle || citation.sourceLabel || citation.sourceId,
        summary: compactText(citation.snippet || citation.whyMatched || '', 240) || 'Referenced knowledge source.',
        url: citation.sourceUrl || null,
        sourceId: citation.sourceId,
        createdAt: event.timestamp,
      })
      if (evidence.length >= MAX_EVIDENCE) return evidence
    }
  }
  for (const event of events) {
    const summary = eventText(event)
    if (!summary) continue
    evidence.push({
      id: event.id,
      kind: 'event',
      title: event.phase === 'status' ? 'Status event' : 'Replay event',
      summary,
      createdAt: event.timestamp,
    })
    if (evidence.length >= MAX_EVIDENCE) return evidence
  }
  return evidence
}

export function buildRunBrief(run: SessionRunRecord, events: RunEventRecord[], now = Date.now()): RunBrief {
  const timeline = [
    timelineItem('Queued', run.queuedAt, 'queued', run.source),
    timelineItem('Started', run.startedAt, 'running'),
    ...events
      .filter((event) => event.phase === 'status' && event.status)
      .map((event) => timelineItem(event.status || 'status', event.timestamp, event.status, eventText(event)))
      .filter((item): item is RunBriefTimelineItem => Boolean(item)),
    timelineItem('Ended', run.endedAt, run.status),
  ]
    .filter((item): item is RunBriefTimelineItem => Boolean(item))
    .sort((left, right) => left.at - right.at)

  const warnings: string[] = []
  if (run.status === 'failed') warnings.push('Run failed and needs review before using the result.')
  if (run.status === 'running' && run.startedAt && now - run.startedAt > LONG_RUNNING_MS) {
    warnings.push('Run has been running longer than 30 minutes.')
  }
  if ((run.status === 'completed' || run.status === 'failed') && events.length === 0) {
    warnings.push('No replay events were persisted for this run.')
  }
  if (run.recoveredFromRestart) warnings.push('Run was recovered after a process restart.')
  if (run.interruptedAt) warnings.push(run.interruptedReason || 'Run was interrupted.')

  return {
    runId: run.id,
    sessionId: run.sessionId,
    title: compactText(run.messagePreview, 120) || run.id,
    objective: compactText(run.messagePreview, 280) || run.mode || run.source,
    status: run.status,
    source: run.source,
    owner: run.ownerType && run.ownerId ? { type: run.ownerType, id: run.ownerId } : null,
    timeline,
    result: compactText(run.resultPreview, 1200),
    error: compactText(run.error, 1200),
    warnings,
    usage: {
      inputTokens: typeof run.totalInputTokens === 'number' ? run.totalInputTokens : null,
      outputTokens: typeof run.totalOutputTokens === 'number' ? run.totalOutputTokens : null,
      estimatedCost: typeof run.estimatedCost === 'number' ? run.estimatedCost : null,
      citationCount: run.retrievalSummary?.citationCount || 0,
      sourceIds: run.retrievalSummary?.sourceIds || [],
    },
    evidence: collectEvidence(events),
    generatedAt: now,
  }
}
