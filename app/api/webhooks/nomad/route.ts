/**
 * Webhook Nomad Education → CRM Diploma Santé
 *
 * Endpoint public utilisé par Nomad Education pour pousser leurs leads en
 * temps réel dans notre CRM (remplace l'ancien scénario Make → HubSpot).
 *
 * URL : https://hub.diploma-sante.fr/api/webhooks/nomad?key=<NOMAD_IMPORT_KEY>
 * Auth : query param "key", ou header "X-Nomad-Key", ou "Authorization: Bearer"
 *
 * Body (JSON ou form-urlencoded, 1 lead par requête — un tableau est accepté) :
 *   {
 *     // Clés = noms internes des propriétés CRM (cf. sheet de mapping Nomad)
 *     "createdate":                   "15/05/2021",
 *     "recent_conversion_event_name": "Demande d'information, Brochure",
 *     "civilite":                     "Madame",            // → Mme / Mr
 *     "firstname":                    "Carole",
 *     "lastname":                     "Didier",
 *     "email":                        "carole.didier@nomadeducation.fr",
 *     "phone":                        "+33666666666",
 *     "departement":                  "75 - Paris",        // → 75
 *     "zip":                          "75013",
 *     "country":                      "France",
 *     "dernier_diplome_obtenu___niveau_d_etude": "Bac général et technologique",
 *     "classe_actuelle":              "Terminale",
 *     "specialites_terminale":        "Mathématiques, Physique",
 *     // Sans équivalent CRM → stockés tels quels sur la fiche
 *     "nomad_filiere":                "Bac Général",
 *     "nomad_domaine":                "Santé",
 *     "nomad_option":                 "Mathématiques complémentaires",
 *     "nomad_langues":                "Anglais, Espagnol"
 *
 *   Les anciens noms (date, prenom, nom, telephone, codePostal…) restent acceptés.
 *   }
 *
 * Réponse :
 *   200 { ok: true, contact_id, action: "created" | "updated" }
 *   401 { error: "Invalid NOMAD key" }
 *   400 { error: "Email or phone required" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import { logger } from '@/lib/logger'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import {
  computeZoneFromDepartement,
  normalizeDepartement,
} from '@/app/api/crm/contacts/nomad-import/route'

export const dynamic = 'force-dynamic'

const ORIGINE_NOMAD = 'Nomad Education (Partenaire)'

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyKey(req: NextRequest): boolean {
  const expected = process.env.NOMAD_IMPORT_KEY || ''
  if (!expected) return false
  const provided =
    req.nextUrl.searchParams.get('key') ||
    req.headers.get('x-nomad-key') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return timingSafeEqual(provided || '', expected)
}

function normalizePayloadKey(key: string): string {
  return String(key || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = (Array.isArray(v) ? v.join(', ') : String(v)).trim()
  return s === '' ? null : s
}

function pick(fieldMap: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const v = cleanString(fieldMap[normalizePayloadKey(alias)])
    if (v) return v
  }
  return null
}

/** "15/05/2021" ou "15/05/2021 14:30" (format FR) ; sinon parsing ISO standard. */
function parseNomadDate(v: string | null): string | null {
  if (!v) return null
  const fr = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  const d = fr
    ? new Date(
        Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]),
        Number(fr[4] ?? 12), Number(fr[5] ?? 0), Number(fr[6] ?? 0),
      )
    : new Date(v)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get('content-type') || ''
  const raw = await req.text()
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) parsed = parsed[0]
  if (!parsed || typeof parsed !== 'object') return null
  const body = parsed as Record<string, unknown>
  for (const wrap of ['lead', 'contact', 'data']) {
    const inner = body[wrap]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return { ...body, ...(inner as Record<string, unknown>) }
    }
  }
  return body
}

