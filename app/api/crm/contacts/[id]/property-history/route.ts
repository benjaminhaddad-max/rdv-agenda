import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/[id]/property-history?name=hs_lead_status
 *
 * Renvoie l'historique de TOUTES les valeurs prises par une propriété d'un
 * contact, du plus récent au plus ancien. Si ?name est omis, renvoie un
 * récap groupé par propriété (top 50 changements globaux).
 *
 * Réplique le panneau "Détails" de HubSpot.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params
  const { searchParams } = new URL(req.url)
  const propName = searchParams.get('name')

  if (propName) {
    const { data, error } = await db
      .from('crm_property_history')
      .select('id, value, changed_at, source_type, source_id, source_label, source_metadata')
      .eq('hubspot_contact_id', contactId)
      .eq('property_name', propName)
      .order('changed_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Charger les owners pour les sources type CRM_UI / WORKFLOW si source_id
    // est un ownerId.
    return NextResponse.json({ history: data ?? [] })
  }

  // Sans paramètre name : renvoie une chronologie globale du contact (toutes
  // propriétés mélangées), pratique pour un onglet "Tout l'historique".
  const { data, error } = await db
    .from('crm_property_history')
    .select('id, property_name, value, changed_at, source_type, source_id, source_label')
    .eq('hubspot_contact_id', contactId)
    .order('changed_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ timeline: data ?? [] })
}
