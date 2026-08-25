import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { isAircallEnabled } from '@/lib/aircall'
import {
  pushCrmContactToAircall,
  resolveTeleproName,
  type CrmContactForAircall,
} from '@/lib/aircall-crm'

/**
 * POST /api/crm/contacts/[id]/aircall-sync
 *
 * Pousse la fiche CRM dans le carnet Aircall (prénom + nom visibles
 * quand le télépro compose le numéro). Appelé à l'ouverture de fiche
 * et au clic sur le téléphone.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireApiRole(['admin', 'closer', 'telepro', 'manager'])
  if (!authz.ok) return authz.response

  if (!isAircallEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'aircall_disabled' })
  }

  const { id: contactId } = await params
  const db = createServiceClient()

  const { data, error } = await db
    .from('crm_contacts')
    .select(
      'hubspot_contact_id, firstname, lastname, email, phone, telepro_user_id, classe_actuelle, hs_lead_status',
    )
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })

  const contact = data as CrmContactForAircall
  const teleproName = await resolveTeleproName(db, contact.telepro_user_id)
  const result = await pushCrmContactToAircall(contact, teleproName)

  return NextResponse.json({ ok: true, result })
}
