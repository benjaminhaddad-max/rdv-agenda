/**
 * /api/webhooks/aircall
 *
 * Reçoit les webhooks Aircall (event `call.ended`) et enregistre l'appel dans
 * la timeline du CRM (`crm_activities`, activity_type = 'call'). Objectif :
 * remonter l'historique des appels (entrants / sortants, durée, manqué,
 * enregistrement) directement sur la fiche du contact, comme HubSpot le fait.
 *
 * Flux :
 *   Aircall  ──(POST call.ended)──▶  ce webhook
 *        │
 *        ├─ retrouve le contact CRM par numéro (raw_digits → variantes)
 *        ├─ mappe l'agent Aircall (email) → owner CRM si possible
 *        └─ upsert dans crm_activities (idempotent via l'id d'appel Aircall)
 *
 * Sécurité : si AIRCALL_WEBHOOK_TOKEN est défini, on exige que le token soit
 * fourni (champ `token` du payload, header `x-aircall-token`, ou `?token=`).
 * Sinon on accepte (pratique pour démarrer, mais configure le token en prod).
 *
 * Idempotent : on réutilise la colonne UNIQUE `hubspot_engagement_id` avec une
 * clé préfixée `aircall_<callId>`. Plusieurs events pour le même appel ne créent
 * donc qu'une seule ligne (upsert onConflict).
 *
 * Tolérant aux erreurs : tout event non géré ou contact introuvable renvoie
 * 200 pour qu'Aircall ne réessaie pas en boucle.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { aircallPhoneVariants } from '@/lib/aircall'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type AircallUser = {
  id?: number
  name?: string | null
  email?: string | null
}

type AircallCall = {
  id?: number
  direction?: 'inbound' | 'outbound' | string | null
  status?: string | null
  started_at?: number | null
  answered_at?: number | null
  ended_at?: number | null
  duration?: number | null
  raw_digits?: string | null
  missed_call_reason?: string | null
  recording?: string | null
  voicemail?: string | null
  user?: AircallUser | null
  number?: { id?: number; name?: string | null; digits?: string | null } | null
}

type AircallWebhookPayload = {
  resource?: string
  event?: string
  timestamp?: number
  token?: string
  data?: AircallCall
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyToken(req: NextRequest, payload: AircallWebhookPayload): boolean {
  const expected = process.env.AIRCALL_WEBHOOK_TOKEN || ''
  if (!expected) return true // pas de token configuré → on accepte
  const provided =
    payload.token ||
    req.headers.get('x-aircall-token') ||
    req.nextUrl.searchParams.get('token') ||
    ''
  return timingSafeEqual(provided, expected)
}

function fmtDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m} min ${rem}s` : `${rem}s`
}

function toIso(unixSeconds: number | null | undefined): string {
  const n = Number(unixSeconds)
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString()
  return new Date().toISOString()
}

export async function POST(req: NextRequest) {
  let payload: AircallWebhookPayload | null = null
  try {
    payload = (await req.json()) as AircallWebhookPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (!verifyToken(req, payload ?? {})) {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
  }

  const event = payload?.event ?? ''

  // On ne traite que la fin d'appel (données complètes : durée, statut, enreg.).
  // Les autres events (ringing, answered, created…) sont acquittés sans rien faire.
  if (event !== 'call.ended') {
    return NextResponse.json({ ok: true, ignored: event || 'unknown' })
  }

  const call = payload?.data
  if (!call || !call.id) {
    return NextResponse.json({ ok: true, ignored: 'no call data' })
  }

  const db = createServiceClient()

  // 1. Retrouver le contact CRM via le numéro du correspondant externe (lead).
  //    `raw_digits` = numéro de l'autre partie, quel que soit le sens d'appel.
  const variants = aircallPhoneVariants(call.raw_digits)
  let contactId: string | null = null
  if (variants.length > 0) {
    const { data: matches } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id')
      .in('phone', variants)
      .limit(1)
    contactId = matches?.[0]?.hubspot_contact_id ?? null
  }

  if (!contactId) {
    // Pas de contact connu pour ce numéro : rien à logger côté fiche.
    return NextResponse.json({
      ok: true,
      matched: false,
      raw_digits: call.raw_digits ?? null,
    })
  }

  // 2. Mapper l'agent Aircall (email) → owner CRM (rdv_users) si possible.
  let ownerId: string | null = null
  const agentEmail = call.user?.email?.trim().toLowerCase()
  if (agentEmail) {
    const { data: u } = await db
      .from('rdv_users')
      .select('id, hubspot_owner_id')
      .ilike('email', agentEmail)
      .maybeSingle()
    ownerId = u?.hubspot_owner_id ?? u?.id ?? null
  }

  // 3. Calculer direction / statut / sujet pour la timeline.
  const isInbound = String(call.direction) === 'inbound'
  const direction = isInbound ? 'INCOMING' : 'OUTGOING'
  const answered = Boolean(call.answered_at) && Number(call.duration) > 0

  let status: string
  if (call.voicemail) status = 'LEFT_VOICEMAIL'
  else if (answered) status = 'COMPLETED'
  else status = 'NO_ANSWER'

  const sens = isInbound ? 'entrant' : 'sortant'
  let subject: string
  if (status === 'COMPLETED') {
    subject = `Appel ${sens} — ${fmtDuration(call.duration)}`
  } else if (status === 'LEFT_VOICEMAIL') {
    subject = `Appel ${sens} — messagerie vocale`
  } else {
    subject = `Appel ${sens} manqué`
  }

  const bodyLines: string[] = []
  if (call.user?.name) bodyLines.push(`Agent : ${call.user.name}`)
  if (call.number?.name) bodyLines.push(`Ligne : ${call.number.name}`)
  if (call.raw_digits) bodyLines.push(`Numéro : ${call.raw_digits}`)
  if (call.missed_call_reason) bodyLines.push(`Raison : ${call.missed_call_reason}`)
  if (call.recording) bodyLines.push(`Enregistrement : ${call.recording}`)
  const body = bodyLines.length > 0 ? bodyLines.join('\n') : null

  const row = {
    hubspot_engagement_id: `aircall_${call.id}`,
    activity_type: 'call',
    hubspot_contact_id: contactId,
    owner_id: ownerId,
    subject,
    body,
    direction,
    status,
    occurred_at: toIso(call.started_at ?? call.ended_at),
    metadata: {
      source: 'aircall',
      aircall_call_id: call.id,
      duration: call.duration ?? null,
      recording: call.recording ?? null,
      voicemail: call.voicemail ?? null,
      missed_call_reason: call.missed_call_reason ?? null,
      agent_email: call.user?.email ?? null,
      agent_name: call.user?.name ?? null,
      line: call.number?.name ?? null,
    },
  }

  const { error } = await db
    .from('crm_activities')
    .upsert(row, { onConflict: 'hubspot_engagement_id' })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    matched: true,
    contact_id: contactId,
    status,
    direction,
  })
}

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'aircall-webhook',
    usage:
      'Configure cette URL dans Aircall (Integrations → Webhooks) sur l\'event call.ended. ' +
      'Ajoute ?token=<AIRCALL_WEBHOOK_TOKEN> ou le header x-aircall-token pour sécuriser.',
  })
}
