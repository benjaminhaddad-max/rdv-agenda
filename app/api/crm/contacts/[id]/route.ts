import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { updateContact } from '@/lib/hubspot'

// Champs autorisés en édition
const ALLOWED_FIELDS = ['firstname', 'lastname', 'phone', 'classe_actuelle', 'zone_localite'] as const

// Mapping Supabase → HubSpot property names
const HS_FIELD_MAP: Record<string, string> = {
  firstname: 'firstname',
  lastname: 'lastname',
  phone: 'phone',
  classe_actuelle: 'classe_actuelle',
  zone_localite: 'zone___localite',
}

// PATCH /api/crm/contacts/[id]
// Met à jour un contact Supabase + sync HubSpot
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: contactId } = await params
  const body = await req.json()

  const db = createServiceClient()

  // Vérifier que le contact existe
  const { data: existing, error: fetchErr } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id')
    .eq('hubspot_contact_id', contactId)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // Construire le payload de mise à jour (seulement les champs autorisés)
  const updatePayload: Record<string, unknown> = { synced_at: new Date().toISOString() }
  const hsProps: Record<string, string> = {}

  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      updatePayload[field] = body[field]
      const hsField = HS_FIELD_MAP[field]
      if (hsField) {
        hsProps[hsField] = String(body[field] ?? '')
      }
    }
  }

  if (Object.keys(updatePayload).length <= 1) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  // Mise à jour Supabase
  const { data: updated, error: updateErr } = await db
    .from('crm_contacts')
    .update(updatePayload)
    .eq('hubspot_contact_id', contactId)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Sync HubSpot (best-effort)
  const errors: string[] = []
  if (Object.keys(hsProps).length > 0) {
    try {
      await updateContact(contactId, hsProps)
    } catch (e) {
      errors.push(`hubspot: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    contact: updated,
    hubspot_errors: errors.length > 0 ? errors : null,
  })
}
