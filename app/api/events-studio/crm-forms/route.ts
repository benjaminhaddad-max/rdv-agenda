import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'

/**
 * Proxy interne Events Studio → formulaires CRM.
 * Auth : session CRM (cookie).
 */

export async function GET() {
  const userId = await requireCrmUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', forms: [] }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('forms')
    .select('id, slug, name, status')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message, forms: [] }, { status: 500 })
  }

  const forms = (data ?? []).filter((f) => f.status === 'published')
  return NextResponse.json(
    { forms },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}

export async function POST(req: NextRequest) {
  const userId = await requireCrmUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  try {
    const result = await createCrmFormForEvent(body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur'
    const status = msg.includes('Missing required') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
