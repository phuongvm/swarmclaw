import { NextResponse } from 'next/server'

const REGISTRY_API = 'https://swarmdock-api.onrender.com/api/v1/mcp/servers'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!slug.trim()) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  try {
    const upstream = await fetch(`${REGISTRY_API}/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    })
    if (upstream.status === 404) {
      return NextResponse.json({ error: 'Registry server not found' }, { status: 404 })
    }
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Server detail returned ${upstream.status}` },
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
