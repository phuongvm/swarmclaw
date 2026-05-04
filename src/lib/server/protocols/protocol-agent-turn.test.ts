import assert from 'node:assert/strict'
import test from 'node:test'
import { runWithTempDataDir } from '@/lib/server/test-utils/run-with-temp-data-dir'

test('defaultExecuteAgentTurn surfaces execution-log errors instead of returning a blank structured response', () => {
  const output = runWithTempDataDir<{ error: string | null }>(`
    const storageMod = await import('./src/lib/server/storage')
    const protocolsMod = await import('./src/lib/server/protocols/protocol-service')
    const protocolTurnMod = await import('./src/lib/server/protocols/protocol-agent-turn')
    const streamMod = await import('./src/lib/server/chat-execution/stream-agent-chat')
    const executionLogMod = await import('./src/lib/server/execution-log')

    const storage = storageMod.default || storageMod
    const protocols = protocolsMod.default || protocolsMod
    const { defaultExecuteAgentTurn } = protocolTurnMod.default || protocolTurnMod
    const { setStreamAgentChatForTest } = streamMod.default || streamMod
    const { logExecution } = executionLogMod.default || executionLogMod

    storage.upsertStoredItem('agents', 'agentA', {
      id: 'agentA',
      name: 'Agent A',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'test',
      createdAt: 1,
      updatedAt: 1,
    })

    const run = protocols.createProtocolRun({
      title: 'Credential failure run',
      templateId: 'single_agent_structured_run',
      participantAgentIds: ['agentA'],
      facilitatorAgentId: 'agentA',
      autoStart: false,
    }, { now: () => 1000 })

    setStreamAgentChatForTest(async (opts) => {
      logExecution(opts.session.id, 'error', 'Missing credentials. Please pass an apiKey.', {
        agentId: opts.session.agentId,
      })
      return { fullText: '', finalResponse: '', toolEvents: [] }
    })

    try {
      await defaultExecuteAgentTurn({
        run,
        phase: { id: 'respond', label: 'Respond', kind: 'round_robin' },
        agentId: 'agentA',
        prompt: 'Say something useful.',
      })
      console.log(JSON.stringify({ error: null }))
    } catch (error) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setStreamAgentChatForTest(null)
    }
  `, { prefix: 'swarmclaw-protocol-agent-turn-error-' })

  assert.match(String(output.error || ''), /missing credentials/i)
})

test('defaultExecuteAgentTurn rejects blank structured responses even without a logged error', () => {
  const output = runWithTempDataDir<{ error: string | null }>(`
    const storageMod = await import('./src/lib/server/storage')
    const protocolsMod = await import('./src/lib/server/protocols/protocol-service')
    const protocolTurnMod = await import('./src/lib/server/protocols/protocol-agent-turn')
    const streamMod = await import('./src/lib/server/chat-execution/stream-agent-chat')

    const storage = storageMod.default || storageMod
    const protocols = protocolsMod.default || protocolsMod
    const { defaultExecuteAgentTurn } = protocolTurnMod.default || protocolTurnMod
    const { setStreamAgentChatForTest } = streamMod.default || streamMod

    storage.upsertStoredItem('agents', 'agentA', {
      id: 'agentA',
      name: 'Agent A',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'test',
      createdAt: 1,
      updatedAt: 1,
    })

    const run = protocols.createProtocolRun({
      title: 'Blank response run',
      templateId: 'single_agent_structured_run',
      participantAgentIds: ['agentA'],
      facilitatorAgentId: 'agentA',
      autoStart: false,
    }, { now: () => 1000 })

    setStreamAgentChatForTest(async () => ({ fullText: '', finalResponse: '', toolEvents: [] }))

    try {
      await defaultExecuteAgentTurn({
        run,
        phase: { id: 'summarize', label: 'Summarize', kind: 'summarize' },
        agentId: 'agentA',
        prompt: 'Summarize.',
      })
      console.log(JSON.stringify({ error: null }))
    } catch (error) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setStreamAgentChatForTest(null)
    }
  `, { prefix: 'swarmclaw-protocol-agent-turn-blank-' })

  assert.match(String(output.error || ''), /no visible output/i)
})

test('defaultExecuteAgentTurn uses direct provider runtime for CLI providers', () => {
  const output = runWithTempDataDir<{ text: string | null }>(`
    const storageMod = await import('./src/lib/server/storage')
    const protocolsMod = await import('./src/lib/server/protocols/protocol-service')
    const protocolTurnMod = await import('./src/lib/server/protocols/protocol-agent-turn')
    const providersMod = await import('./src/lib/providers/index')

    const storage = storageMod.default || storageMod
    const protocols = protocolsMod.default || protocolsMod
    const { defaultExecuteAgentTurn } = protocolTurnMod.default || protocolTurnMod
    const providers = providersMod.default || providersMod

    storage.upsertStoredItem('agents', 'agentA', {
      id: 'agentA',
      name: 'Agent A',
      provider: 'copilot-cli',
      model: 'gpt-5.4',
      systemPrompt: 'test',
      createdAt: 1,
      updatedAt: 1,
    })

    const originalHandler = providers.PROVIDERS['copilot-cli'].handler
    providers.PROVIDERS['copilot-cli'].handler = {
      streamChat: async (opts) => {
        opts.write('data: ' + JSON.stringify({ t: 'd', text: 'Copilot CLI structured response.' }) + '\\n\\n')
        return 'Copilot CLI structured response.'
      },
    }

    const run = protocols.createProtocolRun({
      title: 'CLI structured run',
      templateId: 'single_agent_structured_run',
      participantAgentIds: ['agentA'],
      facilitatorAgentId: 'agentA',
      autoStart: false,
    }, { now: () => 1000 })

    try {
      const result = await defaultExecuteAgentTurn({
        run,
        phase: { id: 'respond', label: 'Respond', kind: 'round_robin' },
        agentId: 'agentA',
        prompt: 'Say something useful.',
      })
      console.log(JSON.stringify({ text: result.text }))
    } finally {
      providers.PROVIDERS['copilot-cli'].handler = originalHandler
    }
  `, { prefix: 'swarmclaw-protocol-agent-turn-cli-' })

  assert.equal(output.text, 'Copilot CLI structured response.')
})
