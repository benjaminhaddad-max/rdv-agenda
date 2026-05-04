import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { fetchLeadById, processMetaLead, type MetaLead } from '@/lib/meta'
import { logger } from '@/lib/logger'

/**
 * GET /api/meta/webhook — vérification du webhook par Meta (challenge response)
 * POST /api/meta/webhook — réception des notifications leadgen en temps réel
 */

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || ''
const APP_SECRET = process.env.META_APP_SECRET || ''

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  // 1. Lit le body brut + vérifie la signature HMAC
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256') || ''

  if (APP_SECRET && signature) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', APP_SECRET)
      .update(rawBody)
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return new NextResponse('Invalid signature', { status: 401 })
    }
  }

  // 2. Parse le payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (payload.object !== 'page') {
    // On accepte mais on traite pas (Meta ping autres objets aussi)
    return NextResponse.json({ ok: true })
  }

  const db = createServiceClient()

  // 3. Pour chaque entry/change leadgen, récupère le lead complet via Graph API
  for (const entry of payload.entry || []) {
    const pageId = String(entry.id || '')
    for (const change of (entry.changes || [])) {
      if (change.field !== 'leadgen') continue
      const v = change.value || {}
      const leadgenId = String(v.leadgen_id || '')
      if (!leadgenId) continue

      // Idempotence : si déjà reçu, skip
      const { data: existing } = await db.from('meta_lead_events')
        .select('id')
        .eq('leadgen_id', leadgenId)
        .maybeSingle()
      if (existing) continue

      // Récupère le page token
      const { data: pageRow } = await db.from('meta_lead_pages')
        .select('page_id, access_token, active')
        .eq('page_id', pageId)
        .maybeSingle()

      if (!pageRow || !pageRow.active) {
        await db.from('meta_lead_events').insert({
          leadgen_id: leadgenId,
          page_id: pageId,
          form_id: v.form_id || null,
          ad_id: v.ad_id || null,
          adset_id: v.adset_id || null,
          campaign_id: v.campaign_id || null,
          field_data: {},
          raw_payload: v,
          status: 'error',
          error: 'Page non connectée ou désactivée',
        })
        continue
      }

      // Fetch lead complet via Graph API
      let lead: MetaLead | null = null
      try {
        lead = await fetchLeadById(leadgenId, pageRow.access_token)
      } catch (err) {
        logger.error('meta-webhook-fetch-lead', err, {
          leadgen_id: leadgenId, page_id: pageId, form_id: v.form_id,
        })
        await db.from('meta_lead_events').insert({
          leadgen_id: leadgenId,
          page_id: pageId,
          form_id: v.form_id || null,
          ad_id: v.ad_id || null,
          adset_id: v.adset_id || null,
          campaign_id: v.campaign_id || null,
          field_data: {},
          raw_payload: v,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      // Récupère metadata du form (origine_label, owner, workflow, field_mappings)
      const { data: formMeta } = await db.from('meta_lead_forms')
        .select('origine_label, default_owner_id, workflow_id, name, field_mappings')
        .eq('form_id', lead.form_id || v.form_id || '')
        .maybeSingle()

      // Process : crée/maj le contact
      const result = await processMetaLead(lead, pageId, formMeta || undefined)

      if (result.error) {
        logger.error('meta-webhook-process-lead', result.error, {
          leadgen_id: leadgenId, page_id: pageId, form_id: lead.form_id,
          field_data: lead.field_data,
        })
      }

      // Enregistre l'event
      await db.from('meta_lead_events').insert({
        leadgen_id: leadgenId,
        page_id: pageId,
        form_id: lead.form_id || null,
        ad_id: lead.ad_id || null,
        adset_id: lead.adset_id || null,
        campaign_id: lead.campaign_id || null,
        field_data: lead.field_data || [],
        raw_payload: { lead, webhook: v },
        contact_id: result.contactId,
        contact_created: result.contactCreated,
        status: result.error ? 'error' : 'processed',
        error: result.error || null,
        processed_at: new Date().toISOString(),
      })
    }
  }

  // Flush les logs avant que la fonction serverless meurt
  await logger.flush()

  // Meta exige un 200 OK rapide sinon retry
  return NextResponse.json({ ok: true })
}
