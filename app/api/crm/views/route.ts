import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { TELEPRO_SHARED_VIEW_IDS } from '@/lib/crm-views'

// GET /api/crm/views
//
//   ?scope=contacts|transactions  (défaut: contacts)
//   ?owner=me                     → vues PRIVÉES de l'utilisateur courant
//   ?shared=telepro               → vues globales partagées avec les télépros
//   (sans owner)                  → vues GLOBALES admin (owner_id IS NULL)
//
// La page admin appelle /api/crm/views sans paramètre → elle continue de ne
// voir que les vues globales partagées. Les télépros / closers appellent avec
// owner=me pour récupérer uniquement leurs propres vues.
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const scope = req.nextUrl.searchParams.get('scope') || 'contacts'
  const owner = req.nextUrl.searchParams.get('owner')
  const shared = req.nextUrl.searchParams.get('shared')

  let query = db
    .from('crm_saved_views')
    .select('*')
    .eq('scope', scope)
    .order('position')

  if (shared === 'telepro') {
    const ctx = await getApiUserContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    query = query.is('owner_id', null).in('id', [...TELEPRO_SHARED_VIEW_IDS])
  } else if (owner === 'me') {
    const ctx = await getApiUserContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    query = query.eq('owner_id', ctx.appUserId)
  } else {
    query = query.is('owner_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/crm/views — create
//
// Avec { owner: 'me' } la vue est rattachée à l'utilisateur courant (privée).
// Sinon elle est globale (owner_id NULL) — réservé à l'admin.
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const body = await req.json()
  const { id, name, filter_groups, preset_flags, position, scope, owner } = body

  let ownerId: string | null = null
  if (owner === 'me') {
    const ctx = await getApiUserContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ownerId = ctx.appUserId
  } else {
    // Création d'une vue globale → admin uniquement.
    const ctx = await getApiUserContext()
    if (!ctx || ctx.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await db
    .from('crm_saved_views')
    .insert({
      id,
      name,
      filter_groups: filter_groups ?? [],
      preset_flags: preset_flags ?? null,
      position: position ?? 0,
      scope: scope ?? 'contacts',
      owner_id: ownerId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
