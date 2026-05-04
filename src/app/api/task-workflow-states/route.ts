import { NextResponse } from 'next/server'
import { genId } from '@/lib/id'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import {
  deleteWorkflowState,
  listWorkflowStates,
  resetWorkflowStatesToDefaults,
  upsertWorkflowState,
} from '@/lib/server/tasks/workflow-state-repository'
import type { WorkflowState, WorkflowStateCategory } from '@/types/workflow-state'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = new Set<WorkflowStateCategory>([
  'triage', 'backlog', 'unstarted', 'started', 'completed', 'cancelled',
])

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const states = listWorkflowStates(
    projectId ? { projectId } : undefined,
  )
  return NextResponse.json({ states })
}

export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const label = asString(body?.label)
  const categoryRaw = asString(body?.category) as WorkflowStateCategory | null
  if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 })
  if (!categoryRaw || !VALID_CATEGORIES.has(categoryRaw)) {
    return NextResponse.json({ error: 'category must be one of triage|backlog|unstarted|started|completed|cancelled' }, { status: 400 })
  }
  const id = asString(body?.id) || genId()
  const now = Date.now()
  const state: WorkflowState = {
    id,
    label,
    category: categoryRaw,
    projectId: asString(body?.projectId),
    color: asString(body?.color),
    position: typeof body?.position === 'number' ? body.position : undefined,
    autoArchiveAfterDays: typeof body?.autoArchiveAfterDays === 'number' ? body.autoArchiveAfterDays : null,
    createdAt: now,
    updatedAt: now,
  }
  const saved = upsertWorkflowState(state)
  return NextResponse.json({ state: saved })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (id) {
    const removed = deleteWorkflowState(id)
    return NextResponse.json({ ok: removed })
  }
  if (searchParams.get('reset') === 'true') {
    resetWorkflowStatesToDefaults()
    return NextResponse.json({ ok: true, reset: true })
  }
  return NextResponse.json({ error: 'id or reset=true required' }, { status: 400 })
}
