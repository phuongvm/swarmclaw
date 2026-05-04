import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createShareLink,
  listShareLinks,
  type ShareEntityType,
} from '@/lib/server/sharing/share-link-repository'
import { errorMessage } from '@/lib/shared-utils'

export const dynamic = 'force-dynamic'

const MintSchema = z.object({
  entityType: z.enum(['mission', 'skill', 'session']),
  entityId: z.string().min(1),
  expiresInSec: z.number().int().positive().nullable().optional(),
  label: z.string().trim().max(120).nullable().optional(),
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType') as ShareEntityType | null
  const entityId = searchParams.get('entityId')

  let links = listShareLinks()
  if (entityType) links = links.filter((l) => l.entityType === entityType)
  if (entityId) links = links.filter((l) => l.entityId === entityId)

  // Newest first
  links.sort((a, b) => b.createdAt - a.createdAt)
  return NextResponse.json(links)
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json()
    const parsed = MintSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 },
      )
    }
    const link = createShareLink({
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      expiresInSec: parsed.data.expiresInSec ?? null,
      label: parsed.data.label ?? null,
    })
    return NextResponse.json(link)
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}
