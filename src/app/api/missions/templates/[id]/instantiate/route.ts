import { NextResponse } from 'next/server'
import { z } from 'zod'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { formatZodError } from '@/lib/validation/schemas'
import { notFound } from '@/lib/server/collection-helpers'
import { createMissionFromTemplate } from '@/lib/server/missions/mission-service'
import { patchSession } from '@/lib/server/sessions/session-repository'

export const dynamic = 'force-dynamic'

const BudgetOverrideSchema = z.object({
  maxUsd: z.number().positive().nullable().optional(),
  maxTokens: z.number().positive().int().nullable().optional(),
  maxToolCalls: z.number().positive().int().nullable().optional(),
  maxWallclockSec: z.number().positive().int().nullable().optional(),
  maxTurns: z.number().positive().int().nullable().optional(),
  warnAtFractions: z.array(z.number().positive().lt(1)).max(10).optional(),
}).partial()

const ReportScheduleSchema = z.object({
  intervalSec: z.number().int().min(30),
  format: z.enum(['markdown', 'slack', 'discord', 'email', 'audio']),
  enabled: z.boolean().default(true),
  lastReportAt: z.number().nullable().optional(),
}).strict()

const InstantiateSchema = z.object({
  rootSessionId: z.string().min(1, 'rootSessionId is required'),
  overrides: z.object({
    title: z.string().min(1).max(200).optional(),
    goal: z.string().min(1).max(4000).optional(),
    successCriteria: z.array(z.string().min(1)).max(32).optional(),
    budget: BudgetOverrideSchema.optional(),
    reportSchedule: ReportScheduleSchema.nullable().optional(),
    agentIds: z.array(z.string().min(1)).max(32).optional(),
    reportConnectorIds: z.array(z.string().min(1)).max(8).optional(),
  }).optional(),
}).strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: body, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error
  const parsed = InstantiateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(formatZodError(parsed.error), { status: 400 })

  const result = createMissionFromTemplate({
    templateId: id,
    rootSessionId: parsed.data.rootSessionId,
    overrides: parsed.data.overrides,
  })
  if (!result) return notFound()

  try {
    patchSession(result.mission.rootSessionId, (current) => {
      if (!current) return null
      return { ...current, missionId: result.mission.id }
    })
  } catch {
    // Session may not exist yet; budget hook falls back to service map.
  }

  return NextResponse.json({ mission: result.mission, template: result.template })
}
