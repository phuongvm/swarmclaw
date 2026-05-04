/**
 * Customizable per-team task workflow states. Independent from the
 * BoardTaskStatus lifecycle (queued/running/completed/...): a task may carry
 * a workflowStateId such as "needs-review" or "blocked-on-pm" that is
 * orthogonal to its execution lifecycle.
 */
export type WorkflowStateCategory =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'cancelled'

export interface WorkflowState {
  id: string
  /** Display label, e.g. "Needs Review", "Blocked on PM". */
  label: string
  /** Higher-level bucket; used by UI grouping and reporting. */
  category: WorkflowStateCategory
  /** Optional team/project scope. Empty = global. */
  projectId?: string | null
  /** Hex color for UI badges. */
  color?: string | null
  /** Sort order within a category. */
  position?: number
  /** Whether tasks in this state should be auto-archived after N days. */
  autoArchiveAfterDays?: number | null
  createdAt: number
  updatedAt: number
}

export const DEFAULT_WORKFLOW_STATES: Omit<WorkflowState, 'createdAt' | 'updatedAt'>[] = [
  { id: 'triage', label: 'Triage', category: 'triage', position: 1, color: '#f59e0b' },
  { id: 'backlog', label: 'Backlog', category: 'backlog', position: 2, color: '#6b7280' },
  { id: 'todo', label: 'Todo', category: 'unstarted', position: 3, color: '#3b82f6' },
  { id: 'in_progress', label: 'In Progress', category: 'started', position: 4, color: '#8b5cf6' },
  { id: 'needs_review', label: 'Needs Review', category: 'started', position: 5, color: '#ec4899' },
  { id: 'done', label: 'Done', category: 'completed', position: 6, color: '#10b981' },
  { id: 'cancelled', label: 'Cancelled', category: 'cancelled', position: 7, color: '#9ca3af' },
]
