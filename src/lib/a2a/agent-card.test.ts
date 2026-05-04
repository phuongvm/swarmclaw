import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

const originalEnv = {
  DATA_DIR: process.env.DATA_DIR,
  WORKSPACE_DIR: process.env.WORKSPACE_DIR,
  SWARMCLAW_BUILD_MODE: process.env.SWARMCLAW_BUILD_MODE,
}

let tempDir = ''
let storage: typeof import('@/lib/server/storage')
let canonicalRoute: typeof import('@/app/.well-known/agent-card.json/route')
let legacyRoute: typeof import('@/app/api/.well-known/agent-card/route')

function testAgent(id: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    id,
    name: id === 'agent-active' ? 'Active Agent' : 'Hidden Agent',
    description: 'A2A route test agent',
    systemPrompt: '',
    provider: 'ollama',
    model: 'qwen3.5',
    credentialId: null,
    fallbackCredentialIds: [],
    apiEndpoint: null,
    gatewayProfileId: null,
    extensions: [],
    capabilities: ['research'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-a2a-card-'))
  process.env.DATA_DIR = path.join(tempDir, 'data')
  process.env.WORKSPACE_DIR = path.join(tempDir, 'workspace')
  process.env.SWARMCLAW_BUILD_MODE = '1'
  storage = await import('@/lib/server/storage')
  canonicalRoute = await import('@/app/.well-known/agent-card.json/route')
  legacyRoute = await import('@/app/api/.well-known/agent-card/route')
  storage.saveAgents({
    'agent-active': testAgent('agent-active'),
    'agent-disabled': testAgent('agent-disabled', { disabled: true }),
    'agent-trashed': testAgent('agent-trashed', { trashedAt: Date.now() }),
  })
})

after(() => {
  if (originalEnv.DATA_DIR === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = originalEnv.DATA_DIR
  if (originalEnv.WORKSPACE_DIR === undefined) delete process.env.WORKSPACE_DIR
  else process.env.WORKSPACE_DIR = originalEnv.WORKSPACE_DIR
  if (originalEnv.SWARMCLAW_BUILD_MODE === undefined) delete process.env.SWARMCLAW_BUILD_MODE
  else process.env.SWARMCLAW_BUILD_MODE = originalEnv.SWARMCLAW_BUILD_MODE
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('A2A agent card discovery', () => {
  it('serves the canonical well-known directory and hides disabled agents', async () => {
    const response = await canonicalRoute.GET(new Request('http://local.test/.well-known/agent-card.json'))
    assert.equal(response.status, 200)
    const body = await response.json()

    assert.equal(body.protocolVersion, '0.3.0')
    assert.equal(body.kind, 'directory')
    assert.deepEqual(body.agents.map((agent: { agentId: string }) => agent.agentId), ['agent-active'])
    assert.equal(body.agents[0].apiEndpoint, 'http://local.test/api/a2a')
    assert.equal(body.agents[0].cardUrl, 'http://local.test/.well-known/agent-card.json?agentId=agent-active')
  })

  it('returns a full card from both canonical and legacy routes', async () => {
    const canonical = await canonicalRoute.GET(new Request('http://local.test/.well-known/agent-card.json?agentId=agent-active'))
    const legacy = await legacyRoute.GET(new Request('http://local.test/api/.well-known/agent-card?agentId=agent-active'))

    assert.equal(canonical.status, 200)
    assert.equal(legacy.status, 200)
    assert.equal((await canonical.json()).name, 'Active Agent')
    assert.equal((await legacy.json()).apiEndpoint, 'http://local.test/api/a2a')
  })

  it('returns 404 for disabled or missing agent cards', async () => {
    const disabled = await canonicalRoute.GET(new Request('http://local.test/.well-known/agent-card.json?agentId=agent-disabled'))
    const missing = await canonicalRoute.GET(new Request('http://local.test/.well-known/agent-card.json?agentId=nope'))

    assert.equal(disabled.status, 404)
    assert.equal(missing.status, 404)
  })
})
