/**
 * Snapshot of a versioned configuration record (agent, extension, connector,
 * MCP server, etc.). Stored on every approved change so users can roll back.
 */
export type VersionedEntityKind = 'agent' | 'extension' | 'connector' | 'mcp_server' | 'chatroom' | 'project'

export interface ConfigVersion {
  id: string
  entityKind: VersionedEntityKind
  entityId: string
  /** Frozen snapshot of the entity's full record at this version. */
  snapshot: Record<string, unknown>
  /** Optional human-readable note (e.g., "before adding extra tools"). */
  note?: string | null
  /** Who made the change ("user" | "system" | agentId). */
  actor: string
  /** Optional reference to an approval that gated the change. */
  approvalId?: string | null
  createdAt: number
}
