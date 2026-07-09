import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { notifyDossierCompleted } from '@/lib/alternance/email'
import { STUDENT_PUBLIC_FIELDS } from '@/lib/alternance/constants'

type Ctx = { params: Promise<{ token: string }> }

const NOTIFY_EMAIL = process.env.ALTERNANCE_NOTIFY_EMAIL || 'admissions@diploma-sante.fr'

async function getStudentByToken(token: string) {
  const db = createServiceClient()
  const { data } = await db
    .from('alternance_students')
    .select('id, nom, prenom, email, dossier_status, form_token_expires_at')
    .eq('form_token', token)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  const student = await getStudentByToken(token)
  if (!student) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })

  if (student.form_token_expires_at && new Date(student.form_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Lien expiré' }, { status: 410 })
  }

  const db = createServiceClient()
  const { data: full } = await db
    .from('alternance_students')
    .select(STUDENT_PUBLIC_FIELDS.join(',') + ', id, nom, prenom, email, dossier_status')
    .eq('form_token', token)
    .single()

  return NextResponse.json(full)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  const student = await getStudentByToken(token)
  if (!student) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })

  if (student.form_token_expires_at && new Date(student.form_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Lien expiré' }, { status: 410 })
  }

  if (student.dossier_status === 'validated') {
    return NextResponse.json({ error: 'Dossier déjà validé' }, { status: 403 })
  }

  const body = await req.json()
  const update: Record<string, unknown> = {}
  for (const field of STUDENT_PUBLIC_FIELDS) {
    if (field in body) update[field] = body[field]
  }

  update.dossier_status = 'completed'
  update.form_completed_at = new Date().toISOString()

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_students')
    .update(update)
    .eq('form_token', token)
    .select('id, nom, prenom, dossier_status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notification admin (best-effort)
  notifyDossierCompleted({
    adminEmail: NOTIFY_EMAIL,
    prenom: student.prenom,
    nom: student.nom,
  }).catch(() => {})

  return NextResponse.json({ ok: true, student: data })
}
