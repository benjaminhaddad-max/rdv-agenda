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
  sendSmsCampaignBulk,
  formatPhoneForSms,
  detectUrls,
  replaceUrlsWithShortPlaceholder,
} from '@/lib/smsfactor'
import { resolveSegmentIds, resolveContactsFromFilterGroups } from '@/lib/segment-recipients'
import {
  enrichContactsForHermione,
  isHermioneOrientationUrl,
  resolveTrackedLinkDestination,
} from '@/lib/hermione-orientation-link'
import { logger } from '@/lib/logger'
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
  lastname: string | null
  email: string | null
  phone: string | null
  departement: string | null
  classe_actuelle: string | null
}

const CRM_SMS_CONTACT_COLUMNS =
  'hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle'

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

function buildFinalCampaignSmsText(
  rendered: string,
  linkMap: Record<string, string> | undefined,
  isMarketing: boolean,
): string {
  let textToSend = rendered
  if (linkMap) {
    for (const [placeholder, finalUrl] of Object.entries(linkMap)) {
      textToSend = textToSend.split(placeholder).join(finalUrl)
    }
  }
  if (isMarketing) {
    textToSend = textToSend.replace(/\s+$/, '') + '\nSTOP 36035'
  }
  return textToSend
}

function estimateSegments(text: string): number {
  const len = [...text].length
  if (len <= 70) return 1
  return Math.ceil(len / 67)
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
    const segmentIds: string[] = Array.isArray(campaign.segment_ids) ? campaign.segment_ids.filter(Boolean) : []
    const filterGroups: CRMFilterGroup[] = Array.isArray(campaign.filter_groups) ? campaign.filter_groups : []

    if (manualPhones.length > 0) {
      contacts = manualPhones.map(p => ({
        hubspot_contact_id: null,
        firstname: null,
        lastname: null,
        email: null,
        phone: p,
        departement: null,
        classe_actuelle: null,
      }))
    } else if (segmentIds.length > 0) {
      const resolved = await resolveSegmentIds(db, segmentIds, { channel: 'sms', baseUrl, cookies })
      contacts = resolved.map(c => ({
        hubspot_contact_id: c.contact_id,
        firstname: c.first_name,
        lastname: c.last_name,
        email: c.email,
        phone: c.phone,
        departement: null,
        classe_actuelle: null,
      }))
    } else if (filterGroups.length > 0) {
      const rows = await resolveContactsFromFilterGroups(baseUrl, cookies, filterGroups, campaign.preset_flags ?? null)
      contacts = rows.map(c => ({
        hubspot_contact_id: c.hubspot_contact_id,
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        phone: c.phone,
        departement: null,
        classe_actuelle: null,
      }))
    } else if (manualIds.length > 0) {
      const { data } = await db.from('crm_contacts')
        .select(CRM_SMS_CONTACT_COLUMNS)
        .in('hubspot_contact_id', manualIds)
      contacts = (data || []) as ContactRow[]
    } else if (campaign.filters && Object.keys(campaign.filters).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from('crm_contacts').select(CRM_SMS_CONTACT_COLUMNS)
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

    const trackedLinks: TrackedLink[] = Array.isArray(campaign.tracked_links) ? campaign.tracked_links : []
    const needsHermioneEnrich = trackedLinks.some(l => l?.url && isHermioneOrientationUrl(l.url))
    if (needsHermioneEnrich) {
      contacts = await enrichContactsForHermione(db, contacts)
      if (!process.env.HERMIONE_LINK_SECRET) {
        logger.warn('sms-campaign-send', 'HERMIONE_LINK_SECRET manquant — liens Hermione non signés', { campaign_id: id })
      }
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
          const originalUrl = resolveTrackedLinkDestination(link.url, r.contact)
          tokenInserts.push({
            token, campaign_id: id, recipient_id: recipientId,
            placeholder: link.placeholder, label: link.label ?? null, original_url: originalUrl,
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
    // pushtype envoye a SMS Factor : pour les campagnes marketing on
    // bascule en 'alert' au moment de l'envoi car on ajoute la mention
    // STOP nous-memes en fin de texte (avec un \n force pour que ce
    // soit a la ligne). Si on laissait pushtype='marketing', SMS Factor
    // re-appendait son propre " STOP <code>" colle a notre URL —
    // ingerable car ils trim les whitespace finaux.
    // La fenetre legale marketing 8h-20h L-S reste respectee : c'est le
    // cron sms-campaigns-scheduled qui la verifie sur campaign.campaign_type.
    const isMarketing = campaign.campaign_type === 'marketing'
    const pushtype: 'alert' | 'marketing' = 'alert'
    const shortenLinks = !!campaign.shorten_links || hasAnyTrackedLink

    let sentCount = 0
    let failedCount = 0
    let segmentsUsed = 0

    const prepared = validRecipients.map(r => {
      const linkMap = urlByRecipientPhone.get(r.phone)
      const textToSend = buildFinalCampaignSmsText(r.rendered, linkMap, isMarketing)
      return {
        phone: r.phone,
        contact: r.contact,
        textToSend,
        recipientId: recipientIdByPhone.get(r.phone),
      }
    })

    const canBulkSend =
      prepared.length > 0 &&
      prepared.every(p => p.textToSend === prepared[0].textToSend)

    if (canBulkSend) {
      let textToSend = prepared[0].textToSend
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
      const nowIso = new Date().toISOString()

      for (const p of prepared) {
        if (p.recipientId) {
          await db.from('sms_campaign_recipients').update({
            rendered_message: textToSend,
            segments_count: finalSegments,
          }).eq('id', p.recipientId)
        }
      }

      const bulkResult = await sendSmsCampaignBulk(
        prepared.map(p => ({
          phone: p.phone,
          gsmsmsid: p.recipientId ?? undefined,
        })),
        textToSend,
        {
          sender: campaign.sender,
          pushtype,
          shortenLinks: shortenLinksOpt,
        },
      )

      if (bulkResult.ok) {
        sentCount = bulkResult.sent ?? prepared.length
        segmentsUsed = sentCount * finalSegments
        const nowIso = new Date().toISOString()
        const ids = prepared.map(p => p.recipientId).filter(Boolean) as string[]
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100)
          await db.from('sms_campaign_recipients').update({
            status: 'sent',
            sms_factor_ticket: bulkResult.ticket || null,
            sent_at: nowIso,
          }).in('id', chunk)
        }
        if (bulkResult.invalid) failedCount += bulkResult.invalid
      } else {
        failedCount = prepared.length
        await db.from('sms_campaign_recipients').update({
          status: 'failed',
          error_message: bulkResult.error || 'Erreur campagne bulk',
        }).eq('campaign_id', id).eq('status', 'pending')
      }
    } else {
      for (const p of prepared) {
        try {
          let textToSend = p.textToSend
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
          if (p.recipientId) {
            await db.from('sms_campaign_recipients').update({
              rendered_message: textToSend,
              segments_count: finalSegments,
            }).eq('id', p.recipientId)
          }

          const result = await sendSms(p.phone, textToSend, {
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
            }).eq('campaign_id', id).eq('phone', p.phone).eq('status', 'pending')
          } else {
            failedCount++
            await db.from('sms_campaign_recipients').update({
              status: 'failed',
              error_message: result.error || 'Erreur inconnue',
            }).eq('campaign_id', id).eq('phone', p.phone).eq('status', 'pending')
          }
        } catch (e) {
          failedCount++
          const msg = e instanceof Error ? e.message : String(e)
          logger.error('sms-campaign-send', e, { campaign_id: id, phone: p.phone })
          await db.from('sms_campaign_recipients').update({
            status: 'failed',
            error_message: msg,
          }).eq('campaign_id', id).eq('phone', p.phone).eq('status', 'pending')
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
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
