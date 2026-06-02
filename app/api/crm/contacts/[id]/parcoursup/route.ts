import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const SAISON = '2026-2027'
const DIPLOMA_API_BASE = 'https://admission.diploma-sante.fr/api'
const MANUAL_VERDICTS = new Set(['ok_valide', 'ok_attente', 'good', 'attention', 'bascule'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function mergeParcoursup(base: unknown, patch: unknown): unknown {
  if (Array.isArray(patch)) return patch
  if (!isRecord(patch)) return patch
  const src = isRecord(base) ? base : {}
  const out: Record<string, unknown> = { ...src }
  for (const [k, v] of Object.entries(patch)) {
    if (isRecord(v)) out[k] = mergeParcoursup(src[k], v)
    else out[k] = v
  }
  return out
}

function computeVerdictOverride(data: Record<string, unknown>): string | undefined {
  const verdict = isRecord(data.verdict) ? data.verdict : null
  const manual = verdict?.manual === true
  const status = typeof verdict?.status === 'string' ? verdict.status.trim().toLowerCase() : ''
  if (!manual) return 'auto'
  if (MANUAL_VERDICTS.has(status)) return status
  return undefined
}

function withUpdatedAt(data: Record<string, unknown>, iso: string): Record<string, unknown> {
  if (typeof data.updated_at === 'string' && data.updated_at.trim()) return data
  return { ...data, updated_at: iso }
}

async function fetchRemoteParcoursupByEmail(email: string, apiKey: string): Promise<unknown | null> {
  const url = `${DIPLOMA_API_BASE}/list-inscriptions?email=${encodeURIComponent(email)}&include=parcoursup&limit=1`
  const r = await fetch(url, { headers: { 'x-api-key': apiKey } })
  if (!r.ok) return null
  const payload = await r.json() as { inscriptions?: Array<{ parcoursup?: unknown }> }
  return payload?.inscriptions?.[0]?.parcoursup ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = createServiceClient()
  const { id: contactId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload JSON invalide.' }, { status: 400 })
  }

  const preInscriptionId = Number((body as { preInscriptionId?: unknown })?.preInscriptionId)
  const parcoursup = (body as { parcoursup?: unknown })?.parcoursup

  if (!Number.isFinite(preInscriptionId) || preInscriptionId <= 0) {
    return NextResponse.json({ error: 'preInscriptionId requis.' }, { status: 400 })
  }
  if (!parcoursup || typeof parcoursup !== 'object' || Array.isArray(parcoursup)) {
    return NextResponse.json({ error: 'parcoursup (objet) requis.' }, { status: 400 })
  }

  const { data: existing, error: existingErr } = await db
    .from('crm_pre_inscriptions')
    .select('id, external_data, hubspot_contact_id')
    .eq('id', preInscriptionId)
    .eq('hubspot_contact_id', contactId)
    .eq('saison', SAISON)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Pré-inscription introuvable.' }, { status: 404 })
  }

  const previousExternal = (existing.external_data as Record<string, unknown>) || {}
  const inscriptionId = String(previousExternal.inscription_id || '').trim()
  if (!inscriptionId) {
    return NextResponse.json({ error: 'inscription_id manquant pour la sync Parcoursup.' }, { status: 400 })
  }

  const diplomaApiKey = process.env.DIPLOMA_API_KEY
  if (!diplomaApiKey) {
    return NextResponse.json({ error: 'DIPLOMA_API_KEY manquant côté serveur.' }, { status: 500 })
  }

  let remoteParcoursup: unknown = null
  const { data: contactRow } = await db
    .from('crm_contacts')
    .select('email')
    .eq('hubspot_contact_id', existing.hubspot_contact_id)
    .maybeSingle()
  const contactEmail = typeof contactRow?.email === 'string' ? contactRow.email : ''
  if (contactEmail) {
    remoteParcoursup = await fetchRemoteParcoursupByEmail(contactEmail, diplomaApiKey)
  }

  const mergedData = mergeParcoursup(remoteParcoursup, parcoursup)
  if (!isRecord(mergedData)) {
    return NextResponse.json({ error: 'Payload parcoursup invalide après merge.' }, { status: 400 })
  }
  const verdictOverride = computeVerdictOverride(mergedData)

  const externalBody: Record<string, unknown> = {
    inscription_id: inscriptionId,
    data: mergedData,
  }
  if (verdictOverride) externalBody.verdictOverride = verdictOverride

  const externalRes = await fetch(`${DIPLOMA_API_BASE}/update-parcoursup`, {
    method: 'POST',
    headers: {
      'x-api-key': diplomaApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(externalBody),
  })
  const externalText = await externalRes.text()
  let externalJson: Record<string, unknown> | null = null
  try {
    externalJson = externalText ? JSON.parse(externalText) as Record<string, unknown> : null
  } catch {
    externalJson = null
  }
  if (!externalRes.ok) {
    return NextResponse.json({
      error: 'Échec sync vers la plateforme préinscription.',
      upstream_status: externalRes.status,
      upstream_body: externalJson ?? externalText,
    }, { status: 502 })
  }

  const syncedParcoursup = (() => {
    if (!externalJson) return mergedData
    const verdict = externalJson.verdict
    if (!isRecord(verdict)) return mergedData
    return {
      ...mergedData,
      verdict,
    }
  })()
  const syncedAt = new Date().toISOString()
  const syncedParcoursupWithDate = withUpdatedAt(syncedParcoursup, syncedAt)
  const nextExternal: Record<string, unknown> = {
    ...previousExternal,
    // Bidirectionnel: on met a jour la copie brute ET l'override local avec
    // la meme payload pour rester coherent tout de suite dans le CRM.
    parcoursup: syncedParcoursupWithDate,
    parcoursup_crm_override: syncedParcoursupWithDate,
    parcoursup_crm_updated_at: syncedAt,
    parcoursup_last_remote_sync_at: syncedAt,
    parcoursup_last_remote_sync_status: 'ok',
    parcoursup_last_remote_sync_response: externalJson ?? { ok: true },
  }

  const { error: updateErr } = await db
    .from('crm_pre_inscriptions')
    .update({
      external_data: nextExternal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', preInscriptionId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    preInscriptionId,
    parcoursup: syncedParcoursupWithDate,
    remote: externalJson ?? { ok: true },
    updated_at: nextExternal.parcoursup_crm_updated_at,
  })
}
