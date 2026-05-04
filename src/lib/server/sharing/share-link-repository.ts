import crypto from 'node:crypto'
import {
  loadCollection,
  loadStoredItem,
  upsertStoredItem,
  deleteStoredItem,
} from '@/lib/server/storage'
import { genId } from '@/lib/id'

export type ShareEntityType = 'mission' | 'skill' | 'session'

export interface ShareLink {
  id: string
  token: string
  entityType: ShareEntityType
  entityId: string
  label: string | null
  createdAt: number
  expiresAt: number | null
  revokedAt: number | null
}

const TOKEN_BYTES = 24 // 32 base64url chars

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export function listShareLinks(): ShareLink[] {
  const rows = loadCollection('share_links')
  return Object.values(rows).map((raw) => normalizeShareLink(raw as Record<string, unknown>))
}

export function loadShareLinkById(id: string): ShareLink | null {
  const raw = loadStoredItem('share_links', id)
  return raw ? normalizeShareLink(raw as Record<string, unknown>) : null
}

export function loadShareLinkByToken(token: string): ShareLink | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  for (const link of listShareLinks()) {
    if (link.token === trimmed) return link
  }
  return null
}

export interface CreateShareLinkInput {
  entityType: ShareEntityType
  entityId: string
  expiresInSec?: number | null
  label?: string | null
}

export function createShareLink(input: CreateShareLinkInput): ShareLink {
  const now = Date.now()
  const link: ShareLink = {
    id: genId(),
    token: generateToken(),
    entityType: input.entityType,
    entityId: input.entityId,
    label: input.label?.trim() || null,
    createdAt: now,
    expiresAt:
      input.expiresInSec && input.expiresInSec > 0
        ? now + input.expiresInSec * 1000
        : null,
    revokedAt: null,
  }
  upsertStoredItem('share_links', link.id, link)
  return link
}

export function revokeShareLink(id: string): ShareLink | null {
  const link = loadShareLinkById(id)
  if (!link) return null
  if (link.revokedAt) return link
  const next: ShareLink = { ...link, revokedAt: Date.now() }
  upsertStoredItem('share_links', next.id, next)
  return next
}

export function deleteShareLink(id: string): void {
  deleteStoredItem('share_links', id)
}

export function isShareLinkActive(link: ShareLink, now: number = Date.now()): boolean {
  if (link.revokedAt) return false
  if (link.expiresAt !== null && link.expiresAt <= now) return false
  return true
}

function normalizeShareLink(raw: Record<string, unknown>): ShareLink {
  const entityType = raw.entityType
  const safeEntityType: ShareEntityType =
    entityType === 'mission' || entityType === 'skill' || entityType === 'session' ? entityType : 'mission'
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    token: typeof raw.token === 'string' ? raw.token : '',
    entityType: safeEntityType,
    entityId: typeof raw.entityId === 'string' ? raw.entityId : '',
    label: typeof raw.label === 'string' ? raw.label : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : null,
    revokedAt: typeof raw.revokedAt === 'number' ? raw.revokedAt : null,
  }
}
