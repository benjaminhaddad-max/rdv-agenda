import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'
import { sendStudentDossierEmail } from '@/lib/alternance/email'
import { buildDossierUrl, formTokenExpiresAt, generateFormToken } from '@/lib/alternance/tokens'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const token = generateFormToken()
  const expires = formTokenExpiresAt()

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_students')
    .update({
      form_token: token,
      form_token_expires_at: expires.toISOString(),
      form_sent_at: new Date().toISOString(),
      dossier_status: 'link_sent',
    })
    .eq('id', id)
    .select('id, nom, prenom, email')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const url = buildDossierUrl(token)
  let emailSent = false
  let emailError: string | null = null

  try {
    await sendStudentDossierEmail({
      to: data.email,
      prenom: data.prenom,
      nom: data.nom,
      dossierUrl: url,
    })
    emailSent = true
  } catch (e) {
    emailError = e instanceof Error ? e.message : 'Erreur envoi email'
  }

  return NextResponse.json({
    ...data,
    dossier_url: url,
    email_sent: emailSent,
    email_error: emailError,
  })
}
