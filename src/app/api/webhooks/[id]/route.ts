import { NextResponse } from 'next/server'
import { loadWebhooks, saveWebhooks } from '@/lib/server/storage'
import { mutateItem, deleteItem, notFound, type CollectionOps } from '@/lib/server/collection-helpers'
import { WebhookUpdateSchema, formatZodError } from '@/lib/validation/schemas'
import { handleWebhookPost } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ops: CollectionOps<any> = { load: loadWebhooks, save: saveWebhooks }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const webhooks = loadWebhooks()
  const webhook = webhooks[id]
  if (!webhook) return notFound('Webhook not found')
  return NextResponse.json(webhook)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Invalid or missing request body' }, { status: 400 })
  }
  const parsed = WebhookUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json(formatZodError(parsed.error), { status: 400 })

  const rawKeys = new Set(Object.keys(raw))
  const body = parsed.data
  const result = mutateItem(ops, id, (webhook) => {
    if (rawKeys.has('name') && body.name !== undefined) webhook.name = body.name
    if (rawKeys.has('source') && body.source !== undefined) webhook.source = body.source
    if (rawKeys.has('events') && body.events !== undefined) {
      webhook.events = body.events.map((e) => e.trim()).filter(Boolean)
    }
    if (rawKeys.has('agentId') && body.agentId !== undefined) webhook.agentId = body.agentId
    if (rawKeys.has('secret') && body.secret !== undefined) webhook.secret = body.secret
    if (rawKeys.has('isEnabled') && body.isEnabled !== undefined) webhook.isEnabled = body.isEnabled
    webhook.updatedAt = Date.now()
    return webhook
  })
  if (!result) return notFound('Webhook not found')
  return NextResponse.json(result)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!deleteItem(ops, id)) return notFound('Webhook not found')
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleWebhookPost(req, id)
}
