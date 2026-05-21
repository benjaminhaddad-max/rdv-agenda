/**
 * GET /api/meta/backfill-leads
 *
 * Récupère TOUS les leads passés depuis Meta Graph API et les processe
 * comme si c'était des webhooks. Idempotent : skip les leads déjà reçus.
 *
 * Query params :
 *   - form_id=X      : limite à un form précis (optionnel)
 *   - page_id=Y      : limite à une page précise (optionnel)
 *   - max_per_form=N : safety (défaut 5000)
 *
 * Sécurisé par Authorization: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchFormLeads, processMetaLead, type MetaLead } from '@/lib/meta'
import { logger } from '@/lib/logger'

export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  const validTokens = [CRON_SECRET, SERVICE_KEY].filter(Boolean)
  if (validTokens.length > 0 && !validTokens.includes(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const onlyFormId = req.nextUrl.searchParams.get('form_id') ?? null
  const onlyPageId = req.nextUrl.searchParams.get('page_id') ?? null
  const maxPerForm = Math.min(
    parseInt(req.nextUrl.searchParams.get('max_per_form') ?? '5000', 10),
    50000,
  )

  // 1. Récupère les pages actives + leur token
  let pagesQuery = db.from('meta_lead_pages')
    .select('page_id, access_token, active')
    .eq('active', true)
  if (onlyPageId) pagesQuery = pagesQuery.eq('page_id', onlyPageId)
  const { data: pages, error: pagesErr } = await pagesQuery
  if (pagesErr) return NextResponse.json({ error: pagesErr.message }, { status: 500 })
  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: 'Aucune page active trouvée' }, { status: 404 })
  }

  // 2. Récupère les forms (filtrés sur les pages actives)
  const pageIds = pages.map(p => p.page_id)
  let formsQuery = db.from('meta_lead_forms')
    .select('form_id, page_id, name, origine_label, default_owner_id, workflow_id, field_mappings')
    .in('page_id', pageIds)
  if (onlyFormId) formsQuery = formsQuery.eq('form_id', onlyFormId)
  const { data: forms, error: formsErr } = await formsQuery
  if (formsErr) return NextResponse.json({ error: formsErr.message }, { status: 500 })
  if (!forms || forms.length === 0) {
    return NextResponse.json({ error: 'Aucun form trouvé' }, { status: 404 })
  }

  const pageTokenById = new Map(pages.map(p => [p.page_id, p.access_token as string]))

  // 3. Pour chaque form, fetch les leads + process
  const perForm: Array<{ form_id: string; name: string | null; fetched: number; processed: number; skipped: number; errors: number; error?: string }> = []
  let totalProcessed = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const form of forms) {
    const pageToken = pageTokenById.get(form.page_id)
    if (!pageToken) {
      perForm.push({ form_id: form.form_id, name: form.name, fetched: 0, processed: 0, skipped: 0, errors: 0, error: 'No page token' })
      continue
    }

    let fetched = 0
    let processed = 0
    let skipped = 0
    let errors = 0
    let formError: string | undefined

    try {
      const leads = await fetchFormLeads(form.form_id, pageToken, maxPerForm)
      fetched = leads.length

      if (leads.length === 0) {
        perForm.push({ form_id: form.form_id, name: form.name, fetched, processed, skipped, errors })
        continue
      }

      // Idempotence : récupère les leadgen_id déjà reçus pour ce form
      const ids = leads.map(l => l.id)
      const { data: existing } = await db.from('meta_lead_events')
        .select('leadgen_id')
        .in('leadgen_id', ids)
      const knownIds = new Set((existing ?? []).map(e => e.leadgen_id as string))

      for (const lead of leads) {
        if (knownIds.has(lead.id)) { skipped++; continue }

        try {
          const result = await processMetaLead(
            lead as MetaLead,
            form.page_id,
            {
              name: form.name ?? undefined,
              origine_label: form.origine_label ?? undefined,
              default_owner_id: form.default_owner_id ?? undefined,
              workflow_id: form.workflow_id ?? undefined,
              field_mappings: form.field_mappings ?? null,
            },
          )

          await db.from('meta_lead_events').insert({
            leadgen_id: lead.id,
            page_id: form.page_id,
            form_id: lead.form_id || form.form_id,
            ad_id: lead.ad_id || null,
            adset_id: lead.adset_id || null,
            campaign_id: lead.campaign_id || null,
            field_data: lead.field_data || [],
            raw_payload: { lead, source: 'backfill' },
            contact_id: result.contactId,
            contact_created: result.contactCreated,
            status: result.error ? 'error' : 'processed',
            error: result.error || null,
            processed_at: new Date().toISOString(),
          })

          if (result.error) errors++
          else processed++
        } catch (e) {
          errors++
          logger.error('backfill-leads-process', e, { leadgen_id: lead.id, form_id: form.form_id })
        }
      }
    } catch (e) {
      formError = e instanceof Error ? e.message : String(e)
      logger.error('backfill-leads-fetch', e, { form_id: form.form_id })
    }

    perForm.push({ form_id: form.form_id, name: form.name, fetched, processed, skipped, errors, error: formError })
    totalProcessed += processed
    totalSkipped += skipped
    totalErrors += errors
  }

  await logger.flush()

  return NextResponse.json({
    ok: true,
    forms_count: forms.length,
    total_processed: totalProcessed,
    total_skipped: totalSkipped,
    total_errors: totalErrors,
    per_form: perForm,
  })
}
