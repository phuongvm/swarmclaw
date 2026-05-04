import { NextResponse } from 'next/server'
import { buildRunBrief } from '@/lib/server/runs/run-brief'
import { getUnifiedRunById, listUnifiedRunEvents } from '@/lib/server/runs/unified-run-queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = getUnifiedRunById(id)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  return NextResponse.json(buildRunBrief(run, listUnifiedRunEvents(id, 300)))
}
