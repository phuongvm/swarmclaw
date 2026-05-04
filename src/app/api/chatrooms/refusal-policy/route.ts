import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { setChatroomRefusalPolicy, handleAgentRefusal } from '@/lib/server/chatrooms/chatroom-refusal'

export const dynamic = 'force-dynamic'

const VALID_POLICIES = new Set(['reroute', 'escalate', 'human'])

export async function POST(req: Request) {
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const chatroomId = typeof body?.chatroomId === 'string' ? body.chatroomId : null
  const policy = typeof body?.policy === 'string' ? body.policy : null
  if (!chatroomId) return NextResponse.json({ error: 'chatroomId required' }, { status: 400 })
  if (!policy || !VALID_POLICIES.has(policy)) {
    return NextResponse.json({ error: 'policy must be reroute|escalate|human' }, { status: 400 })
  }
  const escalationTargetAgentId = typeof body?.escalationTargetAgentId === 'string'
    ? body.escalationTargetAgentId
    : null
  const room = setChatroomRefusalPolicy(
    chatroomId,
    policy as 'reroute' | 'escalate' | 'human',
    escalationTargetAgentId,
  )
  if (!room) return NextResponse.json({ error: 'chatroom not found' }, { status: 404 })
  return NextResponse.json({ chatroom: room })
}

export async function PUT(req: Request) {
  // Trigger a refusal handling decision (used by agent runtime + tests).
  const { data: body, error } = await safeParseBody(req)
  if (error) return error
  const chatroomId = typeof body?.chatroomId === 'string' ? body.chatroomId : null
  const refusingAgentId = typeof body?.refusingAgentId === 'string' ? body.refusingAgentId : null
  const taskOrTopic = typeof body?.taskOrTopic === 'string' ? body.taskOrTopic : ''
  const reason = typeof body?.reason === 'string' ? body.reason : 'unspecified'
  if (!chatroomId || !refusingAgentId) {
    return NextResponse.json({ error: 'chatroomId and refusingAgentId required' }, { status: 400 })
  }
  const decision = handleAgentRefusal({ chatroomId, refusingAgentId, taskOrTopic, reason })
  return NextResponse.json({ decision })
}
