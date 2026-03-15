/**
 * GET /api/cron/auto-replanifier
 *
 * Planifié chaque nuit à 2h UTC.
 * Deux actions :
 *
 * 1. AUTO NO-SHOW : RDV dont start_at est passé de plus de 30 min et
 *    dont le statut est encore 'confirme' ou 'confirme_prospect' (le closer
 *    n'a appuyé sur aucun bouton) → passe en 'no_show' + HubSpot "À Replanifier"
 *
 * 2. SMS REPLANIFIER : RDV en 'no_show' dont start_at est entre -48h et -24h
 *    (ni le prospect ni le closer n'ont rien fait, SMS pas encore envoyé)
 *    → envoi du SMS de proposition de reprendre RDV
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { updateDealStage, STAGES } from '@/lib/hubspot'
import { sendSms, buildReplanifierSms } from '@/lib/smsfactor'

const REPLANIF_URL = process.env.REPLANIF_URL || process.env.NEXT_PUBLIC_SITE_URL || ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // Seuil : RDV commencé il y a plus de 30 min
  const pastThreshold = new Date(now.getTime() - 30 * 60 * 1000)

  const db = createServiceClient()

  // ── PARTIE 1 : Auto no-show ───────────────────────────────────────────────
  const { data: toAutoClose, error: fetchErr } = await db
    .from('rdv_appointments')
    .select('id, hubspot_deal_id, prospect_name')
    .in('status', ['confirme', 'confirme_prospect'])
    .lt('start_at', pastThreshold.toISOString())

  if (fetchErr) {
    console.error('[cron/auto-replanifier] Erreur fetch auto-close :', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const autoClosedIds: string[] = []

  for (const appt of toAutoClose ?? []) {
    const { error: updateErr } = await db
      .from('rdv_appointments')
      .update({ status: 'no_show' })
      .eq('id', appt.id)

    if (updateErr) {
      console.error(`[cron/auto-replanifier] Erreur update no_show ${appt.id} :`, updateErr.message)
      continue
    }

    autoClosedIds.push(appt.id)

    // Sync HubSpot → "À Replanifier"
    if (appt.hubspot_deal_id) {
      try {
        await updateDealStage(appt.hubspot_deal_id, 'aReplanifier')
      } catch (e) {
        console.error(`[cron/auto-replanifier] HubSpot update failed for ${appt.id}:`, e)
      }
    }
  }

  console.log(`[cron/auto-replanifier] ${autoClosedIds.length} RDV passés en no_show automatiquement`)

  // ── PARTIE 2 : SMS replanification (24h après no-show) ───────────────────
  const window24hStart = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const window24hEnd   = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: toSmsReplanif, error: fetchSmsErr } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, sms_replanifier_sent_at')
    .eq('status', 'no_show')
    .not('prospect_phone', 'is', null)
    .is('sms_replanifier_sent_at', null)
    .gte('start_at', window24hStart.toISOString())
    .lte('start_at', window24hEnd.toISOString())

  if (fetchSmsErr) {
    console.error('[cron/auto-replanifier] Erreur fetch SMS replanif :', fetchSmsErr.message)
    // On continue quand même — la partie 1 est déjà faite
  }

  const smsSent: string[] = []

  for (const appt of toSmsReplanif ?? []) {
    if (!appt.prospect_phone || appt.sms_replanifier_sent_at) continue

    const firstName = appt.prospect_name.trim().split(/\s+/)[0]
    const message = buildReplanifierSms(firstName, REPLANIF_URL || undefined)
    const smsResult = await sendSms(appt.prospect_phone, message)

    if (smsResult.ok) {
      await db
        .from('rdv_appointments')
        .update({ sms_replanifier_sent_at: new Date().toISOString() })
        .eq('id', appt.id)
      smsSent.push(appt.id)
    } else {
      console.error(`[cron/auto-replanifier] SMS replanif échoué pour ${appt.id}:`, smsResult.error)
    }
  }

  console.log(`[cron/auto-replanifier] ${smsSent.length} SMS replanification envoyés`)

  return NextResponse.json({
    autoNoShow: autoClosedIds.length,
    smsReplanifier: smsSent.length,
    autoClosedIds,
    smsSentIds: smsSent,
  })
}
