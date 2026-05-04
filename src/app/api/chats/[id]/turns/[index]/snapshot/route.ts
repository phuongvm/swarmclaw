import { NextResponse } from 'next/server'
import { getSession } from '@/lib/server/sessions/session-repository'
import { getMessages } from '@/lib/server/messages/message-repository'
import { loadAgent } from '@/lib/server/agents/agent-repository'

export const dynamic = 'force-dynamic'

/**
 * Turn snapshot — returns the input state of the turn at :index so external
 * tools (CLIs, notebooks, comparison harnesses) can replay the same turn
 * against a different model, provider, or system prompt without mutating
 * the original session.
 *
 * Shape is intentionally minimal and stable:
 *  - `userMessage`: the message that opened the turn (text + optional imagePath)
 *  - `priorMessages`: everything before that turn, in order
 *  - `route`: the session's effective provider/model/endpoint at snapshot time
 *  - `agent`: the agent's provider/model/systemPrompt (if bound), for reference
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await ctx.params
  const session = getSession(id)
  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 })
  }

  const i = Number.parseInt(index, 10)
  if (!Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: 'invalid_index' }, { status: 400 })
  }

  const messages = getMessages(id)
  if (i >= messages.length) {
    return NextResponse.json({ error: 'index_out_of_range' }, { status: 404 })
  }

  const target = messages[i]
  if (!target || target.role !== 'user') {
    return NextResponse.json({ error: 'not_a_user_turn' }, { status: 400 })
  }

  const priorMessages = messages.slice(0, i).map((m) => ({
    role: m.role,
    text: m.text || '',
    at: typeof m.time === 'number' ? m.time : null,
  }))

  const userMessage = {
    text: target.text || '',
    imagePath: target.imagePath || null,
    at: typeof target.time === 'number' ? target.time : null,
  }

  const route = {
    provider: session.provider ?? null,
    model: session.model ?? null,
    apiEndpoint: session.apiEndpoint ?? null,
    credentialId: session.credentialId ?? null,
  }

  let agent: null | {
    id: string
    provider: string | null
    model: string | null
    systemPrompt: string | null
  } = null
  if (session.agentId) {
    const a = loadAgent(session.agentId)
    if (a) {
      agent = {
        id: a.id,
        provider: (a.provider as string) ?? null,
        model: (a.model as string) ?? null,
        systemPrompt: typeof a.systemPrompt === 'string' ? a.systemPrompt : null,
      }
    }
  }

  return NextResponse.json({
    sessionId: id,
    index: i,
    userMessage,
    priorMessages,
    route,
    agent,
  })
}
