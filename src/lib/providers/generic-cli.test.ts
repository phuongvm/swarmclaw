import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { GENERIC_CLI_BINARIES, streamGenericCliChat } from './generic-cli'

describe('GENERIC_CLI_BINARIES', () => {
  it('maps every generic CLI provider id to a non-empty binary name', () => {
    for (const [providerId, binaryName] of Object.entries(GENERIC_CLI_BINARIES)) {
      assert.equal(typeof binaryName, 'string', `${providerId} binary must be a string`)
      assert.ok(binaryName.length > 0, `${providerId} binary must not be empty`)
      assert.ok(providerId.endsWith('-cli'), `${providerId} should end with -cli for the registry pattern`)
    }
  })

  it('does not collide with bespoke CLI provider ids', () => {
    const bespoke = new Set([
      'claude-cli', 'codex-cli', 'opencode-cli', 'gemini-cli', 'copilot-cli',
      'droid-cli', 'cursor-cli', 'qwen-code-cli', 'goose',
    ])
    for (const id of Object.keys(GENERIC_CLI_BINARIES)) {
      assert.equal(bespoke.has(id), false, `${id} must not collide with a bespoke CLI provider`)
    }
  })
})

describe('streamGenericCliChat', () => {
  it('streams stdout lines as deltas via the SSE write callback when the binary exists', async () => {
    // Use `echo` as a stand-in binary. Every POSIX system has it on PATH.
    // Note: `echo "<prompt>"` will print the prompt itself, which exercises
    // the line-buffered pipe.
    const writes: string[] = []
    const active = new Map<string, unknown>()

    const result = await streamGenericCliChat({
      session: { id: 'test-session', cwd: process.cwd() },
      message: 'hello world',
      write: (data) => writes.push(data),
      active,
      loadHistory: () => [],
      binaryName: 'echo',
      displayName: 'Echo',
    })

    assert.ok(result.includes('hello world'), `expected response to include the prompt, got: ${JSON.stringify(result)}`)
    assert.ok(writes.length > 0, 'should have emitted at least one SSE event')
    const allText = writes.join('')
    assert.ok(allText.includes('hello world'), 'SSE stream should include the echoed prompt')
    assert.ok(!allText.includes('"t":"err"'), 'should not emit an error event on a successful run')
    assert.equal(active.size, 0, 'session should be removed from active map after close')
  })

  it('emits an error event when the binary cannot be found on PATH', async () => {
    const writes: string[] = []
    const active = new Map<string, unknown>()

    const result = await streamGenericCliChat({
      session: { id: 'missing-bin-session', cwd: process.cwd() },
      message: 'test',
      write: (data) => writes.push(data),
      active,
      loadHistory: () => [],
      binaryName: 'definitely-not-a-real-binary-zzz-' + Date.now(),
      displayName: 'Nonexistent CLI',
    })

    assert.equal(result, '', 'missing binary should produce empty response')
    assert.equal(writes.length, 1, 'should emit exactly one error event')
    assert.ok(writes[0].includes('"t":"err"'), 'event should carry the err type')
    assert.ok(writes[0].includes('Nonexistent CLI not found'), 'error message should mention the display name')
  })
})
