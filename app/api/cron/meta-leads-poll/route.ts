/**
 * GET /api/cron/meta-leads-poll
 *
 * Polling Meta Lead Ads toutes les 15 min — alternative au webhook qui peut
 * être instable. Pour chaque form actif, fetch les leads des dernières
 * 60 minutes et les processe. Idempotent grace au unique constraint sur
 * leadgen_id dans meta_lead_events.
 *
 * Sécurisé via Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchFormLeads, processMetaLead, type MetaLead } from '@/lib/meta'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/api-auth'

export const maxDuration = 300

function isFormProcessable(status: string | null | undefined): boolean {
  // Meta renvoie parfois "ACTIVE", "active" ou null selon le contexte.
  // On traite par defaut sauf si le form est explicitement archive/disabled.
  const s = (status || '').trim().toUpperCase()
  if (!s) return true
  return !['ARCHIVED', 'DISABLED', 'INACTIVE'].includes(s)
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const db = createServiceClient()

  // Pages actives + leur token
  const { data: pages } = await db.from('meta_lead_pages')
    .select('page_id, access_token, active')
    .eq('active', true)
  if (!pages || pages.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aucune page active', processed: 0 })
  }

  // Forms ACTIVE uniquement (ARCHIVED on skip pour pas spammer l'API)
  const pageIds = pages.map(p => p.page_id)
  const { data: forms } = await db.from('meta_lead_forms')
    .select('form_id, page_id, name, origine_label, default_owner_id, workflow_id, field_mappings, status')
    .in('page_id', pageIds)
  const activeForms = (forms ?? []).filter(f => isFormProcessable(f.status as string | null | undefined))

  if (activeForms.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aucun form actif', processed: 0 })
  }

  const pageTokenById = new Map(pages.map(p => [p.page_id, p.access_token as string]))

  // Fenetre logique de secours : le webhook doit etre temps reel, ce cron
  // rattrape les trous (delay/retry Meta, cold start, etc.).
  const minutesParam = parseInt(req.nextUrl.searchParams.get('minutes') ?? '10', 10)
  const maxPerFormParam = parseInt(req.nextUrl.searchParams.get('max_per_form') ?? '600', 10)
  // Mode backfill manuel: permet un rattrapage large après incident (jusqu'à 7 jours).
  // Le cron standard reste borné à 3h pour limiter la charge.
  const backfillMode = req.nextUrl.searchParams.get('backfill') === '1'
  const maxWindowMinutes = backfillMode ? 7 * 24 * 60 : 180
  const WINDOW_MINUTES = Number.isFinite(minutesParam) ? Math.min(Math.max(minutesParam, 5), maxWindowMinutes) : 10
  // Plus haut pour eviter les pertes sur pics; borne haute pour rester stable.
  const MAX_PER_FORM = Number.isFinite(maxPerFormParam) ? Math.min(Math.max(maxPerFormParam, 100), 5000) : 600
  const minCreatedAtMs = Date.now() - WINDOW_MINUTES * 60 * 1000
  let totalProcessed = 0
  let totalSkipped = 0
  let totalErrors = 0
  const formStats: Array<{ form_id: string; name: string | null; fetched: number; processed: number; skipped: number; errors: number; error?: string }> = []

  for (const form of activeForms) {
    const pageToken = pageTokenById.get(form.page_id)
    if (!pageToken) continue

    let fetched = 0, processed = 0, skipped = 0, errors = 0
    let formError: string | undefined

    try {
      const leads = await fetchFormLeads(form.form_id, pageToken, MAX_PER_FORM)
      const freshLeads = leads.filter(l => {
        const ms = Date.parse(l.created_time || '')
        return Number.isFinite(ms) && ms >= minCreatedAtMs
      })
      fetched = freshLeads.length
      if (freshLeads.length === 0) {
        formStats.push({ form_id: form.form_id, name: form.name, fetched, processed, skipped, errors })
        continue
      }

      // Idempotence : skip ceux déjà reçus
      const ids = freshLeads.map(l => l.id)
      const { data: existing } = await db.from('meta_lead_events')
        .select('leadgen_id')
        .in('leadgen_id', ids)
      const known = new Set((existing ?? []).map(e => e.leadgen_id as string))

      for (const lead of freshLeads) {
        if (known.has(lead.id)) { skipped++; continue }
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
            raw_payload: { lead, source: 'poll' },
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
          logger.error('meta-leads-poll-process', e, { leadgen_id: lead.id, form_id: form.form_id })
        }
      }
    } catch (e) {
      formError = e instanceof Error ? e.message : String(e)
      logger.error('meta-leads-poll-fetch', e, { form_id: form.form_id })
    }

    formStats.push({ form_id: form.form_id, name: form.name, fetched, processed, skipped, errors, error: formError })
    totalProcessed += processed
    totalSkipped += skipped
    totalErrors += errors
  }

  await logger.flush()

  return NextResponse.json({
    ok: true,
    forms_polled: activeForms.length,
    window_minutes: WINDOW_MINUTES,
    backfill_mode: backfillMode,
    max_per_form: MAX_PER_FORM,
    total_processed: totalProcessed,
    total_skipped: totalSkipped,
    total_errors: totalErrors,
    per_form: formStats.slice(0, 30), // limit response size
  })
}
