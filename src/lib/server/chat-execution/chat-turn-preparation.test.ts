import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Agent, Session } from '@/types'
import type { ResolvedAgentRoute } from '@/lib/server/agents/agent-runtime-config'
import { applyAgentSyncToSession } from './chat-turn-preparation'

const SESSION_ID = 'sess_test_1'
const AGENT_ID = 'agent_test_1'

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: AGENT_ID,
    name: 'Test Agent',
    description: '',
    systemPrompt: '',
    provider: 'openai',
    model: 'gpt-4o',
    credentialId: 'cred_openai',
    apiEndpoint: null,
    ...overrides,
  } as Agent
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    name: 'Chat',
    cwd: '/tmp',
    user: 'test',
    provider: 'openai',
    model: 'gpt-4o',
    claudeSessionId: null,
    messages: [],
    createdAt: 0,
    lastActiveAt: 0,
    agentId: AGENT_ID,
    ...overrides,
  } as Session
}

function makeRoute(overrides: Partial<ResolvedAgentRoute> = {}): ResolvedAgentRoute {
  return {
    id: 'route_1',
    label: 'primary',
    provider: 'openai',
    model: 'gpt-4o',
    credentialId: 'cred_openai',
    fallbackCredentialIds: [],
    apiEndpoint: null,
    gatewayProfileId: null,
    priority: 1,
    source: 'agent',
    ...overrides,
  }
}

