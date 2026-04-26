import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/tasks
 * Query params:
 *   owner    : filtre par owner_id (assigné)
 *   contact  : filtre par hubspot_contact_id
 *   deal     : filtre par hubspot_deal_id
 *   status   : pending | completed | cancelled (défaut : pending)
 *   due      : today | overdue | week | all (défaut : all)
 *   limit    : défaut 100
 */
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl

  const owner   = searchParams.get('owner') ?? ''
  const contact = searchParams.get('contact') ?? ''
  const deal    = searchParams.get('deal') ?? ''
  const status  = searchParams.get('status') ?? 'pending'
  const due     = searchParams.get('due') ?? 'all'
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  let q = db.from('crm_tasks').select('*').limit(limit)

  if (owner)   q = q.eq('owner_id', owner)
  if (contact) q = q.eq('hubspot_contact_id', contact)
  if (deal)    q = q.eq('hubspot_deal_id', deal)
  if (status !== 'all') q = q.eq('status', status)

  const now = new Date()
  if (due === 'today') {
    const start = new Date(now); start.setHours(0,0,0,0)
    const end   = new Date(now); end.setHours(23,59,59,999)
    q = q.gte('due_at', start.toISOString()).lte('due_at', end.toISOString())
  } else if (due === 'overdue') {
    q = q.lt('due_at', now.toISOString())
  } else if (due === 'week') {
    const end = new Date(now); end.setDate(end.getDate() + 7)
    q = q.lte('due_at', end.toISOString())
  }

  q = q.order('due_at', { ascending: true, nullsFirst: false })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}

/**
 * POST /api/crm/tasks
 * Body: { title, description?, hubspot_contact_id?, hubspot_deal_id?,
 *         owner_id?, created_by?, priority?, task_type?, due_at? }
 */
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const body = await req.json()

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title requis' }, { status: 400 })
  }
  if (!body.hubspot_contact_id && !body.hubspot_deal_id) {
    return NextResponse.json(
      { error: 'Au moins un lien (contact ou deal) est requis' },
      { status: 400 }
    )
  }

  const insert = {
    title:               body.title.trim(),
    description:         body.description ?? null,
    hubspot_contact_id:  body.hubspot_contact_id ?? null,
    hubspot_deal_id:     body.hubspot_deal_id ?? null,
    owner_id:            body.owner_id ?? null,
    created_by:          body.created_by ?? null,
    priority:            body.priority ?? 'normal',
    task_type:           body.task_type ?? 'follow_up',
    due_at:              body.due_at ?? null,
    status:              'pending',
  }

  const { data, error } = await db
    .from('crm_tasks')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}
