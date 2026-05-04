import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/deals/[id]/details
 * Lit uniquement depuis Supabase.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: dealId } = await params

  const { data: deal, error } = await db
    .from('crm_deals')
    .select('*')
    .eq('hubspot_deal_id', dealId)
    .maybeSingle()

  if (error || !deal) {
    return NextResponse.json({ error: 'Deal introuvable' }, { status: 404 })
  }

  // Contact associé
  let contact: Record<string, unknown> | null = null
  if (deal.hubspot_contact_id) {
    const { data } = await db
      .from('crm_contacts')
      .select('*')
      .eq('hubspot_contact_id', deal.hubspot_contact_id)
      .maybeSingle()
    contact = data
  }

  // RDV lié
  let appointment: Record<string, unknown> | null = null
  if (deal.supabase_appt_id) {
    const { data } = await db
      .from('rdv_appointments')
      .select('id, start_at, end_at, status, prospect_name, prospect_phone, prospect_email, notes, commercial_id')
      .eq('id', deal.supabase_appt_id)
      .maybeSingle()
    appointment = data
  }

  // Properties metadata
  let properties: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_properties')
      .select('name, label, description, group_name, type, field_type, options, display_order')
      .eq('object_type', 'deals')
      .eq('archived', false)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('label', { ascending: true })
    properties = data ?? []
  } catch { /* table absente */ }

  // Activities du deal
  let activities: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_activities')
      .select('id, hubspot_engagement_id, activity_type, subject, body, direction, status, owner_id, metadata, occurred_at')
      .eq('hubspot_deal_id', dealId)
      .order('occurred_at', { ascending: false })
      .limit(200)
    activities = data ?? []
  } catch { /* table absente */ }

  // Tasks du deal
  let tasks: Array<Record<string, unknown>> = []
  try {
    const { data } = await db
      .from('crm_tasks')
      .select('id, title, description, owner_id, status, priority, task_type, due_at, completed_at, created_at, hubspot_contact_id')
      .eq('hubspot_deal_id', dealId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100)
    tasks = data ?? []
  } catch { /* table absente */ }

  // Owners (tous les owners actifs HubSpot — pour dropdown propriétaire)
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
    deal,
    contact,
    appointment,
    properties,
    groups,
    activities,
    tasks,
    owners,
  })
}
