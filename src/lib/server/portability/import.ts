import { genId } from '@/lib/id'
import { loadAgents, saveAgents } from '@/lib/server/agents/agent-repository'
import { loadSkills, saveSkill } from '@/lib/server/skills/skill-repository'
import { loadSchedules, upsertSchedule } from '@/lib/server/schedules/schedule-repository'
import { loadConnectors, upsertConnector } from '@/lib/server/connectors/connector-repository'
import { loadChatrooms, upsertChatroom } from '@/lib/server/chatrooms/chatroom-repository'
import { loadMcpServers, saveMcpServers, loadProjects, saveProjects } from '@/lib/server/storage'
import { saveGoal } from '@/lib/server/goals/goal-repository'
import { logActivity } from '@/lib/server/activity/activity-log'
import type { Agent } from '@/types/agent'
import type { Skill } from '@/types/skill'
import type { Schedule } from '@/types/schedule'
import type { Connector } from '@/types/connector'
import type { Chatroom, McpServerConfig, Project } from '@/types'
import type { Goal } from '@/types/goal'
import type { PortableManifest, PortableAgent } from './export'
import { PORTABILITY_FORMAT_VERSION } from './export'

export interface ImportResult {
  agents: { created: number; skipped: number; names: string[] }
  skills: { created: number; skipped: number; names: string[] }
  schedules: { created: number; skipped: number; names: string[] }
  connectors: { created: number; skipped: number; names: string[]; needsCredentials: string[] }
  chatrooms: { created: number; skipped: number; names: string[] }
  mcpServers: { created: number; skipped: number; names: string[]; needsCredentials: string[] }
  projects: { created: number; skipped: number; names: string[] }
  goals: { created: number; skipped: number; titles: string[] }
  /** Maps original IDs to new IDs for reference */
  idMap: Record<string, string>
}

function deduplicateName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  let suffix = 2
  while (existingNames.has(`${name} (${suffix})`)) suffix++
  return `${name} (${suffix})`
}

