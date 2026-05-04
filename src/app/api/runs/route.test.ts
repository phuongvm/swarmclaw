import assert from 'node:assert/strict'
import test from 'node:test'

import { runWithTempDataDir } from '@/lib/server/test-utils/run-with-temp-data-dir'

test('runs routes include structured schedule protocol runs', () => {
  const output = runWithTempDataDir<{
    listCount: number
    firstRunId: string | null
    firstRunSource: string | null
    firstRunStatus: string | null
    detailId: string | null
    detailSource: string | null
    eventsCount: number
    eventSummary: string | null
  }>(`
    const storageMod = await import('./src/lib/server/storage')
    const protocolsMod = await import('./src/lib/server/protocols/protocol-service')
    const listRouteMod = await import('./src/app/api/runs/route')
    const detailRouteMod = await import('./src/app/api/runs/[id]/route')
    const eventsRouteMod = await import('./src/app/api/runs/[id]/events/route')
    const storage = storageMod.default || storageMod
    const protocols = protocolsMod.default || protocolsMod
    const listRoute = listRouteMod.default || listRouteMod
    const detailRoute = detailRouteMod.default || detailRouteMod
    const eventsRoute = eventsRouteMod.default || eventsRouteMod

    storage.upsertStoredItem('agents', 'agentA', {
      id: 'agentA',
      name: 'Agent A',
      provider: 'ollama',
      model: 'test-model',
      systemPrompt: 'test',
      createdAt: 1,
      updatedAt: 1,
    })

    const run = protocols.createProtocolRun({
      title: 'Scheduled structured run',
      participantAgentIds: ['agentA'],
      facilitatorAgentId: 'agentA',
      autoStart: false,
      scheduleId: 'sched-1',
      sourceRef: { kind: 'schedule', id: 'sched-1', label: 'Morning schedule' },
      config: {
        goal: 'Summarize the morning inbox.',
      },
    })

    const listResponse = await listRoute.GET(new Request('http://local/api/runs?limit=10'))
    const listPayload = await listResponse.json()

    const detailResponse = await detailRoute.GET(
      new Request('http://local/api/runs/' + run.id),
      { params: Promise.resolve({ id: run.id }) },
    )
    const detailPayload = await detailResponse.json()

    const eventsResponse = await eventsRoute.GET(
      new Request('http://local/api/runs/' + run.id + '/events?limit=10'),
      { params: Promise.resolve({ id: run.id }) },
    )
    const eventsPayload = await eventsResponse.json()

    console.log(JSON.stringify({
      listCount: Array.isArray(listPayload) ? listPayload.length : -1,
      firstRunId: Array.isArray(listPayload) && listPayload[0] ? listPayload[0].id : null,
      firstRunSource: Array.isArray(listPayload) && listPayload[0] ? listPayload[0].source : null,
      firstRunStatus: Array.isArray(listPayload) && listPayload[0] ? listPayload[0].status : null,
      detailId: detailPayload?.id || null,
      detailSource: detailPayload?.source || null,
      eventsCount: Array.isArray(eventsPayload) ? eventsPayload.length : -1,
      eventSummary: Array.isArray(eventsPayload) && eventsPayload[0] ? eventsPayload[0].summary || null : null,
    }))
  `, { prefix: 'swarmclaw-runs-route-' })

  assert.equal(output.listCount, 1)
  assert.equal(output.firstRunId, output.detailId)
  assert.equal(output.firstRunSource, 'structured schedule')
  assert.equal(output.firstRunStatus, 'queued')
  assert.equal(output.detailSource, 'structured schedule')
  assert.equal(output.eventsCount >= 1, true)
  assert.equal(typeof output.eventSummary, 'string')
})
