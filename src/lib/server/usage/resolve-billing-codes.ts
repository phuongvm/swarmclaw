import type { Session } from '@/types'
import { getMission } from '@/lib/server/missions/mission-repository'

/**
 * Resolves the billing codes that should attach to a usage record produced by
 * the given session. Combines the session's own codes with any inherited from
 * its mission. Caller may add task codes when writing a task-driven record.
 */
export function resolveBillingCodesForSession(session: Session | null | undefined): string[] {
  if (!session) return []
  const set = new Set<string>()
  for (const code of session.billingCodes ?? []) {
    if (typeof code === 'string' && code.trim()) set.add(code.trim())
  }
  if (session.missionId) {
    const mission = getMission(session.missionId)
    for (const code of mission?.billingCodes ?? []) {
      if (typeof code === 'string' && code.trim()) set.add(code.trim())
    }
  }
  return Array.from(set)
}
