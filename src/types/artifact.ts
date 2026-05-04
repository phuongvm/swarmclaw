export type EvidenceArtifactKind =
  | 'task_artifact'
  | 'task_output'
  | 'completion_report'
  | 'task_result'
  | 'protocol_artifact'
  | 'mission_report'
  | 'share_link'
  | 'mission_milestone'
  | 'run_result'
  | 'run_error'
  | 'run_citation'

export interface EvidenceArtifact {
  id: string
  kind: EvidenceArtifactKind
  title: string
  description?: string | null
  url?: string | null
  href?: string | null
  preview?: string | null
  createdAt?: number | null
  source: {
    type: 'run' | 'mission' | 'task' | 'protocol' | 'share'
    id: string
    label?: string | null
  }
}
