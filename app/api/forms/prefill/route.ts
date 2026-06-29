import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  identityFieldKeysFromForm,
  valuesFromTokenPayload,
  verifyFormContactToken,
} from '@/lib/form-contact-link'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/forms/prefill?t=TOKEN&slug=optional
 * Valide le token contact et retourne les valeurs pré-remplies + champs à masquer.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('t')?.trim() || ''
  const slugHint = url.searchParams.get('slug')?.trim().toLowerCase() || ''

  const payload = verifyFormContactToken(token)
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'Lien invalide ou expiré' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  if (payload.slug && slugHint && payload.slug !== slugHint) {
    return NextResponse.json(
      { ok: false, error: 'Ce lien ne correspond pas à ce formulaire' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const db = createServiceClient()
  const { data: contact } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone')
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
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      hubspot_contact_id: payload.cid,
      values,
      hidden_field_keys,
      greeting: values.firstname || contact?.firstname || '',
    },
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
  )
}
