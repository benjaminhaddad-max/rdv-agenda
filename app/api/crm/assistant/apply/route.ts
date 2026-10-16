import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { assignContactsToTelepro } from '@/lib/assign-leads'
import { MAX_VIEW_CONTACTS } from '@/lib/crm-assistant'

export const maxDuration = 300

// POST /api/crm/assistant/apply — confirme une proposition de l'assistant :
// attribue les contacts au télépro et crée éventuellement sa vue privée.
// Body : { contact_ids, telepro_rdv_user_id, view_name?, keep_status? }
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const db = createServiceClient()

  const body = await req.json().catch(() => null) as {
    contact_ids?: string[]; telepro_rdv_user_id?: string; view_name?: string | null; keep_status?: boolean
  } | null
  const ids = [...new Set((body?.contact_ids ?? []).map(String).filter(Boolean))]
  if (ids.length === 0 || ids.length > 2000 || !body?.telepro_rdv_user_id) {
    return NextResponse.json({ error: 'contact_ids (1 à 2000) et telepro_rdv_user_id requis' }, { status: 400 })
  }

  const { data: user } = await db
    .from('rdv_users')
    .select('id, name, hubspot_user_id, hubspot_owner_id')
    .eq('id', body.telepro_rdv_user_id)
    .maybeSingle()
  const hsId = String(user?.hubspot_user_id || user?.hubspot_owner_id || '').trim()
  if (!user || !hsId) return NextResponse.json({ error: 'Télépro introuvable' }, { status: 404 })

  const { done, errors } = await assignContactsToTelepro(db, ids, hsId, { keepStatus: !!body.keep_status })

  let viewId: string | null = null
  const viewName = body.view_name?.trim().slice(0, 60)
  if (viewName && ids.length <= MAX_VIEW_CONTACTS) {
    // Vue privée du télépro : filtre sur la liste exacte des contacts attribués.
    const now = Date.now()
    viewId = `uv_${now}_${Math.random().toString(36).slice(2, 7)}`
    const { data: existing } = await db.from('crm_saved_views').select('position').eq('owner_id', user.id).eq('scope', 'contacts')
    const position = Math.min(0, ...((existing ?? []) as Array<{ position: number }>).map(v => v.position)) - 1
    const { error } = await db.from('crm_saved_views').insert({
      id: viewId,
      name: viewName,
      owner_id: user.id,
      scope: 'contacts',
      kind: 'view',
      position,
      filter_groups: { advancedRules: [{ id: `r_${now}_assistant`, field: 'custom:hubspot_contact_id', operator: 'is_any', value: ids.join(',') }] },
    })
    if (error) { errors.push(`vue: ${error.message}`); viewId = null }
  }

  return NextResponse.json({ ok: true, done, telepro: user.name, view_id: viewId, errors: errors.length ? errors : undefined })
}
