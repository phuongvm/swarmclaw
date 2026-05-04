import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('share-link-repository: mint / list / revoke / lookup-by-token round-trip', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-share-'))
  process.env.DATA_DIR = tmpDir
  process.env.ACCESS_KEY = 'test-key'
  process.env.CREDENTIAL_SECRET = 'test-secret-32-characters-long!!'

  const {
    createShareLink,
    listShareLinks,
    loadShareLinkById,
    loadShareLinkByToken,
    revokeShareLink,
    isShareLinkActive,
    deleteShareLink,
  } = await import('./share-link-repository')

  const a = createShareLink({ entityType: 'mission', entityId: 'mission-1', label: 'hello' })
  const b = createShareLink({ entityType: 'skill', entityId: 'skill-2', expiresInSec: 60 })

  assert.notEqual(a.token, b.token, 'tokens must be unique')
  assert.ok(a.token.length >= 16, 'token should be non-trivially long')
  assert.equal(a.label, 'hello')
  assert.equal(a.revokedAt, null)
  assert.equal(a.expiresAt, null)
  assert.ok(b.expiresAt && b.expiresAt > Date.now(), 'b should have a future expiry')

  const list = listShareLinks()
  assert.equal(list.length, 2, 'both links should be listed')

  const byTokenA = loadShareLinkByToken(a.token)
  assert.equal(byTokenA?.id, a.id, 'loadShareLinkByToken finds the link')

  assert.equal(loadShareLinkByToken('not-a-real-token'), null, 'bad token returns null')

  // Before revoke — active
  assert.equal(isShareLinkActive(a), true)

  const revoked = revokeShareLink(a.id)
  assert.ok(revoked?.revokedAt, 'revoke stamps a timestamp')
  assert.equal(isShareLinkActive(revoked!), false, 'revoked link is inactive')

  // Reload from disk — revocation persisted
  const reloaded = loadShareLinkById(a.id)
  assert.ok(reloaded?.revokedAt, 'revocation persists across reload')

  // Hard delete
  deleteShareLink(b.id)
  assert.equal(loadShareLinkById(b.id), null, 'hard delete removes the record')
  assert.equal(listShareLinks().length, 1, 'listing drops deleted records')
})

test('share-link-repository: expired links are inactive', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-share-'))
  process.env.DATA_DIR = tmpDir
  process.env.ACCESS_KEY = 'test-key'
  process.env.CREDENTIAL_SECRET = 'test-secret-32-characters-long!!'

  const { createShareLink, isShareLinkActive } = await import('./share-link-repository')

  const link = createShareLink({ entityType: 'session', entityId: 'sess-1', expiresInSec: 1 })
  assert.equal(isShareLinkActive(link, Date.now()), true, 'fresh link is active')
  assert.equal(isShareLinkActive(link, Date.now() + 2000), false, 'past-expiry is inactive')
})
