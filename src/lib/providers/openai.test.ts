import assert from 'node:assert/strict'
import test from 'node:test'

import { streamOpenAiChat } from './openai'

function sseChunk(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

function parseSseEvents(frames: string[]) {
  return frames
    .flatMap((frame) => frame.trim().split('\n\n'))
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, '')) as { t: string; text?: string })
}

test('OpenAI-compatible reasoning deltas stream as thinking instead of visible text', async () => {
  const originalFetch = globalThis.fetch
  const encoded = new TextEncoder()
  const frames = [
    sseChunk({ choices: [{ delta: { reasoning_content: 'internal reasoning ' } }] }),
    sseChunk({ choices: [{ delta: { content: 'visible answer' } }] }),
    'data: [DONE]\n\n',
  ]
  const writes: string[] = []

  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoded.encode(frame))
      controller.close()
    },
  }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

  try {
    const result = await streamOpenAiChat({
      session: { id: 'session-1', provider: 'openai', model: 'test-model' },
      message: 'hello',
      write: (data) => writes.push(data),
      active: new Map(),
      loadHistory: () => [],
    } as Parameters<typeof streamOpenAiChat>[0])

    assert.equal(result, 'visible answer')
    assert.deepEqual(parseSseEvents(writes), [
      { t: 'thinking', text: 'internal reasoning ' },
      { t: 'd', text: 'visible answer' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
