import type { UsageRecord } from '@/types'
import { loadUsage } from './usage-repository'

export interface BillingCodeRollup {
  code: string
  costUsd: number
  tokens: number
  records: number
  byAgent: Record<string, { costUsd: number; tokens: number; records: number }>
}

export interface CostAttributionQuery {
  /** Restrict to these codes; empty/undefined returns all observed codes. */
  codes?: string[]
  /** Inclusive lower bound (ms). */
  sinceMs?: number
  /** Exclusive upper bound (ms). */
  untilMs?: number
}

/**
 * Aggregates usage records by billing code. Codes attached to records via
 * UsageRecord.billingCodes (set when usage is appended for a session/mission/task
 * that carried billing tags). A single record can roll up to multiple codes.
 */
export function rollupCostByBillingCode(query: CostAttributionQuery = {}): BillingCodeRollup[] {
  const filter = query.codes && query.codes.length ? new Set(query.codes) : null
  const sinceMs = typeof query.sinceMs === 'number' ? query.sinceMs : 0
  const untilMs = typeof query.untilMs === 'number' ? query.untilMs : Number.POSITIVE_INFINITY
  const usage = loadUsage()
  const rollups = new Map<string, BillingCodeRollup>()

  for (const records of Object.values(usage)) {
    if (!Array.isArray(records)) continue
    for (const record of records) {
      const r = record as UsageRecord
      const codes = Array.isArray(r?.billingCodes) ? r.billingCodes : []
      if (!codes.length) continue
      const ts = typeof r.timestamp === 'number' ? r.timestamp : 0
      if (ts < sinceMs || ts >= untilMs) continue
      const cost = typeof r.estimatedCost === 'number' && Number.isFinite(r.estimatedCost) ? r.estimatedCost : 0
      const tokens = typeof r.totalTokens === 'number' && Number.isFinite(r.totalTokens) ? r.totalTokens : 0
      for (const code of codes) {
        if (typeof code !== 'string' || !code.trim()) continue
        const key = code.trim()
        if (filter && !filter.has(key)) continue
        let bucket = rollups.get(key)
        if (!bucket) {
          bucket = { code: key, costUsd: 0, tokens: 0, records: 0, byAgent: {} }
          rollups.set(key, bucket)
        }
        bucket.costUsd += cost
        bucket.tokens += tokens
        bucket.records += 1
        const agentKey = r.agentId || '_unattributed'
        const agentBucket = bucket.byAgent[agentKey] || { costUsd: 0, tokens: 0, records: 0 }
        agentBucket.costUsd += cost
        agentBucket.tokens += tokens
        agentBucket.records += 1
        bucket.byAgent[agentKey] = agentBucket
      }
    }
  }

  return Array.from(rollups.values()).sort((a, b) => b.costUsd - a.costUsd)
}

/**
 * Lists all unique billing codes observed in usage history.
 */
export function listObservedBillingCodes(): string[] {
  const codes = new Set<string>()
  const usage = loadUsage()
  for (const records of Object.values(usage)) {
    if (!Array.isArray(records)) continue
    for (const record of records) {
      const r = record as UsageRecord
      if (!Array.isArray(r?.billingCodes)) continue
      for (const code of r.billingCodes) {
        if (typeof code === 'string' && code.trim()) codes.add(code.trim())
      }
    }
  }
  return Array.from(codes).sort()
}
