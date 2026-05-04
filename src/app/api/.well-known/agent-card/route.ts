import { NextResponse } from 'next/server'
import { buildAgentCardDiscoveryPayload } from '@/lib/a2a/agent-card'

export const dynamic = 'force-dynamic'

/**
 * GET /api/.well-known/agent-card?agentId=xxx
 *
 * Back-compatible A2A Agent Card discovery endpoint. The canonical public
 * well-known URL is implemented at /.well-known/agent-card.json.
 */
export async function GET(req: Request) {
  const { body, status } = buildAgentCardDiscoveryPayload(req)
  return NextResponse.json(body, { status })
}
