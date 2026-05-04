import test from 'node:test'
import assert from 'node:assert/strict'
import type { Agent, Session } from '../../types'
import type { AppState } from '../use-app-store'
import { selectActiveSessionId } from './session-slice'

function makeState(overrides: Partial<AppState>): AppState {
  return {
    currentAgentId: null,
    agents: {},
    sessions: {},
    activeSessionIdOverride: null,
    ...overrides,
  } as AppState
}

function makeAgent(id: string, threadSessionId: string): Agent {
  return { id, threadSessionId } as unknown as Agent
}

function makeSession(id: string): Session {
  return { id } as unknown as Session
}

test('selectActiveSessionId prefers override when present', () => {
  const state = makeState({
    currentAgentId: 'agent-1',
    agents: { 'agent-1': makeAgent('agent-1', 'thread-1') },
    sessions: { 'thread-1': makeSession('thread-1'), 'task-1': makeSession('task-1') },
    activeSessionIdOverride: 'task-1',
  })
  assert.equal(selectActiveSessionId(state), 'task-1')
})

test('selectActiveSessionId chooses most recently active session for current agent', () => {
  const state = makeState({
    currentAgentId: 'agent-1',
    agents: { 'agent-1': makeAgent('agent-1', 'thread-1') },
    sessions: {
      'thread-1': { ...makeSession('thread-1'), agentId: 'agent-1', lastActiveAt: 100 } as unknown as Session,
      'old-1': { ...makeSession('old-1'), agentId: 'agent-1', lastActiveAt: 90 } as unknown as Session,
      'latest-1': { ...makeSession('latest-1'), agentId: 'agent-1', lastActiveAt: 200, messageCount: 1 } as unknown as Session,
      'other-agent': { ...makeSession('other-agent'), agentId: 'agent-2', lastActiveAt: 999 } as unknown as Session,
    },
  })
  assert.equal(selectActiveSessionId(state), 'latest-1')
})

test('selectActiveSessionId prefers most recent session with content over newer empty thread session', () => {
  const state = makeState({
    currentAgentId: 'agent-1',
    agents: { 'agent-1': makeAgent('agent-1', 'thread-1') },
    sessions: {
      'thread-1': { ...makeSession('thread-1'), agentId: 'agent-1', lastActiveAt: 300 } as unknown as Session,
      'work-1': { ...makeSession('work-1'), agentId: 'agent-1', lastActiveAt: 200, messageCount: 2 } as unknown as Session,
    },
  })
  assert.equal(selectActiveSessionId(state), 'work-1')
})

test('selectActiveSessionId falls back to thread session when agent has no loaded sessions', () => {
  const state = makeState({
    currentAgentId: 'agent-1',
    agents: { 'agent-1': makeAgent('agent-1', 'thread-1') },
    sessions: { 'unrelated': { ...makeSession('unrelated'), agentId: 'agent-2' } as unknown as Session },
  })
  assert.equal(selectActiveSessionId(state), 'thread-1')
})

test('selectActiveSessionId falls back to thread session when all loaded sessions are empty', () => {
  const state = makeState({
    currentAgentId: 'agent-1',
    agents: { 'agent-1': makeAgent('agent-1', 'thread-1') },
    sessions: {
      'thread-1': { ...makeSession('thread-1'), agentId: 'agent-1', lastActiveAt: 120 } as unknown as Session,
      'empty-newer': { ...makeSession('empty-newer'), agentId: 'agent-1', lastActiveAt: 220 } as unknown as Session,
    },
  })
  assert.equal(selectActiveSessionId(state), 'thread-1')
})

test('selectActiveSessionId ignores stale override ids', () => {
  const state = makeState({
    currentAgentId: 'agent-1',
    agents: { 'agent-1': makeAgent('agent-1', 'thread-1') },
    sessions: { 'thread-1': makeSession('thread-1') },
    activeSessionIdOverride: 'missing-session',
  })
  assert.equal(selectActiveSessionId(state), 'thread-1')
})
