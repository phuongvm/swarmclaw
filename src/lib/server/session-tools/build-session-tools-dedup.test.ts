import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Issue #39 (Moonshot/Kimi rejecting duplicate tool names) showed that the
// Phase 1 native-tool loop in `session-tools/index.ts` was pushing tools
// without checking for duplicate names. Phase 2 already had a dedup Set; the
// fix lifts that Set above Phase 1 so all phases share it.
//
// This test mirrors the dedup algorithm in pure form so it can be verified
// without booting the full session-tools graph (which OOMs in test workers
// when run alongside the dev server).

type FakeTool = { name: string }
type Builder = () => FakeTool[]

interface DedupWarn {
  toolName: string
  source: 'native' | 'crud' | 'extension'
  extensionId?: string
}

function dedupAssemble(
  nativeBuilders: ReadonlyArray<readonly [string, Builder]>,
  crudBuilder: Builder,
  extensionTools: ReadonlyArray<{ extensionId: string; tool: FakeTool }>,
): { tools: FakeTool[]; warnings: DedupWarn[] } {
  const tools: FakeTool[] = []
  const warnings: DedupWarn[] = []
  const existingNames = new Set<string>()

  for (const [extensionId, builder] of nativeBuilders) {
    for (const t of builder()) {
      if (existingNames.has(t.name)) {
        warnings.push({ toolName: t.name, source: 'native', extensionId })
        continue
      }
      existingNames.add(t.name)
      tools.push(t)
    }
  }

  for (const t of crudBuilder()) {
    if (existingNames.has(t.name)) {
      warnings.push({ toolName: t.name, source: 'crud' })
      continue
    }
    existingNames.add(t.name)
    tools.push(t)
  }

  for (const entry of extensionTools) {
    if (existingNames.has(entry.tool.name)) {
      warnings.push({ toolName: entry.tool.name, source: 'extension', extensionId: entry.extensionId })
      continue
    }
    existingNames.add(entry.tool.name)
    tools.push(entry.tool)
  }

  return { tools, warnings }
}

describe('session-tools assembler dedup (issue #39 regression)', () => {
  it('emits a single `files` tool when two native builders both produce one (the original issue #39 scenario)', () => {
    const result = dedupAssemble(
      [
        ['files', () => [{ name: 'files' }]],
        ['files_v2', () => [{ name: 'files' }]],
      ],
      () => [],
      [],
    )

    const fileTools = result.tools.filter((t) => t.name === 'files')
    assert.equal(fileTools.length, 1, 'must emit exactly one tool named "files"')
    assert.equal(result.warnings.length, 1)
    assert.equal(result.warnings[0].toolName, 'files')
    assert.equal(result.warnings[0].source, 'native')
    assert.equal(result.warnings[0].extensionId, 'files_v2')
  })

  it('first builder wins when names collide', () => {
    const t1 = { name: 'shared' }
    const t2 = { name: 'shared' }
    const result = dedupAssemble(
      [
        ['ext-a', () => [t1]],
        ['ext-b', () => [t2]],
      ],
      () => [],
      [],
    )
    assert.equal(result.tools.length, 1)
    assert.strictEqual(result.tools[0], t1)
  })

  it('CRUD tools cannot collide with native tools', () => {
    const result = dedupAssemble(
      [['ext-a', () => [{ name: 'crud_op' }]]],
      () => [{ name: 'crud_op' }],
      [],
    )
    assert.equal(result.tools.length, 1)
    assert.equal(result.warnings[0].source, 'crud')
  })

  it('extension tools dedup against the same shared Set', () => {
    const result = dedupAssemble(
      [['ext-a', () => [{ name: 'foo' }]]],
      () => [],
      [{ extensionId: 'ext-b', tool: { name: 'foo' } }],
    )
    assert.equal(result.tools.length, 1)
    assert.equal(result.warnings[0].source, 'extension')
    assert.equal(result.warnings[0].extensionId, 'ext-b')
  })

  it('lets distinct names through unchanged', () => {
    const result = dedupAssemble(
      [['ext-a', () => [{ name: 'a' }, { name: 'b' }]]],
      () => [{ name: 'c' }],
      [{ extensionId: 'ext-b', tool: { name: 'd' } }],
    )
    assert.deepEqual(result.tools.map((t) => t.name), ['a', 'b', 'c', 'd'])
    assert.equal(result.warnings.length, 0)
  })
})
