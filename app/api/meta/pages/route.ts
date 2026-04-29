import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchPageLeadForms, subscribePageToLeadgen } from '@/lib/meta'

/**
 * GET /api/meta/pages — liste les pages connectées + leurs forms (depuis cache)
 * POST /api/meta/pages?action=subscribe&page_id=... — abonne le webhook leadgen
 * POST /api/meta/pages?action=refresh_forms&page_id=... — refresh les forms via Graph
 * PATCH /api/meta/pages — { page_id, active? } pour activer/désactiver
 * DELETE /api/meta/pages?page_id=... — déconnecte une page
 */

export async function GET() {
  const db = createServiceClient()

  // Pages
  const { data: pages, error } = await db.from('meta_lead_pages')
    .select('page_id, page_name, user_name, subscribed, active, connected_at, last_lead_at, total_leads')
    .order('connected_at', { ascending: false })
  if (error) {
    return NextResponse.json({ pages: [], forms: [], events: [], error: error.message })
  }

  // Forms (toutes pages confondues, joignable côté UI)
  const { data: forms } = await db.from('meta_lead_forms')
    .select('form_id, page_id, name, status, leads_count, origine_label, default_owner_id, workflow_id, refreshed_at')
    .order('refreshed_at', { ascending: false })

  // 20 derniers leads reçus
  const { data: events } = await db.from('meta_lead_events')
    .select('id, leadgen_id, form_id, page_id, contact_id, contact_created, status, error, received_at, field_data')
    .order('received_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    pages: pages ?? [],
    forms: forms ?? [],
    events: events ?? [],
  })
}

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl
  const action = searchParams.get('action')
  const pageId = searchParams.get('page_id')

  if (!pageId) return NextResponse.json({ error: 'page_id manquant' }, { status: 400 })

  const { data: page } = await db.from('meta_lead_pages')
    .select('access_token, page_name')
    .eq('page_id', pageId)
    .maybeSingle()
  if (!page) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

  if (action === 'subscribe') {
    try {
      await subscribePageToLeadgen(pageId, page.access_token)
      await db.from('meta_lead_pages').update({ subscribed: true }).eq('page_id', pageId)
      return NextResponse.json({ ok: true, page_id: pageId, subscribed: true })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  if (action === 'refresh_forms') {
    try {
      const forms = await fetchPageLeadForms(pageId, page.access_token)
      // Upsert chaque form
      for (const f of forms) {
        await db.from('meta_lead_forms').upsert({
          form_id: f.id,
          page_id: pageId,
          name: f.name || null,
          status: f.status || null,
          leads_count: f.leads_count || 0,
          questions: f.questions || null,
          refreshed_at: new Date().toISOString(),
        }, { onConflict: 'form_id' })
      }
      return NextResponse.json({ ok: true, forms_count: forms.length })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'action invalide' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const db = createServiceClient()
  let body: { page_id?: string; active?: boolean; form_id?: string; origine_label?: string; default_owner_id?: string; workflow_id?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }

  // Update page (active toggle)
  if (body.page_id && body.active !== undefined) {
    await db.from('meta_lead_pages').update({ active: body.active }).eq('page_id', body.page_id)
    return NextResponse.json({ ok: true })
  }

  // Update form metadata (origine, owner, workflow)
  if (body.form_id) {
    const updates: Record<string, unknown> = {}
    if (body.origine_label !== undefined) updates.origine_label = body.origine_label
    if (body.default_owner_id !== undefined) updates.default_owner_id = body.default_owner_id || null
    if (body.workflow_id !== undefined) updates.workflow_id = body.workflow_id || null
    await db.from('meta_lead_forms').update(updates).eq('form_id', body.form_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const db = createServiceClient()
  const pageId = req.nextUrl.searchParams.get('page_id')
  if (!pageId) return NextResponse.json({ error: 'page_id manquant' }, { status: 400 })
  // Cascade DELETE supprimera meta_lead_forms automatiquement
  await db.from('meta_lead_pages').delete().eq('page_id', pageId)
  return NextResponse.json({ ok: true })
}