describe('applyAgentSyncToSession — user-selected provider/model preservation', () => {
  it('session with matching provider/model inherits credentials from route (baseline)', () => {
    const session = makeSession({ provider: 'openai', model: 'gpt-4o', credentialId: null })
    const agent = makeAgent()
    const route = makeRoute({ credentialId: 'cred_openai' })

    const { session: updated, changed } = applyAgentSyncToSession(session, agent, route, SESSION_ID)

    assert.equal(changed, true)
    assert.equal(updated.provider, 'openai', 'provider unchanged')
    assert.equal(updated.model, 'gpt-4o', 'model unchanged')
    assert.equal(updated.credentialId, 'cred_openai', 'credential synced from route')
  })

  it('user-switched provider is preserved even when agent/route disagree', () => {
    const session = makeSession({
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      credentialId: 'cred_anthropic',
      apiEndpoint: 'https://api.anthropic.com',
    })
    const agent = makeAgent({ provider: 'openai', model: 'gpt-4o' })
    const route = makeRoute({ provider: 'openai', model: 'gpt-4o', credentialId: 'cred_openai' })

    const { session: updated } = applyAgentSyncToSession(session, agent, route, SESSION_ID)

    assert.equal(updated.provider, 'anthropic', 'user-switched provider preserved')
    assert.equal(updated.model, 'claude-opus-4-7', 'user-switched model preserved')
  })

  it('user-switched provider keeps its credentials (does not rewrite from route)', () => {
    const session = makeSession({
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      credentialId: 'cred_anthropic',
      fallbackCredentialIds: ['cred_anthropic_backup'],
      apiEndpoint: 'https://api.anthropic.com/v1',
    })
    const agent = makeAgent({ provider: 'openai', credentialId: 'cred_openai' })
    const route = makeRoute({
      provider: 'openai',
      credentialId: 'cred_openai',
      fallbackCredentialIds: ['cred_openai_backup'],
      apiEndpoint: 'https://api.openai.com/v1',
    })

    const { session: updated } = applyAgentSyncToSession(session, agent, route, SESSION_ID)

    assert.equal(updated.credentialId, 'cred_anthropic', 'credentialId not rewritten')
    assert.deepEqual(
      updated.fallbackCredentialIds,
      ['cred_anthropic_backup'],
      'fallbackCredentialIds not rewritten',
    )
    assert.equal(
      updated.apiEndpoint,
      'https://api.anthropic.com/v1',
      'apiEndpoint not rewritten',
    )
  })

  it('user-switched model (same provider) keeps its credentials and model', () => {
    const session = makeSession({
      provider: 'openai',
      model: 'gpt-4o-mini',
      credentialId: 'cred_openai_user',
    })
    const agent = makeAgent({ provider: 'openai', model: 'gpt-4o', credentialId: 'cred_openai' })
    const route = makeRoute({
      provider: 'openai',
      model: 'gpt-4o',
      credentialId: 'cred_openai',
    })

    const { session: updated } = applyAgentSyncToSession(session, agent, route, SESSION_ID)

    assert.equal(updated.model, 'gpt-4o-mini', 'user-switched model preserved')
    assert.equal(
      updated.credentialId,
      'cred_openai',
      'same-provider credential does sync from route',
    )
  })

  it('empty session.provider inherits from agent', () => {
    const session = makeSession({
      provider: '' as Session['provider'],
      model: '',
      credentialId: null,
    })
    const agent = makeAgent({ provider: 'openai', model: 'gpt-4o' })

    const { session: updated, changed } = applyAgentSyncToSession(session, agent, null, SESSION_ID)

    assert.equal(changed, true)
    assert.equal(updated.provider, 'openai', 'provider initialized from agent')
    assert.equal(updated.model, 'gpt-4o', 'model initialized from agent')
  })

  it('gatewayProfileId syncs from route regardless of provider switch', () => {
    const session = makeSession({
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      gatewayProfileId: null,
    })
    const agent = makeAgent({ provider: 'openai' })
    const route = makeRoute({ provider: 'openai', gatewayProfileId: 'gw_profile_1' })

    const { session: updated } = applyAgentSyncToSession(session, agent, route, SESSION_ID)

    assert.equal(
      updated.gatewayProfileId,
      'gw_profile_1',
      'gatewayProfileId syncs from route even across provider switch',
    )
  })

  it('no route: session inherits credentialId and apiEndpoint from agent when unset', () => {
    const session = makeSession({
      provider: 'openai',
      model: 'gpt-4o',
      credentialId: undefined,
      apiEndpoint: undefined,
    })
    const agent = makeAgent({
      provider: 'openai',
      credentialId: 'cred_agent',
      apiEndpoint: 'https://custom.openai.example/v1',
    })

    const { session: updated } = applyAgentSyncToSession(session, agent, null, SESSION_ID)

    assert.equal(updated.credentialId, 'cred_agent', 'credentialId filled from agent')
    assert.equal(
      updated.apiEndpoint,
      'https://custom.openai.example/v1',
      'apiEndpoint filled from agent',
    )
  })

  it('tool/extension selection syncs from agent when session has no parent', () => {
    const session = makeSession({
      parentSessionId: null,
      tools: ['old_tool'],
      extensions: ['old_ext'],
    })
    const agent = makeAgent({
      tools: ['new_tool_a', 'new_tool_b'],
      extensions: ['new_ext'],
    })

    const { session: updated, changed } = applyAgentSyncToSession(session, agent, null, SESSION_ID)

    assert.equal(changed, true)
    assert.deepEqual(updated.tools, ['new_tool_a', 'new_tool_b'])
    assert.deepEqual(updated.extensions, ['new_ext'])
  })

  it('tool/extension selection does NOT sync on child (delegated) sessions', () => {
    const session = makeSession({
      parentSessionId: 'parent_session',
      tools: ['child_tool'],
      extensions: ['child_ext'],
    })
    const agent = makeAgent({
      tools: ['agent_tool'],
      extensions: ['agent_ext'],
    })

    const { session: updated } = applyAgentSyncToSession(session, agent, null, SESSION_ID)

    assert.deepEqual(updated.tools, ['child_tool'], 'child session tools preserved')
    assert.deepEqual(updated.extensions, ['child_ext'], 'child session extensions preserved')
  })

  it('idempotent: repeated sync with same inputs yields changed=false', () => {
    const session = makeSession({
      provider: 'openai',
      model: 'gpt-4o',
      credentialId: 'cred_openai',
      fallbackCredentialIds: [],
      apiEndpoint: null,
      gatewayProfileId: null,
      tools: [],
      extensions: [],
      parentSessionId: null,
      memoryScopeMode: null,
    })
    const agent = makeAgent({ tools: [], extensions: [] })
    const route = makeRoute()

    applyAgentSyncToSession(session, agent, route, SESSION_ID)
    const { changed } = applyAgentSyncToSession(session, agent, route, SESSION_ID)

    assert.equal(changed, false, 'second sync makes no changes')
  })
})
