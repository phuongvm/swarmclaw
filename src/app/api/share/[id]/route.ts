import { NextResponse } from 'next/server'
import {
  loadShareLinkById,
  revokeShareLink,
  deleteShareLink,
} from '@/lib/server/sharing/share-link-repository'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const link = loadShareLinkById(id)
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(link)
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const hard = searchParams.get('hard') === 'true'
  if (hard) {
    deleteShareLink(id)
    return NextResponse.json({ ok: true, deleted: true })
  }
  const revoked = revokeShareLink(id)
  if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(revoked)
}
