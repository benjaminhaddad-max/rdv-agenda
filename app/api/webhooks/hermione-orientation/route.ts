/**
 * Webhook Hermione orientation → CRM
 *
 * Appelé par orientation.hermione.co après validation du classement.
 * URL prod : https://hub.diploma-sante.fr/api/webhooks/hermione-orientation
 *
 * Auth : Authorization: Bearer <HERMIONE_WEBHOOK_TOKEN>
 *        (fallback : HERMIONE_LINK_SECRET si token dédié absent)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import { logger } from '@/lib/logger'
import {
  HERMIONE_ORIENTATION_FORM_EVENT,
  HERMIONE_ORIENTATION_FORM_ID,
  formatHermioneClassement,
  type HermioneOrientationPayload,
} from '@/lib/hermione-orientation'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hermione-Token',
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

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyToken(req: NextRequest): boolean {
  const expected =
    process.env.HERMIONE_WEBHOOK_TOKEN ||
    process.env.HERMIONE_LINK_SECRET ||
    ''
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : null
  const headerToken = req.headers.get('x-hermione-token') || ''
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
      endpoint: 'hermione-orientation-webhook',
      form_event: HERMIONE_ORIENTATION_FORM_EVENT,
      usage: 'POST avec Authorization: Bearer <HERMIONE_WEBHOOK_TOKEN>',
    },
    { headers: CORS_HEADERS },
  )
}

export async function POST(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401, headers: CORS_HEADERS },
    )
  }

  let body: HermioneOrientationPayload
  try {
    body = await req.json() as HermioneOrientationPayload
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const email = cleanEmail(body.email)
  const phone = cleanPhone(body.telephone)
  const firstname = cleanString(body.prenom)
  const lastname = cleanString(body.nom)
  const hubspotIdHint = cleanString(body.hubspot_contact_id)

  if (!email && !phone && !hubspotIdHint) {
    return NextResponse.json(
      { error: 'Email, phone or hubspot_contact_id required' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const classeRaw = cleanString(body.classe_actuelle)
  const classeMapped = classeRaw
    ? (normalizeClasseActuelle(classeRaw) ?? classeRaw)
    : null
  const departement = cleanString(body.departement)
  const classement = Array.isArray(body.classement) ? body.classement : []
  const submittedAtRaw = cleanString(body.submitted_at)
  const submittedIso = submittedAtRaw && Number.isFinite(Date.parse(submittedAtRaw))
    ? new Date(submittedAtRaw).toISOString()
    : new Date().toISOString()

  const db = createServiceClient()

  type ExistingRow = {
    hubspot_contact_id: string
    hubspot_raw: Record<string, unknown> | null
    first_conversion_date: string | null
    first_conversion_event_name: string | null
    recent_conversion_date: string | null
    recent_conversion_event: string | null
    recent_conversion_event_name: string | null
  }

  let existing: ExistingRow | null = null

  if (hubspotIdHint) {
    const { data } = await db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name',
      )
      .eq('hubspot_contact_id', hubspotIdHint)
      .maybeSingle()
    existing = data as ExistingRow | null
  }
  if (!existing && email) {
    const { data } = await db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name',
      )
      .eq('email', email)
      .maybeSingle()
    existing = data as ExistingRow | null
  }
  if (!existing && phone) {
    const { data } = await db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, hubspot_raw, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name',
      )
      .eq('phone', phone)
      .maybeSingle()
    existing = data as ExistingRow | null
  }

  const currentRaw = (existing?.hubspot_raw as Record<string, unknown> | null) ?? {}
  const updatedRaw: Record<string, unknown> = {
    ...currentRaw,
    hermione_orientation_submitted_at: submittedIso,
    hermione_classement: classement,
    hermione_utm_source: cleanString(body.utm_source),
    hermione_utm_medium: cleanString(body.utm_medium),
    hermione_utm_campaign: cleanString(body.utm_campaign),
  }

  if (firstname) updatedRaw.firstname = firstname
  if (lastname) updatedRaw.lastname = lastname
  if (email) updatedRaw.email = email
  if (phone) updatedRaw.phone = phone
  if (classeMapped) updatedRaw.classe_actuelle = classeMapped
  if (departement) updatedRaw.departement = departement

  const conversionMeta = buildConversionFieldsForSubmission(
    submittedIso,
    HERMIONE_ORIENTATION_FORM_EVENT,
    existing,
  )

  const contactData: Record<string, unknown> = {
    synced_at: submittedIso,
    ...conversionMeta,
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
      logger.error('hermione-orientation-webhook-update', error, { email, phone })
      return NextResponse.json(
        { error: 'Failed to update contact', details: error.message },
        { status: 500, headers: CORS_HEADERS },
      )
    }
    contactId = existing.hubspot_contact_id
    action = 'updated'
  } else {
    const nativeId =
      'HERMIONE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const { data: created, error } = await db
      .from('crm_contacts')
      .insert({
        ...contactData,
        hubspot_contact_id: nativeId,
        contact_createdate: submittedIso,
        hs_lead_status: 'Nouveau',
        origine: 'Hermione (Partenaire)',
        source: 'Hermione',
      })
      .select('hubspot_contact_id')
      .single()
    if (error || !created) {
      logger.error('hermione-orientation-webhook-insert', error, { email, phone })
      return NextResponse.json(
        { error: 'Failed to create contact', details: error?.message },
        { status: 500, headers: CORS_HEADERS },
      )
    }
    contactId = created.hubspot_contact_id
    action = 'created'
  }

  const classementText = formatHermioneClassement(classement)

  try {
    await db.from('crm_form_submissions').upsert(
      {
        hubspot_contact_id: contactId,
        form_id: HERMIONE_ORIENTATION_FORM_ID,
        form_title: HERMIONE_ORIENTATION_FORM_EVENT,
        form_type: 'hermione_orientation',
        page_url: 'https://orientation.hermione.co/',
        page_title: 'Hermione · Quel parcours en santé t\'intéresse ?',
        values: body as Record<string, unknown>,
        submitted_at: submittedIso,
      },
      { onConflict: 'hubspot_contact_id,form_id,submitted_at', ignoreDuplicates: true },
    )
  } catch (e) {
    logger.error('hermione-orientation-webhook-form-submission', e, { contact_id: contactId })
  }

  try {
    await db.from('crm_activities').insert({
      activity_type: 'note',
      hubspot_contact_id: contactId,
      subject: 'Hermione — classement orientation reçu',
      body: [
        `Classement :`,
        classementText,
        classeMapped ? `Classe : ${classeMapped}` : null,
        departement ? `Département : ${departement}` : null,
      ].filter(Boolean).join('\n'),
      metadata: {
        source: 'hermione_orientation_webhook',
        classement,
        utm_source: cleanString(body.utm_source),
        utm_medium: cleanString(body.utm_medium),
        utm_campaign: cleanString(body.utm_campaign),
      },
      occurred_at: submittedIso,
    })
  } catch (e) {
    logger.error('hermione-orientation-webhook-activity', e, { contact_id: contactId })
  }

  return NextResponse.json(
    { ok: true, contact_id: contactId, action, form_event: HERMIONE_ORIENTATION_FORM_EVENT },
    { headers: CORS_HEADERS },
  )
}
