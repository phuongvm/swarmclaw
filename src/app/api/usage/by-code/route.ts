import { NextResponse } from 'next/server'
import { listObservedBillingCodes, rollupCostByBillingCode } from '@/lib/server/usage/cost-attribution'

export const dynamic = 'force-dynamic'

const RANGE_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': Number.POSITIVE_INFINITY,
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const codesParam = searchParams.get('codes')
  const codes = codesParam
    ? codesParam.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined
  const rangeParam = searchParams.get('range') ?? 'all'
  const rangeMs = RANGE_MS[rangeParam] ?? Number.POSITIVE_INFINITY
  const sinceMs = Number.isFinite(rangeMs) ? Date.now() - rangeMs : 0

  const rollups = rollupCostByBillingCode({ codes, sinceMs })
  const observed = listObservedBillingCodes()

  return NextResponse.json({
    range: rangeParam,
    codes: codes ?? null,
    rollups,
    observedCodes: observed,
  })
}
