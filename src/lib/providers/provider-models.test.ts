import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS } from '@/lib/providers'

describe('PROVIDERS model list sanity', () => {
  it('every provider declares a non-empty models array', () => {
    for (const [id, entry] of Object.entries(PROVIDERS)) {
      assert.ok(Array.isArray(entry.models), `${id}: models must be an array`)
      assert.ok(entry.models.length > 0, `${id}: models must be non-empty`)
    }
  })

  it('every model id is a non-empty trimmed string', () => {
    for (const [id, entry] of Object.entries(PROVIDERS)) {
      for (const model of entry.models) {
        assert.equal(typeof model, 'string', `${id}: model entries must be strings`)
        assert.ok(model.length > 0, `${id}: model id must be non-empty`)
        assert.equal(model, model.trim(), `${id}: model id must be trimmed (got "${model}")`)
      }
    }
  })

  it('no duplicate model ids within a single provider', () => {
    for (const [id, entry] of Object.entries(PROVIDERS)) {
      const seen = new Set<string>()
      for (const model of entry.models) {
        assert.ok(!seen.has(model), `${id}: duplicate model id "${model}"`)
        seen.add(model)
      }
    }
  })

  it('every provider declares the required metadata fields', () => {
    for (const [id, entry] of Object.entries(PROVIDERS)) {
      assert.equal(typeof entry.id, 'string', `${id}: id must be a string`)
      assert.equal(entry.id, id, `${id}: id field must match registry key`)
      assert.equal(typeof entry.name, 'string', `${id}: name must be a string`)
      assert.ok(entry.name.length > 0, `${id}: name must be non-empty`)
      assert.equal(typeof entry.requiresApiKey, 'boolean', `${id}: requiresApiKey must be boolean`)
      assert.equal(typeof entry.requiresEndpoint, 'boolean', `${id}: requiresEndpoint must be boolean`)
      assert.equal(typeof entry.handler?.streamChat, 'function', `${id}: handler.streamChat must be a function`)
    }
  })
})
