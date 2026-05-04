import { NextResponse } from 'next/server'
import { listMissionTemplates } from '@/lib/server/missions/mission-templates'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(listMissionTemplates())
}
