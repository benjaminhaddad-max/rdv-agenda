import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  identityFieldKeysFromForm,
  valuesFromTokenPayload,
  verifyFormContactToken,
} from '@/lib/form-contact-link'

const ALLOWED_ORIGINS = new Set([
  'https://www.afem-edu.fr',
  'https://afem-edu.fr',
  'https://prepamedecine.fr',
  'https://www.prepamedecine.fr',
  'https://hermione.co',
  'https://www.hermione.co',
  'https://orientation.hermione.co',
  'https://www.numerusclub.fr',
  'https://numerusclub.fr',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

/**
 * GET /api/forms/prefill?t=TOKEN&slug=optional
 * Valide le token contact et retourne les valeurs pré-remplies + champs à masquer.
 * Consommé par les pages /form des sites marques (afem-edu.fr, etc.).
 */
export async function GET(req: Request) {
  const headers = corsHeaders(req)
  const url = new URL(req.url)
  const token = url.searchParams.get('t')?.trim() || ''
  const slugHint = url.searchParams.get('slug')?.trim().toLowerCase() || ''

  const payload = verifyFormContactToken(token)
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'Lien invalide ou expiré' },
      { status: 400, headers },
    )
  }

  if (payload.slug && slugHint && payload.slug !== slugHint) {
    return NextResponse.json(
      { ok: false, error: 'Ce lien ne correspond pas à ce formulaire' },
      { status: 400, headers },
    )
  }

  const db = createServiceClient()
  const { data: contact } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle')
    .eq('hubspot_contact_id', payload.cid)
    .maybeSingle()

  const values: Record<string, string> = {
    ...valuesFromTokenPayload(payload),
  }

  if (contact) {
    if (contact.firstname) values.firstname = String(contact.firstname)
    if (contact.lastname) values.lastname = String(contact.lastname)
    if (contact.email) values.email = String(contact.email)
    if (contact.phone) values.phone = String(contact.phone)
    if (contact.departement) values.departement = String(contact.departement)
    if (contact.classe_actuelle) values.classe_actuelle = String(contact.classe_actuelle)
  }

  let hidden_field_keys: string[] = Object.keys(valuesFromTokenPayload(payload))
  if (slugHint || payload.slug) {
    const formSlug = slugHint || payload.slug || ''
    const { data: form } = await db
      .from('forms')
      .select('id')
      .eq('slug', formSlug)
      .eq('status', 'published')
      .maybeSingle()

    if (form?.id) {
      const { data: fields } = await db
        .from('form_fields')
        .select('field_key, crm_field, field_type')
        .eq('form_id', form.id)
        .order('order_index', { ascending: true })

      hidden_field_keys = identityFieldKeysFromForm(fields || [])
      for (const f of fields || []) {
        const key = String(f.field_key || '')
        if (!key) continue
        const crm = String(f.crm_field || '').toLowerCase()
        if (crm === 'firstname' && values.firstname) values[key] = values.firstname
        if (crm === 'lastname' && values.lastname) values[key] = values.lastname
        if (crm === 'email' && values.email) values[key] = values.email
        if ((crm === 'phone' || crm === 'mobilephone') && values.phone) values[key] = values.phone
        if (crm === 'departement' && values.departement) values[key] = values.departement
        if (crm === 'classe_actuelle' && values.classe_actuelle) values[key] = values.classe_actuelle
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      hubspot_contact_id: payload.cid,
      brand_slug: payload.slug || null,
      values,
      hidden_field_keys,
      greeting: values.firstname || contact?.firstname || '',
    },
    { headers: { ...headers, 'Cache-Control': 'no-store' } },
  )
}
