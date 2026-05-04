import { getAgent } from '@/lib/server/agents/agent-repository'
import { checkAgentBudgetLimits } from '@/lib/server/cost'

export interface AgentBudgetHookResult {
  allow: boolean
  reason?: string
}

/**
 * Pure, synchronous check suitable for the hot enqueue path. When an agent has
 * `budgetAction: 'block'` set and any window is exhausted, denies the run
 * before we even queue it. Mirrors `checkMissionBudgetForSession` so autonomous
 * runs can fail fast instead of waiting until chat-turn-preparation.
 *
 * For `budgetAction: 'warn'` (default), always allows — the warn-only behavior
 * is handled later in the turn pipeline so users see a status event.
 */
export function checkAgentBudgetForSession(agentId: string | null | undefined): AgentBudgetHookResult {
  if (!agentId) return { allow: true }
  const agent = getAgent(agentId)
  if (!agent) return { allow: true }
  if ((agent.budgetAction || 'warn') !== 'block') return { allow: true }

  const summary = checkAgentBudgetLimits(agent)
  if (summary.exceeded.length === 0) return { allow: true }

  const blockedMessage = summary.exceeded.map((entry) => entry.message).join(' ')
  return { allow: false, reason: blockedMessage }
}
