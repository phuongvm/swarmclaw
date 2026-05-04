import { NextResponse } from 'next/server'
import { getUnifiedRunById, listUnifiedRunEvents } from '@/lib/server/runs/unified-run-queries'

export const dynamic = 'force-dynamic'

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = getUnifiedRunById(id)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const url = new URL(req.url)
  const limit = parseLimit(url.searchParams.get('limit'))
  return NextResponse.json(listUnifiedRunEvents(id, limit || 200))
}
