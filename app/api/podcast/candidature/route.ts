import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isPodcastProfileType } from '@/lib/podcast-casting'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(v: unknown, max: number): string | null {
  if (v == null) return null
  const s = String(v).trim().slice(0, max)
  return s || null
}

/**
 * POST /api/podcast/candidature — public (page /podcast).
 * Enregistre une candidature au podcast « Première année » dans podcast_casting,
 * rattachée au contact CRM existant quand l'email correspond.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

  // Honeypot : un bot remplit le champ caché → on répond OK sans rien enregistrer.
  if (text(body.website, 200)) return NextResponse.json({ ok: true })

  const firstname = text(body.firstname, 80)
  const lastname = text(body.lastname, 80)
  const email = text(body.email, 200)?.toLowerCase() ?? null
  const phone = text(body.phone, 40)
  const story = text(body.story, 4000)
  if (!firstname || !lastname) return NextResponse.json({ error: 'Merci d’indiquer votre prénom et votre nom.' }, { status: 400 })
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
  if (!phone || phone.replace(/\D/g, '').length < 9) return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
  if (!isPodcastProfileType(body.profile_type)) return NextResponse.json({ error: 'Merci d’indiquer votre profil.' }, { status: 400 })
  if (!story || story.length < 30) return NextResponse.json({ error: 'Racontez-nous votre parcours en quelques lignes (30 caractères minimum).' }, { status: 400 })
  if (body.consent !== true) return NextResponse.json({ error: 'Merci d’accepter d’être recontacté.' }, { status: 400 })

  const db = createServiceClient()
  // ilike pour ignorer la casse ; on échappe % et _ pour garder une égalité stricte.
  const emailPattern = email.replace(/[%_\\]/g, '\\$&')

  const { data: contact } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id')
    .ilike('email', emailPattern)
    .limit(1)
    .maybeSingle()

  const row = {
    hubspot_contact_id: contact?.hubspot_contact_id ? String(contact.hubspot_contact_id) : null,
    profile_type: body.profile_type,
    source: 'candidature',
    full_name: `${firstname} ${lastname}`,
    phone,
    email,
    parcours: text(body.parcours, 500),
    social: text(body.social, 200),
    story,
    updated_at: new Date().toISOString(),
  }

  // Même email déjà candidat (et pas encore traité) → on met à jour au lieu de doublonner.
  const { data: existing } = await db
    .from('podcast_casting')
    .select('id, status')
    .eq('source', 'candidature')
    .ilike('email', emailPattern)
    .limit(1)
    .maybeSingle()

  const { error } = existing
    ? await db.from('podcast_casting').update(row).eq('id', existing.id)
    : await db.from('podcast_casting').insert({ ...row, status: 'nouvelle' })

  if (error) {
    console.error('[podcast/candidature]', error.message)
    return NextResponse.json({ error: 'Une erreur est survenue, merci de réessayer.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
