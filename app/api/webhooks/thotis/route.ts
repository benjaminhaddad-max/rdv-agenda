/**
 * Webhook Thotis → CRM Diploma Santé
 *
 * Endpoint public utilisé par Thotis (https://thotismedia.com) pour pousser
 * leurs leads dans notre CRM.
 *
 * URL : https://crm.diplomasante.com/api/webhooks/thotis
 * Auth : Header "Authorization: Bearer <THOTIS_WEBHOOK_TOKEN>"
 *        (ou "X-Thotis-Token: <THOTIS_WEBHOOK_TOKEN>")
 *
 * Le token est défini dans les env vars Vercel sous `THOTIS_WEBHOOK_TOKEN`.
 *
 * Body JSON attendu (1 lead par requête) :
 *   {
 *     // Identité (obligatoire)
 *     "lastname":   "Dupont",
 *     "firstname":  "Jean",
 *     "email":      "jean.dupont@gmail.com",
 *     "phone":      "0612345678",
 *
 *     // Niveau d'études — valeurs Hubspot Thotis (Seconde, Première, Terminale,
 *     // Bac + 1 ... Bac + 5, Parent Seconde, Parent Première, etc.).
 *     // On normalise vers nos classes (Seconde, Première, Terminale, Etudes Sup., …)
 *     // et on flag automatiquement parent__tudiant = "Parent" si le libellé
 *     // commence par "Parent".
 *     "niveau_d_etudes": "Terminale",
 *
 *     // Date + dernière action d'orientation
 *     "date_derniere_action_d_orientation": "2026-05-26T10:00:00Z",
 *     "guide_post_bac___typeform":           "Guide PASS-LAS",
 *
 *     // Localisation
 *     "departements":   "75 (Paris)",
 *     "pays_typeform":  "France",
 *
 *     // Type de lead Thotis (Prospect / Suspect)
 *     // → mappe vers `origine`
 *     "type_de_lead":  "Prospect : intérêt pour PRÉPA SANTÉ DIPLOMA",
 *
 *     // Optionnel : meta libre stockée dans hubspot_raw.thotis_meta
 *     "meta": { ... }
 *   }
 *
 * Réponse :
 *   200 { ok: true, contact_id, action: "created" | "updated" }
 *   401 { error: "Invalid token" }
 *   400 { error: "Email or phone required" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import { logger } from '@/lib/logger'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'

export const dynamic = 'force-dynamic'

// ─── Mappings Thotis → CRM Diploma Santé ──────────────────────────────────

const NIVEAU_TO_CLASSE: Record<string, string> = {
  'Seconde':         'Seconde',
  'Première':        'Première',
  'Premiere':        'Première',
  'Terminale':       'Terminale',
  'Bac + 1':         'Etudes Sup.',
  'Bac + 2':         'Etudes Sup.',
  'Bac + 3':         'Etudes Sup.',
  'Bac + 4':         'Etudes Sup.',
  'Bac + 5':         'Etudes Sup.',
  'Parent Seconde':  'Seconde',
  'Parent Première': 'Première',
  'Parent Premiere': 'Première',
  'Parent Terminale':'Terminale',
  'Parent Bac+1':    'Etudes Sup.',
}

function isParentNiveau(v: string | null | undefined): boolean {
  return /^\s*parent\b/i.test(String(v ?? ''))
}

/**
 * Convertit "75 (Paris)" → "75". Garde "Candidats français de l'étranger" tel quel.
 */
function normalizeDepartement(v: string | null | undefined): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^([0-9]{2,3}|2A|2B)\s*[\(\-]/i)
  return m ? m[1].toUpperCase() : s
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

/**
 * Vérifie le token (header Authorization: Bearer ... ou X-Thotis-Token).
 * Comparaison timing-safe pour éviter les attaques par chronométrage.
 */
