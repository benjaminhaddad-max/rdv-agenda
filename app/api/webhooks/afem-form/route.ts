/**
 * Webhook AFEM form → CRM Diploma Santé
 *
 * Endpoint PUBLIC utilisé par les formulaires AFEM externes
 * (hébergés sur afem-edu.fr, fonction serverless Vercel côté AFEM).
 *
 * URL prod : https://hub.diploma-sante.fr/api/webhooks/afem-form
 *
 * Auth : Header "Authorization: Bearer <AFEM_WEBHOOK_TOKEN>"
 *        (alternative équivalente : "X-AFEM-Token: <AFEM_WEBHOOK_TOKEN>")
 *
 * Le token est défini dans les env vars Vercel sous `AFEM_WEBHOOK_TOKEN`.
 *
 * CORS : autorise toutes origines (utile en cas d'appel direct navigateur,
 * non bloquant pour un relai serverless côté AFEM).
 *
 * Body JSON attendu (1 lead par requête) :
 *   {
 *     // ── Champs natifs (mappés sur les colonnes crm_contacts) ───────────
 *     "firstname":       "Jean",
 *     "lastname":        "Dupont",
 *     "email":           "jean.dupont@gmail.com",
 *     "phone":           "+33612345678",
 *     "classe_actuelle": "Terminale",   // normalisé via lib/classe-actuelle
 *     "departement":     "75 (Paris)",  // accepte "75" ou "75 (Paris)"
 *
 *     // ── Données structurées (stockées dans hubspot_raw.afem_*) ────────
 *     "parcoursup_voeux": [
 *       { "rang": 1, "etablissement": "Sorbonne", "formation": "PASS",
 *         "ville": "Paris", "statut": "confirme" },
 *       { "rang": 2, "etablissement": "Saclay",   "formation": "LAS",
 *         "ville": "Orsay", "statut": "en_attente" }
 *     ],
 *     "pronostic": {                    // ou simple string : "Excellent"
 *       "score": 87,
 *       "label": "Excellent",
 *       "details": "Profil compatible PASS dans 4 vœux sur 6"
 *     },
 *
 *     // ── Re-qualification Last Chance (page /form) ─────────────────────
 *     "commence_pass_las":   "oui" | "non",
 *     "prepa_prevue":        "oui" | "non" | null,
 *     "prepa_choix":         "medisup" | "diploma" | "antemed" | "cpcm" | "autre" | null,
 *     "prepa_choix_libre":   null,
 *     "prepa_non_raison":    "financier" | "pas_le_temps" | "pas_utile" | "autre" | null,
 *     "prepa_non_raison_libre": null,
 *
 *     // ── Optionnel ─────────────────────────────────────────────────────
 *     "source_url": "https://www.afem-edu.fr/form",
 *     "meta": { "form_id": "requalification-prepa-idf", "hubspot_contact_id": "123456" }
 *   }
 *
 * Réponse :
 *   200 { ok: true, contact_id, action: "created" | "updated" }
 *   400 { error: "Email or phone required" }
 *   401 { error: "Invalid token" }
 *   500 { error: "Failed to create contact", details }
 *
 * Dédoublonnage : recherche par email d'abord, puis par téléphone. Si match
 * → update (les nouvelles valeurs non vides écrasent, la liste de vœux et le
 * pronostic sont remplacés par les plus récents). Sinon → création.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import { logger } from '@/lib/logger'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import {
  isRecalifRequalificationSubmission,
  RECALIF_2026_FORM_EVENT,
  recalifBrandActivitySource,
  recalifBrandLabel,
  recalifBrandOrigine,
  resolveRecalifBrandSlug,
} from '@/lib/recalif-2026'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AFEM-Token',
}

function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function cleanEmail(v: unknown): string | null {
  const s = cleanString(v)
  return s ? s.toLowerCase() : null
}

function cleanPhone(v: unknown): string | null {
  const s = cleanString(v)
  return s ? s.replace(/\s+/g, '') : null
}

/** Convertit "75 (Paris)" → "75". Garde le reste tel quel. */
function normalizeDepartement(v: string | null | undefined): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^([0-9]{2,3}|2A|2B)\s*[\(\-]/i)
  return m ? m[1].toUpperCase() : s
}

/** Comparaison timing-safe pour éviter les attaques par chronométrage. */
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyToken(req: NextRequest): boolean {
  const expected = process.env.AFEM_WEBHOOK_TOKEN
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : null
  const headerToken = req.headers.get('x-afem-token') || ''
  const provided = bearer || headerToken
  return timingSafeEqual(provided || '', expected)
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: 'afem-form-webhook',
      usage: 'POST avec Authorization: Bearer <AFEM_WEBHOOK_TOKEN>',
    },
    { headers: CORS_HEADERS },
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AfemPayload = Record<string, any>

