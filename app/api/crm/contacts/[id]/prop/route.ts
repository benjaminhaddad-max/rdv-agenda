import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  loadContactPropertyMeta,
  triggerPropertyChangedWorkflows,
  writeContactProperty,
} from '@/lib/crm-contact-prop-write'
import { isReadOnlyProperty } from '@/lib/crm-property-normalization'
import { isBenjaminTeleproId, isTeleproProperty, triggerBenjaminSheetSyncForContact } from '@/lib/benjamin-sheet-sync'

/**
 * PATCH /api/crm/contacts/[id]/prop
 * Body: { property: string, value: string }
 *
 * Écrit dans Supabase (colonne individuelle si connue + hubspot_raw JSONB).
 * HubSpot est déconnecté : on ne pousse plus rien vers HubSpot ici.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params
  const body = await req.json()
  const property = typeof body?.property === 'string' ? body.property : ''
  const value = body?.value as unknown

  if (!property || typeof property !== 'string') {
    return NextResponse.json({ error: 'property manquant' }, { status: 400 })
  }

  const propertyMeta = await loadContactPropertyMeta(db, property)
  if (isReadOnlyProperty(propertyMeta)) {
    return NextResponse.json({ error: 'Propriété en lecture seule (calculée ou fichier)' }, { status: 400 })
  }

  const result = await writeContactProperty(db, contactId, property, value, {
    propertyMeta,
    sourceLabel: 'Modifié depuis le CRM',
    skipBenjaminSync: true,
  })

  if (!result.ok) {
    const status = result.error === 'Contact introuvable' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }

  await triggerPropertyChangedWorkflows(db, contactId, property, result.normalizedValue)

  if (isTeleproProperty(property) && isBenjaminTeleproId(String(result.normalizedValue ?? ''))) {
    await triggerBenjaminSheetSyncForContact(db, contactId)
  }

  return NextResponse.json({ ok: true, hubspot_mirrored: false, hubspot_error: null })
}