function verifyToken(req: NextRequest): boolean {
  const expected = process.env.THOTIS_WEBHOOK_TOKEN
  if (!expected) return false

  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : null
  const headerToken = req.headers.get('x-thotis-token') || ''
  const provided = bearer || headerToken

  if (!provided || provided.length !== expected.length) return false

  // Timing-safe compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThotisPayload = Record<string, any>

export async function POST(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let body: ThotisPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email     = cleanEmail(body.email)
  const phone     = cleanPhone(body.phone)
  const firstname = cleanString(body.firstname)
  const lastname  = cleanString(body.lastname)

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Email or phone required' },
      { status: 400 }
    )
  }

  // ── Mapping niveau d'études → classe_actuelle ───────────────────────────
  const niveauRaw = cleanString(body.niveau_d_etudes)
  const niveauMapped = niveauRaw
    ? (NIVEAU_TO_CLASSE[niveauRaw] ?? normalizeClasseActuelle(niveauRaw) ?? 'Autres')
    : null
  const isParent = isParentNiveau(niveauRaw)

  // ── Date / event de conversion ─────────────────────────────────────────
  const conversionDateRaw = cleanString(body.date_derniere_action_d_orientation)
  const conversionDate = conversionDateRaw && !isNaN(new Date(conversionDateRaw).getTime())
    ? new Date(conversionDateRaw).toISOString()
    : new Date().toISOString()
  const conversionEvent = cleanString(body.guide_post_bac___typeform)

  // ── Département + pays ─────────────────────────────────────────────────
  const departement = normalizeDepartement(cleanString(body.departements))
  const pays        = cleanString(body.pays_typeform)

  // ── Type de lead → origine ─────────────────────────────────────────────
  const typeLead = cleanString(body.type_de_lead) ?? ''
  let origine = 'Thotis'
  if (/prospect/i.test(typeLead))      origine = 'Thotis Prospect'
  else if (/suspect/i.test(typeLead))  origine = 'Thotis Suspect'

  const db = createServiceClient()
  const nowIso = new Date().toISOString()

  // ── Cherche un contact existant par email puis téléphone ───────────────
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
      .select('hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name')
      .eq('email', email)
      .maybeSingle()
    existing = data
  }
  if (!existing && phone) {
    const { data } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name')
      .eq('phone', phone)
      .maybeSingle()
    existing = data
  }

  // ── Construit le hubspot_raw enrichi avec le payload Thotis brut ───────
  const currentRaw = (existing?.hubspot_raw as Record<string, unknown> | null) ?? {}
  const updatedRaw = {
    ...currentRaw,
    thotis_received_at:    nowIso,
    thotis_type_de_lead:   typeLead || null,
    thotis_pays:           pays,
    thotis_niveau:         niveauRaw,
    thotis_payload:        body,
  }

  const eventName = conversionEvent ?? typeLead ?? 'Thotis'
  const conversionMeta = buildConversionFieldsForSubmission(
    conversionDate,
    eventName,
    existing,
  )

  // ── Construction du payload contact (champs natifs CRM) ────────────────
  const contactData: Record<string, unknown> = {
    synced_at: nowIso,
    ...conversionMeta,
    origine,
    source:                  'Thotis',
    hubspot_raw:             updatedRaw,
  }
  if (firstname)     contactData.firstname        = firstname
  if (lastname)      contactData.lastname         = lastname
  if (email)         contactData.email            = email
  if (phone)         contactData.phone            = phone
  if (niveauMapped)  contactData.classe_actuelle  = niveauMapped
  if (departement)   contactData.departement      = departement
  if (isParent)      contactData.parent__tudiant  = 'Parent'

  let contactId: string
  let action: 'created' | 'updated'

  if (existing) {
    await db
      .from('crm_contacts')
      .update(contactData)
      .eq('hubspot_contact_id', existing.hubspot_contact_id)
    contactId = existing.hubspot_contact_id
    action = 'updated'
  } else {
    const nativeId = 'THOTIS_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const insertData = {
      ...contactData,
      hubspot_contact_id: nativeId,
      contact_createdate: nowIso,
      hs_lead_status:     'Nouveau',
    }
    const { data: created, error } = await db
      .from('crm_contacts')
      .insert(insertData)
      .select('hubspot_contact_id')
      .single()
    if (error || !created) {
      logger.error('thotis-webhook-insert', error, { email, phone })
      return NextResponse.json(
        { error: 'Failed to create contact', details: error?.message },
        { status: 500 }
      )
    }
    contactId = created.hubspot_contact_id
    action = 'created'
  }

  // ── Activité CRM (trace l'arrivée du lead Thotis) ──────────────────────
  await db.from('crm_activities').insert({
    activity_type:      'note',
    hubspot_contact_id: contactId,
    subject:            `Lead reçu de Thotis (${action})`,
    body:               `Type : ${typeLead || 'n/a'}\nNiveau : ${niveauRaw ?? 'n/a'}\nGuide : ${conversionEvent ?? 'n/a'}\nDépartement : ${departement ?? 'n/a'}\nPays : ${pays ?? 'n/a'}`,
    metadata:           { source: 'thotis_webhook', payload: body },
    occurred_at:        nowIso,
  })

  return NextResponse.json({
    ok: true,
    contact_id: contactId,
    action,
  })
}
