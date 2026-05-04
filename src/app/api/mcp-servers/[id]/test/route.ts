import { NextResponse } from 'next/server'
import { loadMcpServers } from '@/lib/server/storage'
import { notFound } from '@/lib/server/collection-helpers'
import { connectMcpServer, mcpToolsToLangChain, disconnectMcpServer } from '@/lib/server/mcp-client'
import { evictMcpClient } from '@/lib/server/mcp-connection-pool'
import { errorMessage } from '@/lib/shared-utils'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const servers = loadMcpServers()
  const server = servers[id]
  if (!server) return notFound()

  // Only evict the pool when the caller explicitly asks for a reset (e.g. the
  // "Re-test" button). Background probes from the server list view skip this
  // so they don't disconnect pooled clients that running agents are using
  // mid-turn. Pool eviction on config change is handled by the PUT route.
  const url = new URL(req.url)
  const reset = url.searchParams.get('reset') === '1' || url.searchParams.get('reset') === 'true'
  if (reset) {
    await evictMcpClient(id)
  }

  try {
    const { client, transport } = await connectMcpServer(server)
    const tools = await mcpToolsToLangChain(client, server.name)
    const toolNames = tools.map((t: any) => t.name)
    await disconnectMcpServer(client, transport)
    return NextResponse.json({ ok: true, tools: toolNames })
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(err) || 'Connection failed' },
      { status: 500 }
    )
  }
}
