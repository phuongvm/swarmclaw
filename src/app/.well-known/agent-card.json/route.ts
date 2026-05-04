import { NextResponse } from 'next/server'
import { buildAgentCardDiscoveryPayload } from '@/lib/a2a/agent-card'

export const dynamic = 'force-dynamic'

/**
 * GET /.well-known/agent-card.json?agentId=xxx
 *
 * Canonical public A2A Agent Card discovery endpoint. If agentId is omitted,
 * returns a directory of discoverable local SwarmClaw agents.
 */
export async function GET(req: Request) {
  const { body, status } = buildAgentCardDiscoveryPayload(req)
  return NextResponse.json(body, { status })
}
