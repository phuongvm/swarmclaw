import { NextResponse } from 'next/server'

// Server-side proxy for the public SwarmDock MCP Registry. The upstream API
// does not emit CORS headers, so the RegistryBrowser component in the browser
// cannot fetch it directly. This route forwards the search request and its
// JSON response untouched.

const REGISTRY_API = 'https://swarmdock-api.onrender.com/api/v1/mcp/servers'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const limitRaw = url.searchParams.get('limit') ?? '20'
  const limit = Math.max(1, Math.min(Number.parseInt(limitRaw, 10) || 20, 50))
  const qs = new URLSearchParams({ limit: String(limit) })
  if (q.trim()) qs.set('q', q.trim())

  try {
    const upstream = await fetch(`${REGISTRY_API}?${qs.toString()}`, {
      headers: { accept: 'application/json' },
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Registry returned ${upstream.status}` },
        { status: 502 },
      )
    }
    const data = await upstream.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Registry unreachable' },
      { status: 502 },
    )
  }
}
