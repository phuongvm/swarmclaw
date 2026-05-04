import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { getActiveWorkspace, setActiveWorkspace } from '@/lib/server/workspaces/workspace-registry'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ workspace: getActiveWorkspace() })
}

export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const workspace = setActiveWorkspace(id)
  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  return NextResponse.json({ workspace })
}
