import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { prepareScheduleUpdate } from '@/lib/server/schedules/schedule-service'
import type { Schedule } from '@/types'

function readNextRunAt(value: object): number | undefined {
  if (!('nextRunAt' in value)) return undefined
  const nextRunAt = value.nextRunAt
  return typeof nextRunAt === 'number' ? nextRunAt : undefined
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sched-1',
    name: 'Morning run',
    agentId: 'agent-1',
    taskPrompt: 'Do the thing',
    scheduleType: 'cron',
    cron: '40 10 * * *',
    timezone: 'UTC',
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    nextRunAt: Date.parse('2026-01-01T10:40:00.000Z'),
    ...overrides,
  }
}

describe('prepareScheduleUpdate', () => {
  it('recomputes nextRunAt when cron timing changes', () => {
    const current = makeSchedule()
    const now = Date.parse('2026-01-01T10:30:00.000Z')
    const result = prepareScheduleUpdate({
      id: current.id,
      current,
      patch: { cron: '45 10 * * *' },
      schedules: { [current.id]: current },
      now,
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      const nextRunAt = readNextRunAt(result.schedule)
      assert.notEqual(nextRunAt, current.nextRunAt)
      assert.equal(typeof nextRunAt, 'number')
      assert.equal(nextRunAt, Date.parse('2026-01-01T10:45:00.000Z'))
    }
  })

  it('recomputes nextRunAt when reactivating a paused interval schedule', () => {
    const current = makeSchedule({
      scheduleType: 'interval',
      cron: undefined,
      intervalMs: 300_000,
      status: 'paused',
      nextRunAt: 123,
    })
    const now = 1_000_000
    const result = prepareScheduleUpdate({
      id: current.id,
      current,
      patch: { status: 'active' },
      schedules: { [current.id]: current },
      now,
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(readNextRunAt(result.schedule), 1_300_000)
    }
  })
})