export async function POST(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Invalid NOMAD key' }, { status: 401 })
  }

  const body = await readBody(req)
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const fieldMap: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    const nk = normalizePayloadKey(k)
    if (nk && !(nk in fieldMap)) fieldMap[nk] = v
  }

  const emailRaw = pick(fieldMap, ['email', 'mail'])
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.toLowerCase() : null
  const phoneRaw = pick(fieldMap, ['telephone', 'phone', 'tel', 'mobile'])
  const phone = phoneRaw ? phoneRaw.replace(/[\s.\-]/g, '') : null

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Email or phone required', received_keys: Object.keys(body).sort() },
      { status: 400 },
    )
  }

  const firstname = pick(fieldMap, ['prenom', 'firstname', 'first_name'])
  const lastname = pick(fieldMap, ['nom', 'lastname', 'last_name'])
  const civiliteRaw = pick(fieldMap, ['civilite', 'civility'])
  // Enum CRM `civilite` : Mr / Mme.
  const civilite = civiliteRaw
    ? (/^(mme|madame|mlle|mademoiselle)/i.test(civiliteRaw) ? 'Mme'
      : /^(m|mr|m\.|monsieur)$/i.test(civiliteRaw) ? 'Mr' : civiliteRaw)
    : null
  const souhait = pick(fieldMap, ['recent_conversion_event_name', 'souhait', 'engagements', 'engagement'])
  const codePostal = pick(fieldMap, ['zip', 'codePostal', 'code_postal', 'cp'])
  const pays = pick(fieldMap, ['country', 'pays'])
  const diplome = pick(fieldMap, ['dernier_diplome_obtenu___niveau_d_etude', 'diplome', 'diplomeencours'])
  const niveauRaw = pick(fieldMap, ['classe_actuelle', 'niveau', 'classe'])
  // ⚠️ `filiere` dans notre CRM = marque (Diploma Santé, Medibox…) : la filière
  // bac Nomad n'y est jamais écrite, seulement dans nomad_filiere.
  const filiere = pick(fieldMap, ['nomad_filiere', 'filiere'])
  const domaine = pick(fieldMap, ['nomad_domaine', 'domaine', 'domaines', 'domainesdetudesouhaites'])
  const specialite = pick(fieldMap, ['specialites_terminale', 'specialite', 'specialites'])
  const option = pick(fieldMap, ['nomad_option', 'option', 'options'])
  const langues = pick(fieldMap, ['nomad_langues', 'langues', 'langue'])

  // "75 - Paris" → "75" ; à défaut, déduit du code postal.
  const departement =
    normalizeDepartement(pick(fieldMap, ['departement', 'dept']) || '') ||
    normalizeDepartement(codePostal || '') ||
    null
  const zoneLocalite = departement ? computeZoneFromDepartement(departement) : null
  const classeActuelle = niveauRaw ? (normalizeClasseActuelle(niveauRaw) ?? niveauRaw) : null

  const nowIso = new Date().toISOString()
  const conversionDate = parseNomadDate(pick(fieldMap, ['createdate', 'date', 'createdat'])) ?? nowIso
  const eventName = souhait ? `Nomad Education - ${souhait}` : 'Nomad Education'

  const db = createServiceClient()
  const existingSelect =
    'hubspot_contact_id, hubspot_raw, contact_createdate, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name'
  let existing: {
    hubspot_contact_id: string
    hubspot_raw: Record<string, unknown> | null
    contact_createdate: string | null
    first_conversion_date: string | null
    first_conversion_event_name: string | null
    recent_conversion_date: string | null
    recent_conversion_event: string | null
    recent_conversion_event_name: string | null
  } | null = null
  if (email) {
    const { data } = await db.from('crm_contacts').select(existingSelect).eq('email', email).maybeSingle()
    existing = data
  }
  if (!existing && phone) {
    const { data } = await db.from('crm_contacts').select(existingSelect).eq('phone', phone).maybeSingle()
    existing = data
  }

  const conversionMeta = buildConversionFieldsForSubmission(conversionDate, eventName, existing)

  // hubspot_raw = source de vérité : le trigger DB recalcule les colonnes
  // natives à partir de ses clés top-level (cf. webhook Thotis).
  const currentRaw = (existing?.hubspot_raw as Record<string, unknown> | null) ?? {}
  const createdate =
    typeof currentRaw.createdate === 'string' && currentRaw.createdate.trim()
      ? currentRaw.createdate
      : (existing?.contact_createdate || conversionDate)
  const updatedRaw: Record<string, unknown> = {
    ...currentRaw,
    ...(email ? { email } : {}),
    ...(firstname ? { firstname } : {}),
    ...(lastname ? { lastname } : {}),
    ...(phone ? { phone } : {}),
    ...(classeActuelle ? { classe_actuelle: classeActuelle } : {}),
    ...(departement ? { departement } : {}),
    ...(zoneLocalite ? { zone_localite: zoneLocalite } : {}),
    ...(civilite ? { civilite } : {}),
    ...(codePostal ? { zip: codePostal } : {}),
    ...(pays ? { country: pays } : {}),
    ...(diplome ? { dernier_diplome_obtenu___niveau_d_etude: diplome } : {}),
    ...(specialite ? { specialites_terminale: specialite } : {}),
    ...(existing ? {} : { hs_lead_status: 'Nouveau' }),
    origine: ORIGINE_NOMAD,
    source: 'Nomad Education',
    createdate,
    ...conversionMeta,
    nomad_received_at: nowIso,
    nomad_souhait: souhait,
    nomad_civilite: civilite,
    nomad_code_postal: codePostal,
    nomad_pays: pays,
    nomad_diplome: diplome,
    nomad_niveau: niveauRaw,
    nomad_filiere: filiere,
    nomad_domaine: domaine,
    nomad_specialite: specialite,
    nomad_option: option,
    nomad_langues: langues,
    nomad_payload: body,
  }

  const contactData: Record<string, unknown> = {
    synced_at: nowIso,
    ...conversionMeta,
    origine: ORIGINE_NOMAD,
    source: 'Nomad Education',
    hubspot_raw: updatedRaw,
  }
  if (firstname) contactData.firstname = firstname
  if (lastname) contactData.lastname = lastname
  if (email) contactData.email = email
  if (phone) contactData.phone = phone
  if (classeActuelle) contactData.classe_actuelle = classeActuelle
  if (departement) contactData.departement = departement
  if (zoneLocalite) contactData.zone_localite = zoneLocalite

  let contactId: string
  let action: 'created' | 'updated'

  if (existing) {
    const { error } = await db
      .from('crm_contacts')
      .update(contactData)
      .eq('hubspot_contact_id', existing.hubspot_contact_id)
    if (error) {
      logger.error('nomad-webhook-update', error, { email, phone })
      return NextResponse.json({ error: 'Failed to update contact', details: error.message }, { status: 500 })
    }
    contactId = existing.hubspot_contact_id
    action = 'updated'
  } else {
    const nativeId = 'NOMAD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const { data: created, error } = await db
      .from('crm_contacts')
      .insert({
        ...contactData,
        hubspot_contact_id: nativeId,
        contact_createdate: conversionDate,
        hs_lead_status: 'Nouveau',
      })
      .select('hubspot_contact_id')
      .single()
    if (error || !created) {
      logger.error('nomad-webhook-insert', error, { email, phone })
      return NextResponse.json({ error: 'Failed to create contact', details: error?.message }, { status: 500 })
    }
    contactId = created.hubspot_contact_id
    action = 'created'
  }

  await db.from('crm_activities').insert({
    activity_type: 'note',
    hubspot_contact_id: contactId,
    subject: `Lead reçu de Nomad Education (${action})`,
    body: [
      `Souhait : ${souhait ?? 'n/a'}`,
      `Niveau : ${niveauRaw ?? 'n/a'}${filiere ? ` (${filiere})` : ''}`,
      `Domaine : ${domaine ?? 'n/a'}`,
      `Spécialités : ${specialite ?? 'n/a'}`,
      `Département : ${departement ?? 'n/a'}${codePostal ? ` — CP ${codePostal}` : ''}`,
      `Pays : ${pays ?? 'n/a'}`,
    ].join('\n'),
    metadata: { source: 'nomad_webhook', payload: body },
    occurred_at: nowIso,
  })

  return NextResponse.json({ ok: true, contact_id: contactId, action })
}
