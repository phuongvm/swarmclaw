import { NextResponse } from 'next/server'
import { getUnifiedRunById } from '@/lib/server/runs/unified-run-queries'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = getUnifiedRunById(id)
  if (run) return NextResponse.json(run)
  return NextResponse.json({ error: 'Run not found' }, { status: 404 })
}
