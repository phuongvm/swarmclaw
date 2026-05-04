import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OPENCODE_CLI_STDIO } from './opencode-cli'

describe('opencode-cli provider', () => {
  it('closes child stdin so argv-prompt runs do not hang waiting for input', () => {
    assert.deepEqual(OPENCODE_CLI_STDIO, ['ignore', 'pipe', 'pipe'])
  })
})
