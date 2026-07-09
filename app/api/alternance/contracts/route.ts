import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  const db = createServiceClient()
  let q = db
    .from('alternance_contracts')
    .select('*, company:alternance_companies(id, raison_sociale), student:alternance_students(id, nom, prenom, email, dossier_status)')
    .order('created_at', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  if (!body.company_id || !body.student_id) {
    return NextResponse.json({ error: 'Entreprise et étudiant requis' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: student } = await db
    .from('alternance_students')
    .select('dossier_status')
    .eq('id', body.student_id)
    .maybeSingle()

  if (student?.dossier_status !== 'validated') {
    return NextResponse.json(
      { error: 'Le dossier étudiant doit être validé avant de créer un contrat' },
      { status: 400 },
    )
  }

  const { data, error } = await db
    .from('alternance_contracts')
    .insert({ ...body, created_by: auth.ctx.appUserId })
    .select('*, company:alternance_companies(id, raison_sociale), student:alternance_students(id, nom, prenom, email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
