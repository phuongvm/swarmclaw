import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPlanningModeSection } from './prompt-sections'
import type { Agent } from '@/types'

function agentWith(partial: Partial<Agent>): Agent {
  return {
    id: 'test',
    name: 'Test',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    credentialId: null,
    apiEndpoint: null,
    soul: null,
    systemPrompt: null,
    description: null,
    tools: [],
    extensions: [],
    heartbeatEnabled: false,
    delegationEnabled: false,
    delegationTargetMode: 'all',
    delegationTargetAgentIds: [],
    skillIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as unknown as Agent
}

test('buildPlanningModeSection returns null when planningMode is undefined', () => {
  const out = buildPlanningModeSection(agentWith({}), false)
  assert.equal(out, null)
})

test('buildPlanningModeSection returns null when planningMode is "off"', () => {
  const out = buildPlanningModeSection(agentWith({ planningMode: 'off' }), false)
  assert.equal(out, null)
})

test('buildPlanningModeSection returns null when planningMode is null', () => {
  const out = buildPlanningModeSection(agentWith({ planningMode: null }), false)
  assert.equal(out, null)
})

test('buildPlanningModeSection returns null in minimal prompt mode', () => {
  const out = buildPlanningModeSection(agentWith({ planningMode: 'strict' }), true)
  assert.equal(out, null)
})

test('buildPlanningModeSection returns null when agent is missing', () => {
  assert.equal(buildPlanningModeSection(null, false), null)
  assert.equal(buildPlanningModeSection(undefined, false), null)
})

test('buildPlanningModeSection emits plan block guidance when strict', () => {
  const out = buildPlanningModeSection(agentWith({ planningMode: 'strict' }), false)
  assert.ok(out, 'should return a non-empty block')
  assert.match(out!, /## Planning Mode: Strict/)
  assert.match(out!, /\[MAIN_LOOP_PLAN\]/)
  assert.match(out!, /"steps":/)
  assert.match(out!, /current_step/)
  assert.match(out!, /completed_steps/)
})
