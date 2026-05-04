import { loadAgents } from '@/lib/server/agents/agent-repository'
import { loadSkills } from '@/lib/server/skills/skill-repository'
import { loadSchedules } from '@/lib/server/schedules/schedule-repository'
import { loadConnectors } from '@/lib/server/connectors/connector-repository'
import { loadChatrooms } from '@/lib/server/chatrooms/chatroom-repository'
import { loadMcpServers, loadProjects, loadGoals } from '@/lib/server/storage'
import { getExtensionManager } from '@/lib/server/extensions'
import type { Agent } from '@/types/agent'
import type { Skill } from '@/types/skill'
import type { Schedule } from '@/types/schedule'
import type { Connector } from '@/types/connector'
import type { Chatroom, McpServerConfig } from '@/types'
import type { Project } from '@/types'
import type { Goal } from '@/types/goal'
import type { ExtensionMeta } from '@/types/extension'

/**
 * Bumped to v2 to reflect the expanded surface (connectors, MCP servers,
 * chatrooms, projects, goals, extensions). Importer still accepts v1 manifests.
 */
export const PORTABILITY_FORMAT_VERSION = 2

export interface PortableManifest {
  formatVersion: number
  exportedAt: string
  agents: PortableAgent[]
  skills: PortableSkill[]
  schedules: PortableSchedule[]
  connectors?: PortableConnector[]
  chatrooms?: PortableChatroom[]
  mcpServers?: PortableMcpServer[]
  projects?: PortableProject[]
  goals?: PortableGoal[]
  extensions?: PortableExtensionRef[]
}

export type PortableAgent = Omit<Agent,
  | 'id' | 'credentialId' | 'fallbackCredentialIds' | 'apiEndpoint'
  | 'threadSessionId' | 'lastUsedAt' | 'totalCost' | 'trashedAt'
  | 'openclawAgentId' | 'gatewayProfileId' | 'avatarUrl'
> & {
  originalId: string
}

export type PortableSkill = Pick<Skill,
  | 'name' | 'content' | 'description' | 'tags' | 'scope'
  | 'author' | 'version' | 'primaryEnv' | 'capabilities'
  | 'toolNames' | 'frontmatter'
> & {
  originalId: string
}

export type PortableSchedule = Pick<Schedule,
  | 'name' | 'taskPrompt' | 'taskMode' | 'message' | 'description'
  | 'scheduleType' | 'frequency' | 'cron' | 'atTime' | 'intervalMs'
  | 'timezone' | 'action' | 'path' | 'command'
> & {
  originalId: string
  originalAgentId: string
}

export type PortableConnector = Pick<Connector,
  'name' | 'platform' | 'isEnabled'
> & {
  originalId: string
  originalAgentId?: string | null
  originalChatroomId?: string | null
  /** Non-secret config fields. Credential IDs and tokens are scrubbed. */
  config: Record<string, string>
  /** Marker so importer knows credentials must be re-added. */
  credentialsScrubbed: true
}

export type PortableChatroom = Pick<Chatroom,
  | 'name' | 'description' | 'chatMode' | 'autoAddress'
  | 'routingGuidance' | 'temporary' | 'topic'
> & {
  originalId: string
  originalAgentIds: string[]
  routingRules?: Array<{
    type: 'keyword' | 'capability'
    pattern?: string
    keywords?: string[]
    originalAgentId: string
    priority: number
  }>
}

export type PortableMcpServer = Pick<McpServerConfig,
  | 'name' | 'transport' | 'command' | 'args' | 'cwd' | 'url'
> & {
  originalId: string
  /** Env keys preserved, values scrubbed. */
  envKeys?: string[]
  headerKeys?: string[]
  credentialsScrubbed: true
}

export type PortableProject = Pick<Project,
  | 'name' | 'description' | 'color' | 'objective' | 'audience'
  | 'priorities' | 'openObjectives' | 'capabilityHints'
  | 'credentialRequirements' | 'successMetrics'
  | 'heartbeatPrompt' | 'heartbeatIntervalSec'
> & {
  originalId: string
}

export type PortableGoal = Pick<Goal,
  | 'title' | 'description' | 'level' | 'objective' | 'constraints'
  | 'successMetric' | 'budgetUsd' | 'deadlineAt' | 'status'
> & {
  originalId: string
  originalParentGoalId?: string | null
  originalProjectId?: string | null
  originalAgentId?: string | null
}

export type PortableExtensionRef = Pick<ExtensionMeta,
  | 'name' | 'filename' | 'enabled' | 'isBuiltin' | 'author'
  | 'version' | 'source' | 'sourceUrl' | 'installSource'
>

const AGENT_STRIP_KEYS: (keyof Agent)[] = [
  'id', 'credentialId', 'fallbackCredentialIds', 'apiEndpoint',
  'threadSessionId', 'lastUsedAt', 'totalCost', 'trashedAt',
  'openclawAgentId', 'gatewayProfileId', 'avatarUrl',
]

const SECRET_KEY_PATTERN = /(token|key|secret|password|credential|auth|bearer|apikey)/i

function scrubSecretValues(obj: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!obj) return out
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEY_PATTERN.test(key)) continue
    if (typeof value === 'string') out[key] = value
    else if (value != null) out[key] = String(value)
  }
  return out
}

