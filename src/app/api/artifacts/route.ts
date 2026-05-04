import { NextResponse } from 'next/server'
import { listEvidenceArtifacts } from '@/lib/server/artifacts/artifact-resolver'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')
  const missionId = searchParams.get('missionId')
  const taskId = searchParams.get('taskId')
  if (!runId && !missionId && !taskId) {
    return NextResponse.json({ error: 'runId, missionId, or taskId is required' }, { status: 400 })
  }
  return NextResponse.json(listEvidenceArtifacts({ runId, missionId, taskId }))
}
