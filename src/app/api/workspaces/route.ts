import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '@/lib/server/workspaces/workspace-registry'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ workspaces: listWorkspaces() })
}

export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const workspace = createWorkspace({
    name,
    description: typeof body?.description === 'string' ? body.description : undefined,
    color: typeof body?.color === 'string' ? body.color : undefined,
  })
  return NextResponse.json({ workspace })
}

export async function PATCH(req: Request) {
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updated = updateWorkspace(id, body as Record<string, unknown>)
  if (!updated) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  return NextResponse.json({ workspace: updated })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const removed = deleteWorkspace(id)
  if (!removed) return NextResponse.json({ error: 'cannot delete default or unknown workspace' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
