import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripAgentReactionTokens } from '@/lib/server/chatrooms/chatroom-agent-signals'

test('stripAgentReactionTokens removes single REACTION marker glued to text', () => {
  const input = '11 plus 7 equals 18.\n[REACTION]{"emoji": "✅", "to": "c93bb040"}'
  const out = stripAgentReactionTokens(input)
  assert.equal(out, '11 plus 7 equals 18.')
})

test('stripAgentReactionTokens removes multiple REACTION markers', () => {
  const input = 'Sure thing.[REACTION]{"emoji":"👍","to":"a1"} Got it.[REACTION]{"emoji":"🎉","to":"b2"}'
  const out = stripAgentReactionTokens(input)
  assert.ok(!out.includes('[REACTION]'))
  assert.ok(out.includes('Sure thing.'))
  assert.ok(out.includes('Got it.'))
})

test('stripAgentReactionTokens preserves text without markers', () => {
  const input = 'Just a normal message with no markers.'
  const out = stripAgentReactionTokens(input)
  assert.equal(out, input)
})

test('stripAgentReactionTokens handles empty string', () => {
  assert.equal(stripAgentReactionTokens(''), '')
})

test('stripAgentReactionTokens collapses excess whitespace from removed lines', () => {
  const input = 'Line 1\n\n\n[REACTION]{"emoji":"✅","to":"x"}\n\n\nLine 2'
  const out = stripAgentReactionTokens(input)
  assert.ok(!out.includes('[REACTION]'))
  assert.ok(out.includes('Line 1'))
  assert.ok(out.includes('Line 2'))
  assert.ok(!out.match(/\n{3,}/), 'no triple newlines')
})

test('stripAgentReactionTokens leaves [REACTION] intact when JSON is invalid (incomplete payload)', () => {
  const input = 'Sure.[REACTION]{"emoji":"👍"} Done.'
  const out = stripAgentReactionTokens(input)
  assert.ok(out.includes('[REACTION]'), 'invalid reaction (missing "to") preserved verbatim')
})

test('stripAgentReactionTokens leaves [REACTION] intact when followed by non-JSON', () => {
  const input = 'Notes: [REACTION] is a label, not a marker.'
  const out = stripAgentReactionTokens(input)
  assert.equal(out, input)
})

test('stripAgentReactionTokens handles nested JSON without truncation', () => {
  const input = 'Tags applied.[REACTION]{"emoji":"🏷️","to":"abc","meta":{"reason":"label"}}'
  const out = stripAgentReactionTokens(input)
  assert.equal(out, 'Tags applied.')
})
