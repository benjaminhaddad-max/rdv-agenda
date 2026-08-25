/**
 * /api/cron/aircall-sync
 *
 * Cron qui pousse les contacts CRM récemment créés/modifiés dans le carnet
 * d'adresses Aircall partagé. Objectif : quand un lead rappelle un télépro,
 * son "Prénom Nom — Telepro: X" s'affiche sur le téléphone Aircall au lieu
 * d'un numéro inconnu.
 *
 * Stratégie incrémentale (safe pour le rate-limit Aircall = 60 req/min) :
 *   - on prend les contacts modifiés depuis le dernier passage (lookback 6 h)
 *   - on plafonne à BATCH_SIZE par run pour rester < 60 req/min
 *   - pour chaque contact : search by phone → create or update
 *
 * Le seed initial (~138k) a déjà été importé dans Aircall. Ce cron + le
 * push à l'ouverture de fiche prennent le relais sur les nouveautés.
 *
 * Idempotent : si rien à pousser, ne fait rien. Si Aircall pas configuré,
 * skip silencieusement (n'empêche pas les autres crons de tourner).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import { isAircallEnabled } from '@/lib/aircall'
import {
  pushCrmContactToAircall,
  type CrmContactForAircall,
} from '@/lib/aircall-crm'

export const maxDuration = 120

const LOOKBACK_MINUTES = 6 * 60
const BATCH_SIZE = 25 // ≈ 50 appels API (search + upsert) bien sous 60/min

type ContactRow = CrmContactForAircall & {
  updated_at: string | null
  synced_at: string | null
}

type TeleproRow = { id: string; name: string | null }

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

  const { data: rows, error } = await db
    .from('crm_contacts')
    .select(
      'hubspot_contact_id, firstname, lastname, email, phone, telepro_user_id, classe_actuelle, hs_lead_status, updated_at, synced_at',
    )
    .or(`updated_at.gte.${sinceIso},synced_at.gte.${sinceIso}`)
    .not('phone', 'is', null)
    .order('synced_at', { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE * 4)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const contacts = (rows ?? []) as ContactRow[]
  if (contacts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, since: sinceIso })
  }

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

    const teleproName = c.telepro_user_id ? teleproById.get(c.telepro_user_id) : null

    try {
      const result = await pushCrmContactToAircall(c, teleproName)
      if (result === 'invalid_phone') {
        invalidPhone++
        continue
      }
      if (result === 'created') created++
      else if (result === 'updated') updated++
      else skipped++
      processed++
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
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
