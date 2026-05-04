import fs from 'fs'
import path from 'path'

import { DATA_DIR } from '@/lib/server/data-dir'
import { hmrSingleton } from '@/lib/shared-utils'
import { log } from '@/lib/server/logger'
import { DEFAULT_WORKFLOW_STATES, type WorkflowState } from '@/types/workflow-state'

const TAG = 'workflow-states'
const FILE_PATH = path.join(DATA_DIR, 'task-workflow-states.json')

interface WorkflowStateCache {
  loaded: boolean
  states: Record<string, WorkflowState>
}

const cache = hmrSingleton<WorkflowStateCache>('taskWorkflowStates_cache', () => ({
  loaded: false,
  states: {},
}))

function ensureLoaded(): void {
  if (cache.loaded) return
  cache.loaded = true
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, WorkflowState>
      cache.states = parsed && typeof parsed === 'object' ? parsed : {}
    } else {
      seedDefaults()
      persist()
    }
  } catch (error) {
    log.warn(TAG, `Failed to load workflow states; reseeding defaults: ${error instanceof Error ? error.message : error}`)
    seedDefaults()
  }
}

function seedDefaults(): void {
  const now = Date.now()
  const next: Record<string, WorkflowState> = {}
  for (const seed of DEFAULT_WORKFLOW_STATES) {
    next[seed.id] = { ...seed, createdAt: now, updatedAt: now }
  }
  cache.states = next
}

function persist(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE_PATH, JSON.stringify(cache.states, null, 2), 'utf8')
  } catch (error) {
    log.error(TAG, `Failed to persist workflow states: ${error instanceof Error ? error.message : error}`)
  }
}

export function listWorkflowStates(opts?: { projectId?: string | null }): WorkflowState[] {
  ensureLoaded()
  const all = Object.values(cache.states)
  if (opts && opts.projectId !== undefined) {
    return all.filter((s) => (s.projectId ?? null) === (opts.projectId ?? null))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }
  return all.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

export function getWorkflowState(id: string): WorkflowState | null {
  ensureLoaded()
  return cache.states[id] ?? null
}

export function upsertWorkflowState(state: WorkflowState): WorkflowState {
  ensureLoaded()
  const now = Date.now()
  const existing = cache.states[state.id]
  const next: WorkflowState = {
    ...state,
    createdAt: existing?.createdAt ?? state.createdAt ?? now,
    updatedAt: now,
  }
  cache.states[state.id] = next
  persist()
  return next
}

export function deleteWorkflowState(id: string): boolean {
  ensureLoaded()
  if (!cache.states[id]) return false
  delete cache.states[id]
  persist()
  return true
}

export function resetWorkflowStatesToDefaults(): void {
  seedDefaults()
  persist()
}
