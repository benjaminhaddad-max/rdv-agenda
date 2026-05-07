/**
 * lib/sms-sender.ts
 *
 * Logique d'envoi d'une campagne SMS, factorisee pour etre appelee :
 *  - depuis POST /api/sms-campaigns/[id]/send (envoi manuel via UI)
 *  - depuis le cron /api/cron/sms-campaigns-scheduled (envoi programme)
 *
 * Le cron appelait avant via fetch self-call -> probleme de fiabilite (URL,
 * auth, timeouts). Ici on appelle directement la fonction = robuste, plus
 * rapide, plus simple a debugger.
 *
 * IMPORTANT : quand la campagne a des `tracked_links` avec tracked=true,
 * on force `shortenLinks` au moment de l'envoi pour que l'URL trackee
 * (https://<domain>/r/<token>) soit shortenee par SMS Factor en
 * `https://smsf.st/<5chars>` -> URL beaucoup plus courte dans le SMS.
 */

import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import {
  sendSms,
  formatPhoneForSms,
  detectUrls,
  replaceUrlsWithShortPlaceholder,
} from '@/lib/smsfactor'
import { logger } from '@/lib/logger'
import { viewToParams } from '@/lib/crm-views'
import type { CRMFilterGroup } from '@/lib/crm-constants'

interface TrackedLink {
  placeholder: string
  url: string
  label?: string
  tracked?: boolean
}

interface ContactRow {
  hubspot_contact_id: string | null
  firstname: string | null
  phone: string | null
}

export interface RunOptions {
  campaignId: string
  /** Base URL absolue de l'app (ex https://rdv-agenda.vercel.app), sans trailing slash. */
  baseUrl: string
  /** Cookies a forwarder pour l'appel interne /api/crm/contacts (filter_groups). */
  cookies?: string
}

export interface RunResult {
  ok: boolean
  total_recipients: number
  valid: number
  sent: number
  failed: number
  skipped: number
  segments_used: number
  error?: string
}

function makeToken(): string {
  // 6 chars base64url ≈ 64^6 = 68 milliards de combinaisons. Suffisant pour
  // ~10^9 envois sans collision. Plus court = meilleure UX dans le SMS.
  return randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 6)
}

function renderMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)
}

function estimateSegments(text: string): number {
  const len = [...text].length
  if (len <= 70) return 1
  return Math.ceil(len / 67)
}

