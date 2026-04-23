import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/[id]/details
 *
 * Lit UNIQUEMENT depuis Supabase — aucune dépendance HubSpot au runtime.
 * Le cron crm-sync est responsable de remplir :
 *   - crm_contacts.hubspot_raw (toutes les propriétés)
 *   - crm_properties (metadata label/group/options)
 *   - crm_activities (timeline)
 *   - crm_form_submissions
 *   - crm_deals (transactions liées)
 *   - crm_owners
 *
 * Tant que la migration v5 n'est pas appliquée, les tables absentes sont
 * traitées comme vides (dégradation gracieuse).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params

  // 1. Contact (colonnes connues + hubspot_raw si colonne existe)
  const { data: contact, error: contactErr } = await db
    .from('crm_contacts')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (contactErr || !contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // 2. Deals liés
  const { data: dealsData } = await db
    .from('crm_deals')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .order('createdate', { ascending: false })
  const deals = dealsData ?? []

  // 3. RDV liés (join via deals.supabase_appt_id)
  const apptIds = deals
    .map(d => d.supabase_appt_id as string | null)
    .filter((v): v is string => !!v)

  let appointments: Array<Record<string, unknown>> = []
  if (apptIds.length > 0) {
    const { data: appts } = await db
      .from('rdv_appointments')
      .select('id, start_at, end_at, status, prospect_name, prospect_phone, prospect_email, notes, commercial_id')
      .in('id', apptIds)
    appointments = appts ?? []
  }

  // 4. Properties metadata (si table crm_properties existe)
  //    On catch l'erreur pour rester compatible avant migration v5.
  let properties: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_properties')
      .select('name, label, description, group_name, type, field_type, options, display_order')
      .eq('object_type', 'contacts')
      .eq('archived', false)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('label', { ascending: true })
    properties = data ?? []
  } catch { /* table absente */ }

  // 5. Activities (notes, appels, emails, meetings)
  let activities: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_activities')
      .select('id, hubspot_engagement_id, activity_type, subject, body, direction, status, owner_id, metadata, occurred_at, hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(200)
    activities = data ?? []
  } catch { /* table absente */ }

  // 6. Form submissions
  let formSubmissions: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_form_submissions')
      .select('id, form_id, form_title, form_type, page_url, values, submitted_at')
      .eq('hubspot_contact_id', contactId)
      .order('submitted_at', { ascending: false })
    formSubmissions = data ?? []
  } catch { /* table absente */ }

  // 7. Grouper les properties par group_name pour l'UI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: Record<string, any[]> = {}
  for (const p of properties) {
    const g = (p.group_name as string) || 'other'
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }

  return NextResponse.json({
    contact,
    deals,
    appointments,
    properties,
    groups,
    activities,
    formSubmissions,
  })
}
