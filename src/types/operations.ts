export type OperationPulseRange = '24h' | '7d'

export type OperationPulseSeverity = 'low' | 'medium' | 'high'

export type OperationPulseActionKind =
  | 'mission'
  | 'run'
  | 'approval'
  | 'connector'
  | 'budget'
  | 'quality'

export interface OperationPulseKpis {
  activeMissions: number
  runningRuns: number
  failedRuns: number
  pendingApprovals: number
  connectorAttention: number
  budgetWarnings: number
}

export interface OperationPulseAction {
  id: string
  kind: OperationPulseActionKind
  severity: OperationPulseSeverity
  title: string
  summary: string
  href: string
  evidence: string[]
  createdAt: number | null
}

export interface OperationPulse {
  generatedAt: number
  range: OperationPulseRange
  windowStart: number
  kpis: OperationPulseKpis
  actions: OperationPulseAction[]
}
