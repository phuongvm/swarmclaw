import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

process.env.SWARMCLAW_DAEMON_AUTOSTART = '0'

import { PUT as putTask } from './[id]/route'
import { loadTasks, saveTasks } from '@/lib/server/storage'
import type { BoardTask } from '@/types'

const originalTasks = loadTasks()

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function seedTask(id: string, overrides: Partial<BoardTask> = {}) {
  const tasks = loadTasks()
  const now = Date.now()
  tasks[id] = {
    id,
    title: 'Seed Task',
    description: '',
    status: 'backlog',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as BoardTask
  saveTasks(tasks)
}

afterEach(() => {
  saveTasks(originalTasks)
})

test('PUT /api/tasks/:id rejects a non-string title with a 400', async () => {
  seedTask('task-bad-title', { title: 'Original' })

  const response = await putTask(new Request('http://local/api/tasks/task-bad-title', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 42 }),
  }), routeParams('task-bad-title'))

  assert.equal(response.status, 400)
  const stored = loadTasks()['task-bad-title']
  assert.equal(stored.title, 'Original', 'stored title must be unchanged')
})

test('PUT /api/tasks/:id partial update does not clobber untouched fields', async () => {
  seedTask('task-partial', {
    title: 'Keep me',
    description: 'Keep me too',
    status: 'queued',
  })

  const response = await putTask(new Request('http://local/api/tasks/task-partial', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'updated' }),
  }), routeParams('task-partial'))

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.title, 'Keep me')
  assert.equal(body.description, 'updated')
  assert.equal(body.status, 'queued')
})

test('PUT /api/tasks/:id rejects a non-array blockedBy with a 400', async () => {
  seedTask('task-bad-blocked', { title: 'T', blockedBy: ['dep-1'] })

  const response = await putTask(new Request('http://local/api/tasks/task-bad-blocked', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blockedBy: 'not_an_array' }),
  }), routeParams('task-bad-blocked'))

  assert.equal(response.status, 400)
  const stored = loadTasks()['task-bad-blocked']
  assert.deepEqual(stored.blockedBy, ['dep-1'], 'stored blockedBy must be unchanged')
})