export async function POST(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401, headers: CORS_HEADERS },
    )
  }

  let body: AfemPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const email = cleanEmail(body.email)
  const phone = cleanPhone(body.phone)
  const firstname = cleanString(body.firstname)
  const lastname = cleanString(body.lastname)

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Email or phone required' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const classeRaw = cleanString(body.classe_actuelle)
  const classeMapped = classeRaw
    ? (normalizeClasseActuelle(classeRaw) ?? 'Autres')
    : null
  const departement = normalizeDepartement(cleanString(body.departement))
  const sourceUrl = cleanString(body.source_url)

  const voeux = Array.isArray(body.parcoursup_voeux) ? body.parcoursup_voeux : null
  const pronostic = body.pronostic ?? null
  const commencePassLas = cleanString(body.commence_pass_las)
  const prepaPrevue = cleanString(body.prepa_prevue)
  const prepaChoix = cleanString(body.prepa_choix)
  const prepaChoixLibre = cleanString(body.prepa_choix_libre)
  const prepaNonRaison = cleanString(body.prepa_non_raison)
  const prepaNonRaisonLibre = cleanString(body.prepa_non_raison_libre)
  const extraMeta =
    body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : null

  const db = createServiceClient()
  const nowIso = new Date().toISOString()

  let existing: {
    hubspot_contact_id: string
    hubspot_raw: Record<string, unknown> | null
    first_conversion_date: string | null
    first_conversion_event_name: string | null
    recent_conversion_date: string | null
    recent_conversion_event: string | null
    recent_conversion_event_name: string | null
  } | null = null

  if (email) {
    const { data } = await db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name',
      )
      .eq('email', email)
      .maybeSingle()
    existing = data
  }
  if (!existing && phone) {
    const { data } = await db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name',
      )
      .eq('phone', phone)
      .maybeSingle()
    existing = data
  }

  const currentRaw =
    (existing?.hubspot_raw as Record<string, unknown> | null) ?? {}
  const updatedRaw: Record<string, unknown> = {
    ...currentRaw,
    afem_received_at: nowIso,
    afem_source_url: sourceUrl ?? currentRaw.afem_source_url ?? null,
    afem_payload: body,
  }
  if (voeux) updatedRaw.afem_parcoursup_voeux = voeux
  if (pronostic !== null && pronostic !== undefined) updatedRaw.afem_pronostic = pronostic
  if (extraMeta) updatedRaw.afem_meta = extraMeta

  if (commencePassLas) {
    updatedRaw.afem_requal_commence_pass_las = commencePassLas
    updatedRaw.commence_pass_las = commencePassLas
  }
  if (prepaPrevue) {
    updatedRaw.afem_requal_prepa_prevue = prepaPrevue
    updatedRaw.prepa_prevue = prepaPrevue
  }
  if (prepaChoix) {
    updatedRaw.afem_requal_prepa_choix = prepaChoix
    updatedRaw.prepa_choix = prepaChoix
  }
  if (prepaChoixLibre) updatedRaw.afem_requal_prepa_choix_libre = prepaChoixLibre
  if (prepaNonRaison) {
    updatedRaw.afem_requal_prepa_non_raison = prepaNonRaison
    updatedRaw.prepa_non_raison = prepaNonRaison
  }
  if (prepaNonRaisonLibre) updatedRaw.afem_requal_prepa_non_raison_libre = prepaNonRaisonLibre
  const isRecalif = isRecalifRequalificationSubmission({
    sourceUrl,
    commencePassLas,
    meta: extraMeta,
  })
  const brandSlug = isRecalif
    ? resolveRecalifBrandSlug({ sourceUrl, meta: extraMeta })
    : 'afem'
  const brandLabel = recalifBrandLabel(brandSlug)
  const brandOrigine = isRecalif ? recalifBrandOrigine(brandSlug) : 'Site AFEM'
  const brandSource = isRecalif ? brandLabel : 'AFEM'
  const activitySource = isRecalif
    ? recalifBrandActivitySource(brandSlug)
    : 'afem_webhook'

  if (isRecalif) {
    updatedRaw.recalif_2026_at = nowIso
    updatedRaw.recalif_2026_brand = brandSlug
  } else {
    updatedRaw.afem_requal_at = nowIso
  }

  // Un trigger Postgres synchronise les colonnes natives depuis hubspot_raw
  // (format plat : hubspot_raw.firstname, hubspot_raw.email, etc.). Si on
  // omet ces clés ici, le trigger nullify les colonnes correspondantes à
  // chaque insert/update qui touche hubspot_raw. On les duplique donc en
  // clé plate à la racine du JSON, en plus de les écrire dans contactData.
  if (firstname) updatedRaw.firstname = firstname
  if (lastname) updatedRaw.lastname = lastname
  if (email) updatedRaw.email = email
  if (phone) updatedRaw.phone = phone
  if (classeMapped) updatedRaw.classe_actuelle = classeMapped
  if (departement) updatedRaw.departement = departement
  updatedRaw.origine = brandOrigine
  updatedRaw.source = brandSource
  if (!existing) updatedRaw.hs_lead_status = 'Nouveau'

  const eventName = isRecalif ? RECALIF_2026_FORM_EVENT : 'Formulaire AFEM'
  const conversionMeta = buildConversionFieldsForSubmission(
    nowIso,
    eventName,
    existing,
  )

  const contactData: Record<string, unknown> = {
    synced_at: nowIso,
    ...conversionMeta,
    origine: brandOrigine,
    source: brandSource,
    hubspot_raw: updatedRaw,
  }
  if (firstname) contactData.firstname = firstname
  if (lastname) contactData.lastname = lastname
  if (email) contactData.email = email
  if (phone) contactData.phone = phone
  if (classeMapped) contactData.classe_actuelle = classeMapped
  if (departement) contactData.departement = departement

  let contactId: string
  let action: 'created' | 'updated'

  if (existing) {
    const { error } = await db
      .from('crm_contacts')
      .update(contactData)
      .eq('hubspot_contact_id', existing.hubspot_contact_id)
    if (error) {
      logger.error('afem-webhook-update', error, { email, phone })
      return NextResponse.json(
        { error: 'Failed to update contact', details: error.message },
        { status: 500, headers: CORS_HEADERS },
      )
    }
    contactId = existing.hubspot_contact_id
    action = 'updated'
  } else {
    const nativeId =
      'AFEM_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const insertData = {
      ...contactData,
      hubspot_contact_id: nativeId,
      contact_createdate: nowIso,
      hs_lead_status: 'Nouveau',
    }
    const { data: created, error } = await db
      .from('crm_contacts')
      .insert(insertData)
      .select('hubspot_contact_id')
      .single()
    if (error || !created) {
      logger.error('afem-webhook-insert', error, { email, phone })
      return NextResponse.json(
        { error: 'Failed to create contact', details: error?.message },
        { status: 500, headers: CORS_HEADERS },
      )
    }
    contactId = created.hubspot_contact_id
    action = 'created'
  }

  const activitySubject = isRecalif
    ? `Réponse Recalif 2026 — ${brandLabel} (${action})`
    : `Lead reçu de AFEM (${action})`

  // Trace la soumission formulaire en activité (best-effort, ne bloque pas la réponse)
  const voeuxSummary = voeux
    ? voeux
        .map((v: unknown) => {
          const item = v as { rang?: unknown; etablissement?: unknown; formation?: unknown }
          const rang = item?.rang ? `#${item.rang}` : '-'
          const etab = item?.etablissement || '?'
          const formation = item?.formation || ''
          return `${rang} ${etab}${formation ? ` (${formation})` : ''}`
        })
        .join('\n')
    : 'aucun'
  const pronosticLabel =
    pronostic && typeof pronostic === 'object'
      ? (pronostic as { label?: string; score?: number }).label ||
        String((pronostic as { score?: number }).score ?? '')
      : pronostic
        ? String(pronostic)
        : 'n/a'

  const requalSummary = commencePassLas
    ? [
        `Commence PASS/LAS : ${commencePassLas}`,
        prepaPrevue ? `Prépa prévue : ${prepaPrevue}` : null,
        prepaChoix ? `Prépa choix : ${prepaChoix}${prepaChoixLibre ? ` (${prepaChoixLibre})` : ''}` : null,
        prepaNonRaison
          ? `Sans prépa — raison : ${prepaNonRaison}${prepaNonRaisonLibre ? ` (${prepaNonRaisonLibre})` : ''}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    : null

  try {
    await db.from('crm_activities').insert({
      activity_type: 'note',
      hubspot_contact_id: contactId,
      subject: activitySubject,
      body: [
        isRecalif ? `Marque : ${brandLabel}` : null,
        `Classe : ${classeMapped ?? 'n/a'}`,
        `Département : ${departement ?? 'n/a'}`,
        requalSummary,
        `Pronostic : ${pronosticLabel}`,
        `Vœux Parcoursup :\n${voeuxSummary}`,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        source: activitySource,
        brand_slug: brandSlug,
        campaign: isRecalif ? RECALIF_2026_FORM_EVENT : null,
        payload: body,
      },
      occurred_at: nowIso,
    })
  } catch (e) {
    logger.error('afem-webhook-activity', e, { contact_id: contactId })
  }

  return NextResponse.json(
    { ok: true, contact_id: contactId, action },
    { headers: CORS_HEADERS },
  )
}
