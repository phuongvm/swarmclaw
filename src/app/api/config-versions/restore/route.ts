import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { getVersion } from '@/lib/server/config-versions/config-version-repository'
import { updateAgent } from '@/lib/server/agents/agent-service'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const versionId = typeof body?.versionId === 'string' ? body.versionId : null
  if (!versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 })

  const version = getVersion(versionId)
  if (!version) return NextResponse.json({ error: 'version not found' }, { status: 404 })

  if (version.entityKind === 'agent') {
    const restored = updateAgent(version.entityId, version.snapshot)
    if (!restored) return NextResponse.json({ error: 'agent not found' }, { status: 404 })
    return NextResponse.json({ ok: true, restored: { kind: 'agent', id: version.entityId } })
  }

  return NextResponse.json({
    error: `Restore not yet implemented for kind=${version.entityKind}`,
  }, { status: 501 })
}
