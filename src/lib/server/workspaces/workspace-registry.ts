import fs from 'fs'
import path from 'path'

import { DATA_DIR } from '@/lib/server/data-dir'
import { hmrSingleton } from '@/lib/shared-utils'
import { genId } from '@/lib/id'
import { log } from '@/lib/server/logger'
import {
  DEFAULT_WORKSPACE_ID,
  type Workspace,
  type WorkspaceRegistry,
} from '@/types/workspace'

const TAG = 'workspace-registry'
const FILE_PATH = path.join(DATA_DIR, 'workspace-registry.json')

interface RegistryCache {
  loaded: boolean
  registry: WorkspaceRegistry
}

const cache = hmrSingleton<RegistryCache>('workspaceRegistry_cache', () => ({
  loaded: false,
  registry: {
    workspaces: {},
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  },
}))

function ensureLoaded(): void {
  if (cache.loaded) return
  cache.loaded = true
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, 'utf8')
      const parsed = JSON.parse(raw) as WorkspaceRegistry
      cache.registry = {
        workspaces: parsed?.workspaces ?? {},
        activeWorkspaceId: parsed?.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID,
      }
    }
  } catch (error) {
    log.warn(TAG, `Failed to load workspace registry: ${error instanceof Error ? error.message : error}`)
  }
  if (!cache.registry.workspaces[DEFAULT_WORKSPACE_ID]) {
    const now = Date.now()
    cache.registry.workspaces[DEFAULT_WORKSPACE_ID] = {
      id: DEFAULT_WORKSPACE_ID,
      name: 'Default',
      description: 'Default workspace',
      dataDir: null,
      color: '#3b82f6',
      createdAt: now,
      updatedAt: now,
    }
    persist()
  }
}

function persist(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE_PATH, JSON.stringify(cache.registry, null, 2), 'utf8')
  } catch (error) {
    log.error(TAG, `Failed to persist workspace registry: ${error instanceof Error ? error.message : error}`)
  }
}

export function listWorkspaces(): Workspace[] {
  ensureLoaded()
  return Object.values(cache.registry.workspaces)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function getActiveWorkspace(): Workspace {
  ensureLoaded()
  return cache.registry.workspaces[cache.registry.activeWorkspaceId]
    ?? cache.registry.workspaces[DEFAULT_WORKSPACE_ID]
}

export function getWorkspace(id: string): Workspace | null {
  ensureLoaded()
  return cache.registry.workspaces[id] ?? null
}

export function createWorkspace(input: {
  name: string
  description?: string
  color?: string
}): Workspace {
  ensureLoaded()
  const id = genId()
  const now = Date.now()
  const workspace: Workspace = {
    id,
    name: input.name,
    description: input.description,
    dataDir: null,
    color: input.color ?? null,
    createdAt: now,
    updatedAt: now,
  }
  cache.registry.workspaces[id] = workspace
  persist()
  return workspace
}

export function updateWorkspace(id: string, patch: Partial<Workspace>): Workspace | null {
  ensureLoaded()
  const existing = cache.registry.workspaces[id]
  if (!existing) return null
  const next: Workspace = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  }
  cache.registry.workspaces[id] = next
  persist()
  return next
}

export function deleteWorkspace(id: string): boolean {
  ensureLoaded()
  if (id === DEFAULT_WORKSPACE_ID) return false
  if (!cache.registry.workspaces[id]) return false
  delete cache.registry.workspaces[id]
  if (cache.registry.activeWorkspaceId === id) {
    cache.registry.activeWorkspaceId = DEFAULT_WORKSPACE_ID
  }
  persist()
  return true
}

export function setActiveWorkspace(id: string): Workspace | null {
  ensureLoaded()
  const target = cache.registry.workspaces[id]
  if (!target) return null
  cache.registry.activeWorkspaceId = id
  persist()
  return target
}