async function resolveContactsFromFilterGroups(
  baseUrl: string,
  cookies: string,
  filterGroups: CRMFilterGroup[],
  presetFlags: Record<string, unknown> | null,
): Promise<ContactRow[]> {
  const view = {
    id: 'sms-campaign',
    name: '',
    groups: filterGroups,
    presetFlags: (presetFlags ?? undefined) as
      | { noTelepro?: boolean; recentFormMonths?: number; recentFormDays?: number; createdBeforeDays?: number }
      | undefined,
  }
  const params = viewToParams(view)
  params.set('export', '1')
  const url = `${baseUrl.replace(/\/$/, '')}/api/crm/contacts?${params.toString()}`
  const res = await fetch(url, { headers: { cookie: cookies } })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`/api/crm/contacts a renvoye ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const data = (json.data ?? []) as Array<{ hubspot_contact_id: string; firstname: string | null; phone: string | null }>
  return data.map(c => ({
    hubspot_contact_id: c.hubspot_contact_id,
    firstname: c.firstname,
    phone: c.phone,
  }))
}

/**
 * Envoie une campagne SMS de bout en bout :
 *  1. Charge la campagne
 *  2. Resoud les destinataires (manual_phones / filter_groups / legacy)
 *  3. Insert sms_campaign_recipients en pending + recupere les ids
 *  4. Genere les tokens des liens trackes + insert sms_campaign_link_tokens
 *  5. Pour chaque destinataire : remplace placeholders, optionnellement
 *     shortene les URLs via SMS Factor, envoie le SMS, met a jour le statut
 *  6. Met a jour les stats agregees de la campagne
 */
export async function runSmsCampaign(opts: RunOptions): Promise<RunResult> {
  const { campaignId: id, baseUrl, cookies = '' } = opts
  const db = createServiceClient()

  // 1. Charge la campagne
  const { data: campaign, error: campErr } = await db.from('sms_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (campErr || !campaign) {
    return { ok: false, total_recipients: 0, valid: 0, sent: 0, failed: 0, skipped: 0, segments_used: 0, error: 'Campagne introuvable' }
  }
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return { ok: false, total_recipients: 0, valid: 0, sent: 0, failed: 0, skipped: 0, segments_used: 0, error: `Deja ${campaign.status}` }
  }

  // 2. Marque en cours d'envoi
  await db.from('sms_campaigns').update({ status: 'sending' }).eq('id', id)

  try {
    // 3. Resoud les destinataires
    let contacts: ContactRow[] = []
    const manualPhones: string[] = Array.isArray(campaign.manual_phones) ? campaign.manual_phones : []
    const manualIds: string[] = Array.isArray(campaign.manual_contact_ids) ? campaign.manual_contact_ids : []
    const filterGroups: CRMFilterGroup[] = Array.isArray(campaign.filter_groups) ? campaign.filter_groups : []

    if (manualPhones.length > 0) {
      contacts = manualPhones.map(p => ({ hubspot_contact_id: null, firstname: null, phone: p }))
    } else if (filterGroups.length > 0) {
      contacts = await resolveContactsFromFilterGroups(baseUrl, cookies, filterGroups, campaign.preset_flags ?? null)
    } else if (manualIds.length > 0) {
      const { data } = await db.from('crm_contacts')
        .select('hubspot_contact_id, firstname, phone')
        .in('hubspot_contact_id', manualIds)
      contacts = (data || []) as ContactRow[]
    } else if (campaign.filters && Object.keys(campaign.filters).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from('crm_contacts').select('hubspot_contact_id, firstname, phone')
      const f = campaign.filters as Record<string, string | string[]>
      if (f.classe_actuelle) q = q.eq('classe_actuelle', f.classe_actuelle)
      if (f.formation_souhaitee) q = q.eq('formation_souhaitee', f.formation_souhaitee)
      if (f.hubspot_owner_id) q = q.eq('hubspot_owner_id', f.hubspot_owner_id)
      if (f.zone_localite) q = q.eq('zone_localite', f.zone_localite)
      q = q.not('phone', 'is', null).limit(5000)
      const { data } = await q
      contacts = (data || []) as ContactRow[]
    }

    if (contacts.length === 0) {
      await db.from('sms_campaigns').update({ status: 'draft' }).eq('id', id)
      return { ok: false, total_recipients: 0, valid: 0, sent: 0, failed: 0, skipped: 0, segments_used: 0, error: 'Aucun destinataire' }
    }

    // 4. Validation phone + dedup + render template (firstname)
    const validRecipients: Array<{ contact: ContactRow; phone: string; rendered: string; segments: number }> = []
    const skipped: Array<{ contact: ContactRow; reason: string }> = []
    const seenPhones = new Set<string>()

    for (const c of contacts) {
      if (!c.phone) { skipped.push({ contact: c, reason: 'Pas de telephone' }); continue }
      const formatted = formatPhoneForSms(c.phone)
      if (!formatted) { skipped.push({ contact: c, reason: 'Numero invalide' }); continue }
      if (seenPhones.has(formatted)) { skipped.push({ contact: c, reason: 'Doublon' }); continue }
      seenPhones.add(formatted)
      const rendered = renderMessage(campaign.message, {
        firstname: c.firstname || '',
        prenom: c.firstname || '',
      })
      validRecipients.push({ contact: c, phone: formatted, rendered, segments: estimateSegments(rendered) })
    }

    // Insert pending + skipped, recupere les ids
    const pendingRows = validRecipients.map(r => ({
      campaign_id: id,
      hubspot_contact_id: r.contact.hubspot_contact_id,
      phone: r.phone,
      firstname: r.contact.firstname,
      rendered_message: r.rendered,
      segments_count: r.segments,
      status: 'pending',
    }))
    const skippedRows = skipped.map(s => ({
      campaign_id: id,
      hubspot_contact_id: s.contact.hubspot_contact_id,
      phone: s.contact.phone || '',
      firstname: s.contact.firstname,
      rendered_message: null,
      status: 'skipped',
      error_message: s.reason,
    }))

    const recipientIdByPhone = new Map<string, string>()
    if (pendingRows.length > 0) {
      const { data: insertedPending } = await db
        .from('sms_campaign_recipients')
        .insert(pendingRows)
        .select('id, phone')
      for (const row of insertedPending ?? []) {
        if (row.id && row.phone) recipientIdByPhone.set(row.phone as string, row.id as string)
      }
    }
    if (skippedRows.length > 0) {
      await db.from('sms_campaign_recipients').insert(skippedRows)
    }

    // 4-bis. Tokens des liens trackes
    const trackedLinks: TrackedLink[] = Array.isArray(campaign.tracked_links) ? campaign.tracked_links : []
    const urlByRecipientPhone = new Map<string, Record<string, string>>()
    const tokenInserts: Array<{
      token: string; campaign_id: string; recipient_id: string
      placeholder: string; label: string | null; original_url: string
    }> = []
    const baseClean = baseUrl.replace(/\/$/, '')
    const hasAnyTrackedLink = trackedLinks.some(l => l && l.placeholder && l.url && l.tracked !== false)

    if (trackedLinks.length > 0) {
      for (const r of validRecipients) {
        const recipientId = recipientIdByPhone.get(r.phone)
        const map: Record<string, string> = {}
        for (const link of trackedLinks) {
          if (!link?.placeholder || !link.url) continue
          if (link.tracked === false || !recipientId) {
            map[link.placeholder] = link.url
            continue
          }
          const token = makeToken()
          tokenInserts.push({
            token, campaign_id: id, recipient_id: recipientId,
            placeholder: link.placeholder, label: link.label ?? null, original_url: link.url,
          })
          map[link.placeholder] = `${baseClean}/r/${token}`
        }
        urlByRecipientPhone.set(r.phone, map)
      }
      if (tokenInserts.length > 0) {
        const BATCH = 500
        for (let i = 0; i < tokenInserts.length; i += BATCH) {
          await db.from('sms_campaign_link_tokens').insert(tokenInserts.slice(i, i + BATCH))
        }
      }
    }

    // 5. Envoi sequentiel (~10 SMS/sec)
    const pushtype: 'alert' | 'marketing' = campaign.campaign_type === 'marketing' ? 'marketing' : 'alert'
    // ATTENTION : ne PAS forcer shortenLinks pour les liens trackes. L'API
    // POST de SMS Factor ("send-shortened") renvoie "Erreur de donnees" sur
    // notre payload — le format des champs (value vs to, links vs short_link)
    // ne matche pas leurs specs. Tant que ce n'est pas debug, on envoie les
    // URLs /r/<token> telles quelles via GET /send (qui marche). Le user a
    // ~36 chars d'URL au lieu de ~17, c'est acceptable. Variable hasAnyTrackedLink
    // gardee pour l'instant si on veut re-activer plus tard apres fix.
    void hasAnyTrackedLink
    const shortenLinks = !!campaign.shorten_links

    let sentCount = 0
    let failedCount = 0
    let segmentsUsed = 0

    for (const r of validRecipients) {
      try {
        let textToSend = r.rendered
        const linkMap = urlByRecipientPhone.get(r.phone)
        if (linkMap) {
          for (const [placeholder, finalUrl] of Object.entries(linkMap)) {
            textToSend = textToSend.split(placeholder).join(finalUrl)
          }
        }

        let shortenLinksOpt: { urls: string[] } | undefined
        if (shortenLinks) {
          const urls = detectUrls(textToSend)
          if (urls.length > 0) {
            const transformed = replaceUrlsWithShortPlaceholder(textToSend)
            textToSend = transformed.text
            shortenLinksOpt = { urls: transformed.urls }
          }
        }

        const finalSegments = estimateSegments(textToSend)
        const recipientId = recipientIdByPhone.get(r.phone)
        if (recipientId) {
          await db.from('sms_campaign_recipients').update({
            rendered_message: textToSend,
            segments_count: finalSegments,
          }).eq('id', recipientId)
        }

        const result = await sendSms(r.phone, textToSend, {
          sender: campaign.sender,
          pushtype,
          shortenLinks: shortenLinksOpt,
        })

        if (result.ok) {
          sentCount++
          segmentsUsed += finalSegments
          await db.from('sms_campaign_recipients').update({
            status: 'sent',
            sms_factor_ticket: result.ticket || null,
            sent_at: new Date().toISOString(),
          }).eq('campaign_id', id).eq('phone', r.phone).eq('status', 'pending')
        } else {
          failedCount++
          await db.from('sms_campaign_recipients').update({
            status: 'failed',
            error_message: result.error || 'Erreur inconnue',
          }).eq('campaign_id', id).eq('phone', r.phone).eq('status', 'pending')
        }
      } catch (e) {
        failedCount++
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('sms-campaign-send', e, { campaign_id: id, phone: r.phone })
        await db.from('sms_campaign_recipients').update({
          status: 'failed',
          error_message: msg,
        }).eq('campaign_id', id).eq('phone', r.phone).eq('status', 'pending')
      }
      // Rate limit 10 SMS/sec
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 6. Met a jour la campagne
    await db.from('sms_campaigns').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      total_recipients: contacts.length,
      sent_count: sentCount,
      failed_count: failedCount,
      segments_used: segmentsUsed,
    }).eq('id', id)

    await logger.flush()

    return {
      ok: true,
      total_recipients: contacts.length,
      valid: validRecipients.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skipped.length,
      segments_used: segmentsUsed,
    }
  } catch (err) {
    logger.error('sms-campaign-send-fatal', err, { campaign_id: id })
    await db.from('sms_campaigns').update({ status: 'failed' }).eq('id', id)
    await logger.flush()
    return {
      ok: false, total_recipients: 0, valid: 0, sent: 0, failed: 0, skipped: 0, segments_used: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
