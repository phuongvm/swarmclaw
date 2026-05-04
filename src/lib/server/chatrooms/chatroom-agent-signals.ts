import { z } from 'zod'
import type { Chatroom, Agent } from '@/types'
import { patchChatroom } from '@/lib/server/chatrooms/chatroom-repository'
import { notify } from '@/lib/server/ws-hub'

const REACTION_MARKER = '[REACTION]'

const ReactionPayloadSchema = z.object({
  emoji: z.string().min(1),
  to: z.string().min(1),
}).passthrough()
type ReactionPayload = z.infer<typeof ReactionPayloadSchema>

interface ReactionMatch {
  start: number
  end: number
  payload: ReactionPayload
}

function findBalancedJsonObjectEnd(text: string, start: number): number {
  if (text.charAt(start) !== '{') return -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const c = text.charAt(i)
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function findReactionMatches(text: string): ReactionMatch[] {
  const matches: ReactionMatch[] = []
  if (!text) return matches
  let cursor = 0
  while (cursor < text.length) {
    const markerAt = text.indexOf(REACTION_MARKER, cursor)
    if (markerAt < 0) break
    let jsonStart = markerAt + REACTION_MARKER.length
    while (jsonStart < text.length && /\s/.test(text.charAt(jsonStart))) jsonStart += 1
    if (text.charAt(jsonStart) !== '{') {
      cursor = markerAt + REACTION_MARKER.length
      continue
    }
    const jsonEnd = findBalancedJsonObjectEnd(text, jsonStart)
    if (jsonEnd <= jsonStart) {
      cursor = markerAt + REACTION_MARKER.length
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd))
    } catch {
      cursor = jsonStart + 1
      continue
    }
    const validated = ReactionPayloadSchema.safeParse(parsed)
    if (!validated.success) {
      cursor = jsonEnd
      continue
    }
    matches.push({ start: markerAt, end: jsonEnd, payload: validated.data })
    cursor = jsonEnd
  }
  return matches
}

/**
 * Normalizes text for comparison (lowercase, alphanumeric only)
 */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Determines if an agent was implicitly mentioned in a message.
 * Matches against name, creature, and vibe.
 */
export function isImplicitlyMentioned(text: string, agent: Agent): boolean {
  const normText = normalizeForMatch(text)
  const normName = normalizeForMatch(agent.name)
  const normCreature = agent.creature ? normalizeForMatch(agent.creature) : null
  const normVibe = agent.vibe ? normalizeForMatch(agent.vibe) : null

  if (normText.includes(normName)) return true
  if (normCreature && normText.includes(normCreature)) return true
  
  // Vibe match: only if the vibe is a distinct single word like "skeptic" or "helper"
  if (normVibe && normVibe.length > 3 && normVibe.split(' ').length === 1) {
    if (normText.includes(normVibe)) return true
  }

  return false
}

/**
 * Adds an "ack" reaction to a chatroom message on behalf of an agent.
 * Useful for acknowledging tasks or agreeing with teammates.
 */
export function addAgentReaction(chatroomId: string, messageId: string, agentId: string, emoji: string) {
  const updated = patchChatroom(chatroomId, (current) => {
    const chatroom = current as Chatroom | null
    if (!chatroom) return null
    const message = chatroom.messages.find(m => m.id === messageId)
    if (!message) return chatroom
    if (message.reactions.some(r => r.reactorId === agentId && r.emoji === emoji)) return chatroom

    return {
      ...chatroom,
      messages: chatroom.messages.map((entry) => (
        entry.id !== messageId
          ? entry
          : {
              ...entry,
              reactions: [
                ...entry.reactions,
                {
                  emoji,
                  reactorId: agentId,
                  time: Date.now(),
                },
              ],
            }
      )),
    }
  })
  if (updated) notify(`chatroom:${chatroomId}`)
}

/**
 * Parses [REACTION] tokens from agent output and applies them.
 * Format: [REACTION]{"emoji": "👍", "to": "msg_id"}
 *
 * Uses a balanced-brace walker + zod validation so nested JSON or noisy
 * payloads don't slip past, and so unrelated `[REACTION]something` text
 * doesn't get spuriously consumed.
 */
export function applyAgentReactionsFromText(text: string, chatroomId: string, agentId: string) {
  for (const match of findReactionMatches(text)) {
    addAgentReaction(chatroomId, match.payload.to, agentId, match.payload.emoji)
  }
}

/**
 * Removes [REACTION]{...} markers from agent output so they don't bleed into
 * the visible message body. Reactions are persisted separately by
 * applyAgentReactionsFromText.
 */
export function stripAgentReactionTokens(text: string): string {
  if (!text) return text
  const matches = findReactionMatches(text)
  if (matches.length === 0) return text
  let out = ''
  let cursor = 0
  for (const match of matches) {
    out += text.slice(cursor, match.start)
    cursor = match.end
  }
  out += text.slice(cursor)
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
