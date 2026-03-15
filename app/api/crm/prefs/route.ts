import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'

export async function GET() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createServiceClient()
  const { data } = await db
    .from('crm_user_prefs')
    .select('col_order, col_widths')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data ?? {})
}

export async function PATCH(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
  if (body.col_order  !== undefined) update.col_order  = body.col_order
  if (body.col_widths !== undefined) update.col_widths = body.col_widths

  const db = createServiceClient()
  const { error } = await db
    .from('crm_user_prefs')
    .upsert(update, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
