import { NextResponse } from 'next/server'
import {
  isShareLinkActive,
  loadShareLinkByToken,
} from '@/lib/server/sharing/share-link-repository'
import { resolveSharedEntity } from '@/lib/server/sharing/share-resolver'

export const dynamic = 'force-dynamic'

/**
 * Public, unauthenticated fetch of a shared entity by token.
 *
 * Returns the scrubbed payload shape (secrets and credentials are never
 * loaded into the resolver). A 404 is returned for unknown, expired, or
 * revoked tokens to avoid leaking validity to a probe.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const link = loadShareLinkByToken(token)
  if (!link || !isShareLinkActive(link)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const payload = resolveSharedEntity(link)
  if (!payload) {
    return NextResponse.json({ error: 'entity_missing' }, { status: 404 })
  }
  return NextResponse.json({
    share: {
      id: link.id,
      entityType: link.entityType,
      label: link.label,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
    },
    payload,
  })
}
