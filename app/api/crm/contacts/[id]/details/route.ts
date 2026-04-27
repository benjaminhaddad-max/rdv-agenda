import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/[id]/details — lit uniquement Supabase.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params

  const { data: contact, error: contactErr } = await db
    .from('crm_contacts')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (contactErr || !contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  const { data: dealsData } = await db
    .from('crm_deals')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .order('createdate', { ascending: false })
  const deals = dealsData ?? []

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

  // Propriétés metadata
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

  // Propriétés metadata deals (pour formater dealstage/pipeline)
  let dealProperties: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_properties')
      .select('name, label, options')
      .eq('object_type', 'deals')
      .eq('archived', false)
    dealProperties = data ?? []
  } catch { /* table absente */ }

  // Activities
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

  // Form submissions
  let formSubmissions: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_form_submissions')
      .select('id, form_id, form_title, form_type, page_url, values, submitted_at')
      .eq('hubspot_contact_id', contactId)
      .order('submitted_at', { ascending: false })
    formSubmissions = data ?? []
  } catch { /* table absente */ }

  // Tasks
  let tasks: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_tasks')
      .select('id, title, description, owner_id, status, priority, task_type, due_at, completed_at, created_at, hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100)
    tasks = data ?? []
  } catch { /* table absente */ }

  // Owners : on charge TOUS les owners actifs (et pas seulement ceux liés
  // à ce contact) pour alimenter le dropdown "Propriétaire" avec toutes
  // les valeurs disponibles dans HubSpot.
  let owners: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_owners')
      .select('hubspot_owner_id, email, firstname, lastname, archived')
      .eq('archived', false)
      .order('firstname', { ascending: true })
    owners = data ?? []
  } catch { /* table absente */ }

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
    dealProperties,
    groups,
    activities,
    formSubmissions,
    owners,
    tasks,
  })
}