export function exportConfig(): PortableManifest {
  const agents = loadAgents()
  const skills = loadSkills()
  const schedules = loadSchedules()
  const connectors = loadConnectors()
  const chatrooms = loadChatrooms()
  const mcpServers = loadMcpServers() as Record<string, McpServerConfig>
  const projects = loadProjects() as Record<string, Project>
  const goals = loadGoals() as Record<string, Goal>

  const portableAgents: PortableAgent[] = Object.values(agents)
    .filter((a) => !a.trashedAt && !a.disabled)
    .map((agent) => {
      const portable = { ...agent, originalId: agent.id } as Record<string, unknown>
      for (const key of AGENT_STRIP_KEYS) delete portable[key]
      return portable as PortableAgent
    })

  const portableSkills: PortableSkill[] = Object.values(skills).map((skill) => ({
    originalId: skill.id,
    name: skill.name,
    content: skill.content,
    description: skill.description,
    tags: skill.tags,
    scope: skill.scope,
    author: skill.author,
    version: skill.version,
    primaryEnv: skill.primaryEnv,
    capabilities: skill.capabilities,
    toolNames: skill.toolNames,
    frontmatter: skill.frontmatter,
  }))

  const portableSchedules: PortableSchedule[] = Object.values(schedules)
    .filter((s) => s.status !== 'archived')
    .map((schedule) => ({
      originalId: schedule.id,
      originalAgentId: schedule.agentId,
      name: schedule.name,
      taskPrompt: schedule.taskPrompt,
      taskMode: schedule.taskMode,
      message: schedule.message,
      description: schedule.description,
      scheduleType: schedule.scheduleType,
      frequency: schedule.frequency,
      cron: schedule.cron,
      atTime: schedule.atTime,
      intervalMs: schedule.intervalMs,
      timezone: schedule.timezone,
      action: schedule.action,
      path: schedule.path,
      command: schedule.command,
    }))

  const portableConnectors: PortableConnector[] = Object.values(connectors).map((c) => ({
    originalId: c.id,
    originalAgentId: c.agentId ?? null,
    originalChatroomId: c.chatroomId ?? null,
    name: c.name,
    platform: c.platform,
    isEnabled: false,
    config: scrubSecretValues(c.config),
    credentialsScrubbed: true,
  }))

  const portableChatrooms: PortableChatroom[] = Object.values(chatrooms)
    .filter((c) => !c.archivedAt && !c.temporary)
    .map((c) => ({
      originalId: c.id,
      originalAgentIds: [...(c.agentIds || [])],
      name: c.name,
      description: c.description,
      chatMode: c.chatMode,
      autoAddress: c.autoAddress,
      routingGuidance: c.routingGuidance ?? null,
      temporary: c.temporary,
      topic: c.topic,
      routingRules: (c.routingRules || []).map((r) => ({
        type: r.type,
        pattern: r.pattern,
        keywords: r.keywords,
        originalAgentId: r.agentId,
        priority: r.priority,
      })),
    }))

  const portableMcpServers: PortableMcpServer[] = Object.values(mcpServers).map((s) => ({
    originalId: s.id,
    name: s.name,
    transport: s.transport,
    command: s.command,
    args: s.args,
    cwd: s.cwd,
    url: s.url,
    envKeys: s.env ? Object.keys(s.env) : undefined,
    headerKeys: s.headers ? Object.keys(s.headers) : undefined,
    credentialsScrubbed: true,
  }))

  const portableProjects: PortableProject[] = Object.values(projects).map((p) => ({
    originalId: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    objective: p.objective,
    audience: p.audience,
    priorities: p.priorities,
    openObjectives: p.openObjectives,
    capabilityHints: p.capabilityHints,
    credentialRequirements: p.credentialRequirements,
    successMetrics: p.successMetrics,
    heartbeatPrompt: p.heartbeatPrompt,
    heartbeatIntervalSec: p.heartbeatIntervalSec,
  }))

  const portableGoals: PortableGoal[] = Object.values(goals).map((g) => ({
    originalId: g.id,
    originalParentGoalId: g.parentGoalId ?? null,
    originalProjectId: g.projectId ?? null,
    originalAgentId: g.agentId ?? null,
    title: g.title,
    description: g.description,
    level: g.level,
    objective: g.objective,
    constraints: g.constraints,
    successMetric: g.successMetric,
    budgetUsd: g.budgetUsd,
    deadlineAt: g.deadlineAt,
    status: g.status,
  }))

  const portableExtensions: PortableExtensionRef[] = (() => {
    try {
      const manager = getExtensionManager()
      return manager.listExtensions().map((m) => ({
        name: m.name,
        filename: m.filename,
        enabled: m.enabled,
        isBuiltin: m.isBuiltin,
        author: m.author,
        version: m.version,
        source: m.source,
        sourceUrl: m.sourceUrl,
        installSource: m.installSource,
      }))
    } catch {
      return []
    }
  })()

  return {
    formatVersion: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    agents: portableAgents,
    skills: portableSkills,
    schedules: portableSchedules,
    connectors: portableConnectors,
    chatrooms: portableChatrooms,
    mcpServers: portableMcpServers,
    projects: portableProjects,
    goals: portableGoals,
    extensions: portableExtensions,
  }
}
