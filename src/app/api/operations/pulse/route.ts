import { NextResponse } from 'next/server'
import { getOperationPulse, normalizeOperationPulseRange } from '@/lib/server/operations/operation-pulse'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return NextResponse.json(getOperationPulse(normalizeOperationPulseRange(searchParams.get('range'))))
}