export function importConfig(manifest: PortableManifest): ImportResult {
  if (manifest.formatVersion > PORTABILITY_FORMAT_VERSION) {
    throw new Error(`Unsupported format version ${manifest.formatVersion} (max supported: ${PORTABILITY_FORMAT_VERSION})`)
  }

  const idMap: Record<string, string> = {}
  const result: ImportResult = {
    agents: { created: 0, skipped: 0, names: [] },
    skills: { created: 0, skipped: 0, names: [] },
    schedules: { created: 0, skipped: 0, names: [] },
    connectors: { created: 0, skipped: 0, names: [], needsCredentials: [] },
    chatrooms: { created: 0, skipped: 0, names: [] },
    mcpServers: { created: 0, skipped: 0, names: [], needsCredentials: [] },
    projects: { created: 0, skipped: 0, names: [] },
    goals: { created: 0, skipped: 0, titles: [] },
    idMap,
  }

  // --- Skills first (agents may reference them) ---
  const existingSkills = loadSkills()
  const existingSkillNames = new Set(Object.values(existingSkills).map((s) => s.name))
  for (const portable of manifest.skills) {
    const name = deduplicateName(portable.name, existingSkillNames)
    const id = genId()
    idMap[portable.originalId] = id
    existingSkillNames.add(name)
    const skill: Skill = {
      id,
      name,
      filename: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
      content: portable.content,
      description: portable.description,
      tags: portable.tags,
      scope: portable.scope || 'global',
      author: portable.author,
      version: portable.version,
      primaryEnv: portable.primaryEnv,
      capabilities: portable.capabilities,
      toolNames: portable.toolNames,
      frontmatter: portable.frontmatter,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    saveSkill(id, skill)
    result.skills.created++
    result.skills.names.push(name)
  }

  // --- Projects (agents and goals may reference them) ---
  if (manifest.projects && manifest.projects.length) {
    const existingProjects = loadProjects() as Record<string, Project>
    const existingProjectNames = new Set(Object.values(existingProjects).map((p) => p.name))
    for (const portable of manifest.projects) {
      const name = deduplicateName(portable.name, existingProjectNames)
      const id = genId()
      idMap[portable.originalId] = id
      existingProjectNames.add(name)
      const now = Date.now()
      const project: Project = {
        id,
        name,
        description: portable.description ?? '',
        color: portable.color,
        objective: portable.objective,
        audience: portable.audience,
        priorities: portable.priorities,
        openObjectives: portable.openObjectives,
        capabilityHints: portable.capabilityHints,
        credentialRequirements: portable.credentialRequirements,
        successMetrics: portable.successMetrics,
        heartbeatPrompt: portable.heartbeatPrompt,
        heartbeatIntervalSec: portable.heartbeatIntervalSec,
        createdAt: now,
        updatedAt: now,
      }
      existingProjects[id] = project
      result.projects.created++
      result.projects.names.push(name)
    }
    saveProjects(existingProjects)
  }

  // --- Agents ---
  const existingAgents = loadAgents()
  const existingAgentNames = new Set(Object.values(existingAgents).map((a) => a.name))
  for (const portable of manifest.agents) {
    const name = deduplicateName(portable.name, existingAgentNames)
    const id = genId()
    const now = Date.now()
    idMap[portable.originalId] = id
    existingAgentNames.add(name)
    const remappedSkillIds = (portable.skillIds || []).map((sid) => idMap[sid] || sid)
    const remappedProjectId = portable.projectId && idMap[portable.projectId] ? idMap[portable.projectId] : portable.projectId
    const agent: Agent = {
      ...(portable as Omit<PortableAgent, 'originalId'>),
      id,
      name,
      skillIds: remappedSkillIds,
      projectId: remappedProjectId,
      threadSessionId: null,
      lastUsedAt: undefined,
      totalCost: undefined,
      trashedAt: undefined,
      credentialId: null,
      fallbackCredentialIds: [],
      apiEndpoint: null,
      createdAt: typeof portable.createdAt === 'number' ? portable.createdAt : now,
      updatedAt: now,
    }
    existingAgents[id] = agent
    result.agents.created++
    result.agents.names.push(name)
  }
  saveAgents(existingAgents)

  // --- Schedules (need agent ID mapping) ---
  const existingSchedules = loadSchedules()
  const existingScheduleNames = new Set(Object.values(existingSchedules).map((s) => s.name))
  for (const portable of manifest.schedules) {
    const newAgentId = idMap[portable.originalAgentId]
    if (!newAgentId) { result.schedules.skipped++; continue }
    const name = deduplicateName(portable.name, existingScheduleNames)
    const id = genId()
    idMap[portable.originalId] = id
    existingScheduleNames.add(name)
    const schedule: Schedule = {
      id, name, agentId: newAgentId,
      taskPrompt: portable.taskPrompt,
      taskMode: portable.taskMode,
      message: portable.message,
      description: portable.description,
      scheduleType: portable.scheduleType,
      frequency: portable.frequency,
      cron: portable.cron,
      atTime: portable.atTime,
      intervalMs: portable.intervalMs,
      timezone: portable.timezone,
      action: portable.action,
      path: portable.path,
      command: portable.command,
      status: 'paused',
      createdAt: Date.now(),
    }
    upsertSchedule(id, schedule)
    result.schedules.created++
    result.schedules.names.push(name)
  }

  // --- MCP Servers ---
  if (manifest.mcpServers && manifest.mcpServers.length) {
    const existingMcp = loadMcpServers() as Record<string, McpServerConfig>
    const existingMcpNames = new Set(Object.values(existingMcp).map((s) => s.name))
    for (const portable of manifest.mcpServers) {
      const name = deduplicateName(portable.name, existingMcpNames)
      const id = genId()
      idMap[portable.originalId] = id
      existingMcpNames.add(name)
      const env: Record<string, string> = {}
      for (const key of portable.envKeys || []) env[key] = ''
      const headers: Record<string, string> = {}
      for (const key of portable.headerKeys || []) headers[key] = ''
      existingMcp[id] = {
        id, name,
        transport: portable.transport,
        command: portable.command,
        args: portable.args,
        cwd: portable.cwd,
        url: portable.url,
        env: Object.keys(env).length ? env : undefined,
        headers: Object.keys(headers).length ? headers : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as McpServerConfig
      result.mcpServers.created++
      result.mcpServers.names.push(name)
      if ((portable.envKeys?.length || 0) + (portable.headerKeys?.length || 0) > 0) {
        result.mcpServers.needsCredentials.push(name)
      }
    }
    saveMcpServers(existingMcp)
  }

  // --- Connectors ---
  if (manifest.connectors && manifest.connectors.length) {
    const existingConnectors = loadConnectors()
    const existingConnectorNames = new Set(Object.values(existingConnectors).map((c) => c.name))
    for (const portable of manifest.connectors) {
      const name = deduplicateName(portable.name, existingConnectorNames)
      const id = genId()
      idMap[portable.originalId] = id
      existingConnectorNames.add(name)
      const now = Date.now()
      const remappedAgentId = portable.originalAgentId && idMap[portable.originalAgentId]
        ? idMap[portable.originalAgentId]
        : null
      const remappedChatroomId = portable.originalChatroomId && idMap[portable.originalChatroomId]
        ? idMap[portable.originalChatroomId]
        : null
      const connector: Connector = {
        id, name,
        platform: portable.platform,
        agentId: remappedAgentId,
        chatroomId: remappedChatroomId,
        credentialId: null,
        config: { ...portable.config },
        isEnabled: false,
        status: 'stopped',
        lastError: null,
        hasCredentials: false,
        authenticated: false,
        createdAt: now,
        updatedAt: now,
      }
      upsertConnector(id, connector)
      result.connectors.created++
      result.connectors.names.push(name)
      result.connectors.needsCredentials.push(name)
    }
  }

  // --- Chatrooms ---
  if (manifest.chatrooms && manifest.chatrooms.length) {
    const existingChatrooms = loadChatrooms()
    const existingChatroomNames = new Set(Object.values(existingChatrooms).map((c) => c.name))
    for (const portable of manifest.chatrooms) {
      const name = deduplicateName(portable.name, existingChatroomNames)
      const id = genId()
      idMap[portable.originalId] = id
      existingChatroomNames.add(name)
      const now = Date.now()
      const remappedAgentIds = portable.originalAgentIds
        .map((aid) => idMap[aid])
        .filter((aid): aid is string => Boolean(aid))
      const remappedRules = (portable.routingRules || []).map((r, idx) => ({
        id: `route-${idx + 1}`,
        type: r.type,
        pattern: r.pattern,
        keywords: r.keywords,
        agentId: idMap[r.originalAgentId] || r.originalAgentId,
        priority: r.priority,
      }))
      const chatroom: Chatroom = {
        id, name,
        description: portable.description,
        agentIds: remappedAgentIds,
        messages: [],
        chatMode: portable.chatMode,
        autoAddress: portable.autoAddress,
        routingGuidance: portable.routingGuidance,
        routingRules: remappedRules,
        temporary: portable.temporary,
        topic: portable.topic,
        createdAt: now,
        updatedAt: now,
      }
      upsertChatroom(id, chatroom)
      result.chatrooms.created++
      result.chatrooms.names.push(name)
    }
  }

  // --- Goals (after projects + agents so refs can be remapped) ---
  if (manifest.goals && manifest.goals.length) {
    // Two-pass to handle parent goal refs.
    const stagedGoals: Array<{ id: string; portable: typeof manifest.goals[number] }> = []
    for (const portable of manifest.goals) {
      const id = genId()
      idMap[portable.originalId] = id
      stagedGoals.push({ id, portable })
      result.goals.created++
      result.goals.titles.push(portable.title)
    }
    for (const { id, portable } of stagedGoals) {
      const goal: Goal = {
        id,
        title: portable.title,
        description: portable.description,
        level: portable.level,
        objective: portable.objective,
        constraints: portable.constraints,
        successMetric: portable.successMetric,
        budgetUsd: portable.budgetUsd,
        deadlineAt: portable.deadlineAt,
        status: portable.status,
        parentGoalId: portable.originalParentGoalId
          ? idMap[portable.originalParentGoalId] ?? null
          : null,
        projectId: portable.originalProjectId
          ? idMap[portable.originalProjectId] ?? null
          : null,
        agentId: portable.originalAgentId
          ? idMap[portable.originalAgentId] ?? null
          : null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      saveGoal(id, goal)
    }
  }

  logActivity({
    entityType: 'system',
    entityId: 'portability',
    action: 'imported',
    actor: 'user',
    summary: `Imported ${result.agents.created} agents, ${result.skills.created} skills, ${result.schedules.created} schedules, `
      + `${result.connectors.created} connectors, ${result.chatrooms.created} chatrooms, `
      + `${result.mcpServers.created} MCP servers, ${result.projects.created} projects, ${result.goals.created} goals`,
  })

  return result
}
