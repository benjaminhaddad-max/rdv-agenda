import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'

// Historique de recherche par utilisateur (derniers contacts ouverts).
// Strictement privé : owner_id = utilisateur courant. Synchronisé en base pour
// suivre le compte sur tous les appareils.

const MAX_RECENT = 5

// GET /api/crm/recent-contacts?context=crm-closer
//   → renvoie les <=5 derniers contacts ouverts (du plus récent au plus ancien).
export async function GET(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = req.nextUrl.searchParams.get('context') || 'crm'
  const db = createServiceClient()

  const { data, error } = await db
    .from('crm_recent_contacts')
    .select('contact')
    .eq('owner_id', ctx.appUserId)
    .eq('context', context)
    .order('opened_at', { ascending: false })
    .limit(MAX_RECENT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map((r) => r.contact))
}

// POST /api/crm/recent-contacts  { context, contact }
//   → enregistre (ou rafraîchit) un contact ouvert puis purge au-delà de 5.
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const context: string = body?.context || 'crm'
  const contact = body?.contact
  const contactId = contact?.hubspot_contact_id

  if (!contact || !contactId) {
    return NextResponse.json({ error: 'contact.hubspot_contact_id requis' }, { status: 400 })
  }

  const db = createServiceClient()

  const { error: upsertError } = await db
    .from('crm_recent_contacts')
    .upsert(
      {
        owner_id: ctx.appUserId,
        context,
        contact_id: String(contactId),
        contact,
        opened_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,context,contact_id' }
    )

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  // Purge : ne conserver que les MAX_RECENT plus récents pour cet utilisateur.
  const { data: all } = await db
    .from('crm_recent_contacts')
    .select('contact_id')
    .eq('owner_id', ctx.appUserId)
    .eq('context', context)
    .order('opened_at', { ascending: false })

  if (all && all.length > MAX_RECENT) {
    const toDelete = all.slice(MAX_RECENT).map((r) => r.contact_id)
    await db
      .from('crm_recent_contacts')
      .delete()
      .eq('owner_id', ctx.appUserId)
      .eq('context', context)
      .in('contact_id', toDelete)
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/crm/recent-contacts?context=crm-closer
//   → vide l'historique de l'utilisateur pour ce contexte.
export async function DELETE(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = req.nextUrl.searchParams.get('context') || 'crm'
  const db = createServiceClient()

  const { error } = await db
    .from('crm_recent_contacts')
    .delete()
    .eq('owner_id', ctx.appUserId)
    .eq('context', context)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
