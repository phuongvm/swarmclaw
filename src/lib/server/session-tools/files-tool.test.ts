import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFilesTools } from '@/lib/server/session-tools/files-tool'
import type { ToolBuildContext } from '@/lib/server/session-tools/context'

function makeBctx(enabled: Set<string>): ToolBuildContext {
  return {
    cwd: '/tmp',
    ctx: undefined,
    hasExtension: (name) => enabled.has(name),
    hasTool: (name) => enabled.has(name),
    cleanupFns: [],
    commandTimeoutMs: 0,
    claudeTimeoutMs: 0,
    cliProcessTimeoutMs: 0,
    persistDelegateResumeId: () => {},
    readStoredDelegateResumeId: () => null,
    resolveCurrentSession: () => null,
    activeExtensions: Array.from(enabled),
    filesystemScope: 'workspace',
  }
}

describe('buildFilesTools (issue #39)', () => {
  it('returns no tools when only the legacy `files` extension is enabled', () => {
    // Pre-fix this returned a tool named "files", on top of the v1 builder
    // which already produced a tool with the same name. Moonshot/Kimi rejected
    // the duplicate with `function name files is duplicated`.
    const bctx = makeBctx(new Set(['files']))
    const out = buildFilesTools(bctx)
    assert.equal(out.length, 0)
  })

  it('returns no tools when no relevant extension is enabled', () => {
    const bctx = makeBctx(new Set(['shell', 'web']))
    const out = buildFilesTools(bctx)
    assert.equal(out.length, 0)
  })

  it('returns one `files` tool when the v2 extension is explicitly enabled', () => {
    const bctx = makeBctx(new Set(['files_v2']))
    const out = buildFilesTools(bctx)
    assert.equal(out.length, 1)
    assert.equal(out[0].name, 'files')
  })

  it('returns one `files` tool when both `files` and `files_v2` are enabled', () => {
    // Defensive: even with both enabled, this builder emits exactly one tool.
    // (The duplicate-with-v1 protection lives in the session-tools assembler
    // dedup loop, covered by build-session-tools-dedup.test.ts.)
    const bctx = makeBctx(new Set(['files', 'files_v2']))
    const out = buildFilesTools(bctx)
    assert.equal(out.length, 1)
    assert.equal(out[0].name, 'files')
  })
})
