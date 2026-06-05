import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'

// Vérifie que l'utilisateur courant a le droit de modifier / supprimer la vue.
//   - vue privée (owner_id défini) → seul son propriétaire
//   - vue globale (owner_id NULL)  → admin uniquement
async function authorizeViewMutation(id: string) {
  const db = createServiceClient()
  const ctx = await getApiUserContext()
  if (!ctx) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: row } = await db
    .from('crm_saved_views')
    .select('id, owner_id')
    .eq('id', id)
    .maybeSingle()

  if (!row) return { ok: false as const, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

  if (row.owner_id) {
    if (row.owner_id !== ctx.appUserId) {
      return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
  } else if (ctx.role !== 'admin') {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, db }
}

// PATCH /api/crm/views/[id] — update name / filter_groups
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorizeViewMutation(id)
  if (!auth.ok) return auth.response
  const db = auth.db
  const body = await req.json()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name        !== undefined) patch.name         = body.name
  if (body.filter_groups !== undefined) patch.filter_groups = body.filter_groups
  if (body.position    !== undefined) patch.position     = body.position

  const { data, error } = await db
    .from('crm_saved_views')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/crm/views/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorizeViewMutation(id)
  if (!auth.ok) return auth.response
  const { error } = await auth.db.from('crm_saved_views').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
