import fs from 'fs'
import path from 'path'

import { DATA_DIR } from '@/lib/server/data-dir'
import { hmrSingleton } from '@/lib/shared-utils'
import { genId } from '@/lib/id'
import { log } from '@/lib/server/logger'
import type { ConfigVersion, VersionedEntityKind } from '@/types/config-version'

const TAG = 'config-versions'
const FILE_PATH = path.join(DATA_DIR, 'config-versions.json')
const RETENTION_PER_ENTITY = 50

interface VersionsCache {
  loaded: boolean
  /** Indexed by version id. */
  versions: Record<string, ConfigVersion>
  /** Index: `${entityKind}:${entityId}` -> version ids ordered oldest-first. */
  byEntity: Record<string, string[]>
}

const cache = hmrSingleton<VersionsCache>('configVersions_cache', () => ({
  loaded: false,
  versions: {},
  byEntity: {},
}))

function ensureLoaded(): void {
  if (cache.loaded) return
  cache.loaded = true
  try {
    if (!fs.existsSync(FILE_PATH)) return
    const raw = fs.readFileSync(FILE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { versions?: Record<string, ConfigVersion> }
    cache.versions = parsed?.versions && typeof parsed.versions === 'object' ? parsed.versions : {}
    cache.byEntity = {}
    for (const v of Object.values(cache.versions)) {
      const key = `${v.entityKind}:${v.entityId}`
      ;(cache.byEntity[key] ||= []).push(v.id)
    }
    for (const list of Object.values(cache.byEntity)) {
      list.sort((a, b) => (cache.versions[a]?.createdAt ?? 0) - (cache.versions[b]?.createdAt ?? 0))
    }
  } catch (error) {
    log.warn(TAG, `Failed to load config versions: ${error instanceof Error ? error.message : error}`)
  }
}

function persist(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE_PATH, JSON.stringify({ versions: cache.versions }, null, 2), 'utf8')
  } catch (error) {
    log.error(TAG, `Failed to persist config versions: ${error instanceof Error ? error.message : error}`)
  }
}

export function snapshotVersion(input: {
  entityKind: VersionedEntityKind
  entityId: string
  snapshot: Record<string, unknown>
  note?: string | null
  actor?: string
  approvalId?: string | null
}): ConfigVersion {
  ensureLoaded()
  const version: ConfigVersion = {
    id: genId(),
    entityKind: input.entityKind,
    entityId: input.entityId,
    snapshot: input.snapshot,
    note: input.note ?? null,
    actor: input.actor ?? 'user',
    approvalId: input.approvalId ?? null,
    createdAt: Date.now(),
  }
  cache.versions[version.id] = version
  const key = `${version.entityKind}:${version.entityId}`
  const list = (cache.byEntity[key] ||= [])
  list.push(version.id)
  if (list.length > RETENTION_PER_ENTITY) {
    const trimmed = list.splice(0, list.length - RETENTION_PER_ENTITY)
    for (const trimmedId of trimmed) delete cache.versions[trimmedId]
  }
  persist()
  return version
}

export function listVersionsForEntity(
  entityKind: VersionedEntityKind,
  entityId: string,
): ConfigVersion[] {
  ensureLoaded()
  const ids = cache.byEntity[`${entityKind}:${entityId}`] ?? []
  return ids
    .map((id) => cache.versions[id])
    .filter((v): v is ConfigVersion => Boolean(v))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getVersion(versionId: string): ConfigVersion | null {
  ensureLoaded()
  return cache.versions[versionId] ?? null
}

export function pruneVersionsForEntity(
  entityKind: VersionedEntityKind,
  entityId: string,
): void {
  ensureLoaded()
  const key = `${entityKind}:${entityId}`
  const ids = cache.byEntity[key] ?? []
  for (const id of ids) delete cache.versions[id]
  delete cache.byEntity[key]
  persist()
}
