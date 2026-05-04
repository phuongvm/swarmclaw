import { loadChatroom, upsertChatroom } from '@/lib/server/chatrooms/chatroom-repository'
import { logActivity } from '@/lib/server/activity/activity-log'
import { requestApproval } from '@/lib/server/approvals'
import { log } from '@/lib/server/logger'
import type { Chatroom } from '@/types'

const TAG = 'chatroom-refusal'

export interface RefusalDecision {
  action: 'reroute' | 'escalate' | 'human' | 'noop'
  /** Agent id to retry the work with, when applicable. */
  nextAgentId?: string | null
  /** Approval id when surfaced to a human. */
  approvalId?: string | null
  reason?: string
}

/**
 * Apply the chatroom's `onRefusal` policy when an assigned agent declines or
 * returns a refusal signal for a delegated work item. Records the decision in
 * the activity log and returns the next action for the caller.
 */
export function handleAgentRefusal(input: {
  chatroomId: string
  refusingAgentId: string
  taskOrTopic: string
  reason: string
}): RefusalDecision {
  const room = loadChatroom(input.chatroomId)
  if (!room) {
    log.warn(TAG, `Refusal received for unknown chatroom ${input.chatroomId}`)
    return { action: 'noop' }
  }

  const policy = room.onRefusal ?? 'reroute'

  if (policy === 'human') {
    const approval = requestApproval({
      category: 'human_loop',
      title: `Chatroom "${room.name}" refusal needs human input`,
      description: `Agent ${input.refusingAgentId} refused work: "${input.taskOrTopic}". Reason: ${input.reason}`,
      data: {
        chatroomId: room.id,
        refusingAgentId: input.refusingAgentId,
        taskOrTopic: input.taskOrTopic,
        reason: input.reason,
      },
    })
    logActivity({
      entityType: 'chatroom',
      entityId: room.id,
      action: 'refusal_escalated_human',
      actor: 'system',
      summary: `Refusal from ${input.refusingAgentId} surfaced as approval ${approval.id}`,
    })
    return { action: 'human', approvalId: approval.id, reason: input.reason }
  }

  if (policy === 'escalate') {
    const target = room.escalationTargetAgentId
    if (target && target !== input.refusingAgentId && room.agentIds.includes(target)) {
      logActivity({
        entityType: 'chatroom',
        entityId: room.id,
        action: 'refusal_escalated',
        actor: 'system',
        summary: `Refusal from ${input.refusingAgentId} escalated to ${target}`,
      })
      return { action: 'escalate', nextAgentId: target, reason: input.reason }
    }
    // Fall through to reroute when no escalation target available.
  }

  // reroute (or escalate fallback): pick any other room member.
  const candidate = room.agentIds.find((id) => id !== input.refusingAgentId)
  if (candidate) {
    logActivity({
      entityType: 'chatroom',
      entityId: room.id,
      action: 'refusal_rerouted',
      actor: 'system',
      summary: `Refusal from ${input.refusingAgentId} rerouted to ${candidate}`,
    })
    return { action: 'reroute', nextAgentId: candidate, reason: input.reason }
  }

  return { action: 'noop', reason: 'no alternative agent available' }
}

/**
 * Sets or updates a chatroom's onRefusal policy and persists the change.
 */
export function setChatroomRefusalPolicy(
  chatroomId: string,
  policy: NonNullable<Chatroom['onRefusal']>,
  escalationTargetAgentId?: string | null,
): Chatroom | null {
  const room = loadChatroom(chatroomId)
  if (!room) return null
  const next: Chatroom = {
    ...room,
    onRefusal: policy,
    escalationTargetAgentId: escalationTargetAgentId ?? room.escalationTargetAgentId ?? null,
    updatedAt: Date.now(),
  }
  upsertChatroom(chatroomId, next)
  return next
}
