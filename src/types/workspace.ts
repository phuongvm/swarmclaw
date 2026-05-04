/**
 * Multi-workspace metadata. The active workspace is recorded in
 * workspace-registry.json and applied at runtime via the workspace switcher.
 *
 * In v1.5.57 this is **scaffolding only** — actual data isolation requires
 * forking DATA_DIR per workspace, which is a follow-up. The current
 * registry lets users name multiple logical workspaces and switch the
 * active label so the UI and exports can carry it as context.
 */
export interface Workspace {
  id: string
  name: string
  description?: string
  /** Optional reference to a separate data directory (future use). */
  dataDir?: string | null
  /** Display color in workspace switcher. */
  color?: string | null
  createdAt: number
  updatedAt: number
}

export interface WorkspaceRegistry {
  workspaces: Record<string, Workspace>
  activeWorkspaceId: string
}

export const DEFAULT_WORKSPACE_ID = 'default'
