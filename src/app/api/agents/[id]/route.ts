import { NextResponse } from 'next/server'
import { notFound } from '@/lib/server/collection-helpers'
import { trashAgent, updateAgent } from '@/lib/server/agents/agent-service'
import { loadAgent } from '@/lib/server/agents/agent-repository'
import { notify } from '@/lib/server/ws-hub'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { AgentUpdateSchema, formatZodError } from '@/lib/validation/schemas'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agent = loadAgent(id)
  if (!agent) return notFound()
  return NextResponse.json(agent)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: raw, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const parsed = AgentUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json(formatZodError(parsed.error), { status: 400 })

  // Filter to keys actually present in the raw body — zod re-applies `.default(...)`
  // to absent fields, which would clobber untouched fields on the stored agent.
  const rawKeys = new Set(Object.keys(raw ?? {}))
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (rawKeys.has(key)) body[key] = value
  }

  const result = updateAgent(id, body)
  if (!result) return notFound()
  return NextResponse.json(result)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = trashAgent(id)
  if (!result.ok) return notFound()
  const { detachedSessions, cascade } = result
  if (cascade.tasks) notify('tasks')
  if (cascade.schedules) notify('schedules')
  if (cascade.connectors) notify('connectors')
  if (cascade.webhooks) notify('webhooks')
  if (cascade.chatrooms) notify('chatrooms')

  return NextResponse.json({ ok: true, detachedSessions, ...cascade })
}
