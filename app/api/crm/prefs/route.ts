import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'

export async function GET() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createServiceClient()
  // select('*') évite un 500 si une colonne (ex: contact_about_fields) n'a pas
  // encore été ajoutée via migration : on renvoie ce qui existe.
  const { data } = await db
    .from('crm_user_prefs')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!data) return NextResponse.json({})
  return NextResponse.json({
    col_order: data.col_order ?? null,
    col_widths: data.col_widths ?? null,
    contact_about_fields: data.contact_about_fields ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
  if (body.col_order  !== undefined) update.col_order  = body.col_order
  if (body.col_widths !== undefined) update.col_widths = body.col_widths
  if (body.contact_about_fields !== undefined) update.contact_about_fields = body.contact_about_fields

  const db = createServiceClient()
  const { error } = await db
    .from('crm_user_prefs')
    .upsert(update, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
