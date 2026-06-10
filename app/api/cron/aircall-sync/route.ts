/**
 * /api/cron/aircall-sync
 *
 * Cron qui pousse les contacts CRM récemment créés/modifiés dans le carnet
 * d'adresses Aircall partagé. Objectif : quand un lead rappelle un télépro,
 * son "Prénom Nom — Telepro: X" s'affiche sur le téléphone Aircall au lieu
 * d'un numéro inconnu.
 *
 * Stratégie incrémentale (safe pour le rate-limit Aircall = 60 req/min) :
 *   - on prend les contacts modifiés depuis le dernier passage (lookback 20 min)
 *   - on plafonne à BATCH_SIZE par run pour rester < 60 req/min
 *   - pour chaque contact : search by phone → create or update
 *
 * Pour le seed initial (160k contacts), utiliser le CSV export
 * (`bun run scripts/export-aircall-contacts.mjs`) puis l'uploader UNE FOIS
 * via le dashboard Aircall. Ce cron prend ensuite le relais sur les nouveautés.
 *
 * Idempotent : si rien à pousser, ne fait rien. Si Aircall pas configuré,
 * skip silencieusement (n'empêche pas les autres crons de tourner).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import {
  isAircallEnabled,
  toE164French,
  upsertAircallContact,
  type AircallContactInput,
} from '@/lib/aircall'

export const maxDuration = 120

const LOOKBACK_MINUTES = 20
const BATCH_SIZE = 25 // ≈ 50 appels API (search + upsert) bien sous 60/min

type ContactRow = {
  hubspot_contact_id: string | null
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  telepro_user_id: string | null
  updated_at: string | null
  synced_at: string | null
}

type TeleproRow = { id: string; name: string | null }

function cleanName(v: string | null | undefined): string {
  if (!v) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  if (!isAircallEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'AIRCALL_API_ID / AIRCALL_API_TOKEN not configured',
    })
  }

  const db = createServiceClient()
  const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString()

  // On vise les contacts récemment touchés ET qui ont un téléphone exploitable.
  // On lit `synced_at` (mis à jour à chaque sync HubSpot / création locale)
  // pour attraper aussi les nouveaux contacts venant de webhooks.
  const { data: rows, error } = await db
    .from('crm_contacts')
    .select(
      'hubspot_contact_id, firstname, lastname, email, phone, telepro_user_id, updated_at, synced_at',
    )
    .or(`updated_at.gte.${sinceIso},synced_at.gte.${sinceIso}`)
    .not('phone', 'is', null)
    .order('synced_at', { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE * 4) // marge pour filtrer les numéros invalides / déjà à jour

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const contacts = (rows ?? []) as ContactRow[]
  if (contacts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, since: sinceIso })
  }

  // Map télépro id → nom (pour le suffixe "— Telepro: X")
  const teleproIds = Array.from(
    new Set(
      contacts
        .map(c => c.telepro_user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )

  const teleproById = new Map<string, string>()
  if (teleproIds.length > 0) {
    const { data: tps } = await db
      .from('rdv_users')
      .select('id, name')
      .in('id', teleproIds)
    for (const tp of ((tps ?? []) as TeleproRow[])) {
      if (tp.id && tp.name) teleproById.set(tp.id, tp.name)
    }
  }

  let processed = 0
  let created = 0
  let updated = 0
  let skipped = 0
  let invalidPhone = 0
  const errors: string[] = []

  for (const c of contacts) {
    if (processed >= BATCH_SIZE) break

    const phone = toE164French(c.phone)
    if (!phone) {
      invalidPhone++
      continue
    }

    const first = cleanName(c.firstname) || 'Lead'
    const last = cleanName(c.lastname) || ''
    const teleproName = c.telepro_user_id ? teleproById.get(c.telepro_user_id) : null

    // Suffixe "— Telepro: X" sur le nom de famille pour qu'il soit visible
    // dans Aircall (qui affiche "first_name last_name" sur l'écran d'appel).
    const lastWithTag = teleproName
      ? `${last} — Telepro: ${teleproName}`.trim()
      : last

    const input: AircallContactInput = {
      externalId: c.hubspot_contact_id ?? undefined,
      firstName: first,
      lastName: lastWithTag,
      phone,
      email: c.email,
      information: c.hubspot_contact_id
        ? `HubSpot contact ID: ${c.hubspot_contact_id}`
        : undefined,
    }

    try {
      const result = await upsertAircallContact(input)
      if (result === 'created') created++
      else if (result === 'updated') updated++
      else skipped++
      processed++
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
      // Si Aircall renvoie une rafale d'erreurs, on coupe court.
      if (errors.length >= 5) break
    }
  }

  return NextResponse.json({
    ok: true,
    since: sinceIso,
    processed,
    created,
    updated,
    skipped,
    invalid_phone: invalidPhone,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  })
}
