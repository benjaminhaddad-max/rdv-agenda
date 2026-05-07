import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/telepro-conflicts?status=pending
 * Liste les doublons d'attribution télépro à arbitrer.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const db = createServiceClient()

  const { data, error } = await db
    .from('crm_telepro_conflicts')
    .select(`
      id, hubspot_contact_id, appointment_id, status, created_at,
      existing_telepro:existing_telepro_id ( id, name, avatar_color ),
      new_telepro:new_telepro_id ( id, name, avatar_color )
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrichir avec le nom du contact (firstname + lastname + email)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const contactIds = Array.from(new Set(rows.map(r => r.hubspot_contact_id)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactsMap: Record<string, any> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone')
      .in('hubspot_contact_id', contactIds)
    for (const c of contacts ?? []) contactsMap[c.hubspot_contact_id] = c
  }

  const enriched = rows.map(r => ({ ...r, contact: contactsMap[r.hubspot_contact_id] || null }))
  return NextResponse.json({ data: enriched, total: enriched.length })
}
