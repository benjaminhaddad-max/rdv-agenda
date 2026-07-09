import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  const db = createServiceClient()
  let q = db.from('alternance_students').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('dossier_status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  if (!body.nom?.trim() || !body.prenom?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: 'Nom, prénom et email requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_students')
    .insert({
      nom: body.nom.trim(),
      prenom: body.prenom.trim(),
      email: body.email.trim().toLowerCase(),
      crm_contact_id: body.crm_contact_id ?? null,
      notes: body.notes ?? null,
      created_by: auth.ctx.appUserId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
