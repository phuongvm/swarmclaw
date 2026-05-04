import { NextResponse } from 'next/server'
import { listVersionsForEntity } from '@/lib/server/config-versions/config-version-repository'
import type { VersionedEntityKind } from '@/types/config-version'

export const dynamic = 'force-dynamic'

const VALID_KINDS = new Set<VersionedEntityKind>([
  'agent', 'extension', 'connector', 'mcp_server', 'chatroom', 'project',
])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('entityKind') as VersionedEntityKind | null
  const id = searchParams.get('entityId')
  if (!kind || !VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'entityKind required (agent|extension|connector|mcp_server|chatroom|project)' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'entityId required' }, { status: 400 })
  const versions = listVersionsForEntity(kind, id)
  return NextResponse.json({ versions })
}
