import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * PATCH /api/crm/activities/[id]
 * Modifie une activité native (note, appel, email loggé, réunion).
 * Body : { subject?: string | null, body?: string | null }
 *
 * DELETE /api/crm/activities/[id]
 * Supprime l'activité.
 *
 * Seules les activités natives (hubspot_engagement_id NULL) sont modifiables :
 * les activités issues de HubSpot ne doivent pas être altérées localement.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = createServiceClient()
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('subject' in body) {
    const s = body.subject == null ? null : String(body.subject).trim()
    updates.subject = s || null
  }
  if ('body' in body) {
    const b = body.body == null ? null : String(body.body).trim()
    updates.body = b || null
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  const { data, error } = await db
    .from('crm_activities')
    .update(updates)
    .eq('id', id)
    .is('hubspot_engagement_id', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json(
      { error: 'Activité introuvable ou non modifiable (synchronisée depuis HubSpot)' },
      { status: 404 },
    )
  }
  return NextResponse.json({ activity: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = createServiceClient()
  const { id } = await params

  const { data, error } = await db
    .from('crm_activities')
    .delete()
    .eq('id', id)
    .is('hubspot_engagement_id', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'Activité introuvable ou non supprimable (synchronisée depuis HubSpot)' },
      { status: 404 },
    )
  }
  return NextResponse.json({ ok: true, deleted: data.length })
}
