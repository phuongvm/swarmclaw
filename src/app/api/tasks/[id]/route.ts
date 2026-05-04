import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { notFound } from '@/lib/server/collection-helpers'
import { loadTask } from '@/lib/server/tasks/task-repository'
import {
  archiveTaskFromRoute,
  prepareTasksForListing,
  updateTaskFromRoute,
} from '@/lib/server/tasks/task-route-service'
import { TaskUpdateSchema, formatZodError } from '@/lib/validation/schemas'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tasks = prepareTasksForListing()
  if (!tasks[id]) return notFound()
  return NextResponse.json(tasks[id])
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: raw, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const parsed = TaskUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json(formatZodError(parsed.error), { status: 400 })

  const rawKeys = new Set(Object.keys(raw ?? {}))
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (rawKeys.has(key)) body[key] = value
  }

  const result = updateTaskFromRoute(id, body)
  if (!result.ok && result.status === 404) return notFound()
  return result.ok
    ? NextResponse.json(result.payload)
    : NextResponse.json(result.payload, { status: result.status })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!loadTask(id)) return notFound()
  const result = archiveTaskFromRoute(id)
  if (!result.ok) return notFound()
  return NextResponse.json(result.payload)
}
