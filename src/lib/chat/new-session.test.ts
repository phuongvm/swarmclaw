import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildNewAgentSessionPayload,
  getNewSessionButtonTitle,
  hasResettableSessionRuntime,
  sortSessionsNewestFirst,
  summarizeFirstMessageAsTitle,
} from './new-session'

test('getNewSessionButtonTitle includes the Copilot CLI native reset hint', () => {
  const title = getNewSessionButtonTitle({
    provider: 'copilot-cli',
    claudeSessionId: null,
    codexThreadId: null,
    opencodeSessionId: null,
    opencodeWebSessionId: null,
    geminiSessionId: null,
    copilotSessionId: 'copilot-session-1',
    droidSessionId: null,
    cursorSessionId: null,
    qwenSessionId: null,
    acpSessionId: null,
    delegateResumeIds: undefined,
  })

  assert.match(title, /Copilot CLI/)
  assert.match(title, /\/new/)
})

test('hasResettableSessionRuntime detects saved provider or delegate resume ids', () => {
  assert.equal(hasResettableSessionRuntime({
    provider: 'openai',
    claudeSessionId: null,
    codexThreadId: null,
    opencodeSessionId: null,
    opencodeWebSessionId: null,
    geminiSessionId: null,
    copilotSessionId: null,
    droidSessionId: null,
    cursorSessionId: null,
    qwenSessionId: null,
    acpSessionId: null,
    delegateResumeIds: { codex: 'resume-1' },
  }), true)

  assert.equal(hasResettableSessionRuntime({
    provider: 'openai',
    claudeSessionId: null,
    codexThreadId: null,
    opencodeSessionId: null,
    opencodeWebSessionId: null,
    geminiSessionId: null,
    copilotSessionId: null,
    droidSessionId: null,
    cursorSessionId: null,
    qwenSessionId: null,
    acpSessionId: null,
    delegateResumeIds: undefined,
  }), false)
})

test('buildNewAgentSessionPayload clones the current agent chat settings for a fresh session', () => {
  const payload = buildNewAgentSessionPayload({
    id: 'sess-current',
    name: 'Slackado',
    cwd: '/workspace',
    user: 'bnikolov',
    provider: 'copilot-cli',
    model: 'gpt-5.4-mini',
    ollamaMode: null,
    credentialId: null,
    fallbackCredentialIds: ['cred-a'],
    apiEndpoint: null,
    routePreferredGatewayTags: ['primary'],
    routePreferredGatewayUseCase: 'chat',
    sessionType: 'human',
    agentId: 'agent-1',
    tools: ['shell'],
    extensions: ['ext-a'],
    heartbeatEnabled: null,
    heartbeatIntervalSec: null,
    sessionResetMode: 'idle',
    sessionIdleTimeoutSec: 900,
    sessionMaxAgeSec: null,
    sessionDailyResetAt: null,
    sessionResetTimezone: null,
    thinkingLevel: 'medium',
  })

  assert.equal(payload.parentSessionId, 'sess-current')
  assert.equal(payload.agentId, 'agent-1')
  assert.equal(payload.provider, 'copilot-cli')
  assert.deepEqual(payload.tools, ['shell'])
})

test('sortSessionsNewestFirst puts the latest active session first', () => {
  const ordered = sortSessionsNewestFirst([
    { id: 'older', createdAt: 100, lastActiveAt: 150 },
    { id: 'newest', createdAt: 200, lastActiveAt: 500 },
    { id: 'middle', createdAt: 300, lastActiveAt: 320 },
  ])

  assert.deepEqual(ordered.map((session) => session.id), ['newest', 'middle', 'older'])
})

test('summarizeFirstMessageAsTitle turns the opening prompt into a compact session title', () => {
  assert.equal(
    summarizeFirstMessageAsTitle('Review the latest CI failures for the dashboard and tell me what broke first.'),
    'Review the latest CI failures for the dashboard',
  )
  assert.equal(summarizeFirstMessageAsTitle('   '), 'New Chat')
})
