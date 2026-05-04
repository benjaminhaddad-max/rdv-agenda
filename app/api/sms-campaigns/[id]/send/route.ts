import { NextRequest, NextResponse } from 'next/server'
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

/**
 * POST /api/sms-campaigns/[id]/send
 *
 * Lance l'envoi d'une campagne SMS :
 * 1. Charge la campagne
 * 2. Résout les destinataires selon le mode :
 *    - manual_phones[]    → numéros bruts (CSV upload)
 *    - filter_groups[]    → appel interne /api/crm/contacts?export=1
 *    - manual_contact_ids → legacy, lookup direct crm_contacts
 *    - filters legacy     → legacy compat (classe_actuelle, formation_souhaitee...)
 * 3. Insère sms_campaign_recipients en pending
 * 4. Boucle d'envoi rate-limitée via lib/smsfactor.ts (sendSms)
 *    - pushtype = campaign.campaign_type ('alert' | 'marketing')
 *    - shorten_links = true → remplace URLs par <-short-> et bascule sur POST
 * 5. Update stats agrégées
 */

export const maxDuration = 300  // 5 min (plan Pro Vercel)

interface ContactRow {
  hubspot_contact_id: string | null
  firstname: string | null
  phone: string | null
}

function renderMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)
}

/** Compte les segments SMS facturés selon l'encoding UCS-2 (accents). */
function estimateSegments(text: string): number {
  // UCS-2 : 70 chars / segment, 67 / segment si concaténé
  const len = [...text].length
  if (len <= 70) return 1
  return Math.ceil(len / 67)
}

/** Construit l'URL absolue de l'API interne pour le fetch server-side. */
function getInternalApiUrl(req: NextRequest, path: string): string {
  // En prod : NEXT_PUBLIC_SITE_URL. En dev : déduit du host header.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (req.headers.get('host')
      ? `${req.headers.get('x-forwarded-proto') ?? 'http'}://${req.headers.get('host')}`
      : 'http://localhost:3000')
  return `${base.replace(/\/$/, '')}${path}`
}

/**
 * Résout les destinataires depuis filter_groups en appelant /api/crm/contacts?export=1.
 * Reproduit exactement les filtres utilisés par la page CRM.
 */
async function resolveContactsFromFilterGroups(
  req: NextRequest,
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
  const url = getInternalApiUrl(req, `/api/crm/contacts?${params.toString()}`)

  const res = await fetch(url, {
    headers: {
      // Forward cookie/auth si l'API en a besoin (notre /api/crm/contacts ne l'exige pas
      // mais on transmet par sécurité).
      cookie: req.headers.get('cookie') ?? '',
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`/api/crm/contacts a renvoyé ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const data = (json.data ?? []) as Array<{ hubspot_contact_id: string; firstname: string | null; phone: string | null }>
  return data.map(c => ({
    hubspot_contact_id: c.hubspot_contact_id,
    firstname: c.firstname,
    phone: c.phone,
  }))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = createServiceClient()

  // 1. Charge la campagne
  const { data: campaign, error: campErr } = await db.from('sms_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  }
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return NextResponse.json({ error: `Déjà ${campaign.status}` }, { status: 400 })
  }

  // 2. Marque la campagne en cours d'envoi
  await db.from('sms_campaigns').update({ status: 'sending' }).eq('id', id)

  try {
    // 3. Résout les destinataires
    let contacts: ContactRow[] = []

    const manualPhones: string[] = Array.isArray(campaign.manual_phones) ? campaign.manual_phones : []
    const manualIds: string[] = Array.isArray(campaign.manual_contact_ids) ? campaign.manual_contact_ids : []
    const filterGroups: CRMFilterGroup[] = Array.isArray(campaign.filter_groups) ? campaign.filter_groups : []

    if (manualPhones.length > 0) {
      // Ciblage par numéros bruts — pas de matching CRM
      contacts = manualPhones.map(p => ({
        hubspot_contact_id: null,
        firstname: null,
        phone: p,
      }))
    } else if (filterGroups.length > 0) {
      // Filtres CRM avancés via /api/crm/contacts
      contacts = await resolveContactsFromFilterGroups(req, filterGroups, campaign.preset_flags ?? null)
    } else if (manualIds.length > 0) {
      // Legacy : liste d'IDs HubSpot
      const { data } = await db.from('crm_contacts')
        .select('hubspot_contact_id, firstname, phone')
        .in('hubspot_contact_id', manualIds)
      contacts = (data || []) as ContactRow[]
    } else if (campaign.filters && Object.keys(campaign.filters).length > 0) {
      // Legacy : filtres simples (ancien format avant v23)
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
      return NextResponse.json({ error: 'Aucun destinataire' }, { status: 400 })
    }

    // 4. Validation phone + dédup + render message
    const validRecipients: Array<{ contact: ContactRow; phone: string; rendered: string; segments: number }> = []
    const skipped: Array<{ contact: ContactRow; reason: string }> = []
    const seenPhones = new Set<string>()

    for (const c of contacts) {
      if (!c.phone) {
        skipped.push({ contact: c, reason: 'Pas de téléphone' })
        continue
      }
      const formatted = formatPhoneForSms(c.phone)
      if (!formatted) {
        skipped.push({ contact: c, reason: 'Numéro invalide' })
        continue
      }
      if (seenPhones.has(formatted)) {
        skipped.push({ contact: c, reason: 'Doublon' })
        continue
      }
      seenPhones.add(formatted)
      const rendered = renderMessage(campaign.message, {
        firstname: c.firstname || '',
        prenom: c.firstname || '',
      })
      validRecipients.push({
        contact: c,
        phone: formatted,
        rendered,
        segments: estimateSegments(rendered),
      })
    }

    // Insert pending + skipped en bulk
    const recipientsRows = [
      ...validRecipients.map(r => ({
        campaign_id: id,
        hubspot_contact_id: r.contact.hubspot_contact_id,
        phone: r.phone,
        firstname: r.contact.firstname,
        rendered_message: r.rendered,
        segments_count: r.segments,
        status: 'pending',
      })),
      ...skipped.map(s => ({
        campaign_id: id,
        hubspot_contact_id: s.contact.hubspot_contact_id,
        phone: s.contact.phone || '',
        firstname: s.contact.firstname,
        rendered_message: null,
        status: 'skipped',
        error_message: s.reason,
      })),
    ]
    if (recipientsRows.length > 0) {
      await db.from('sms_campaign_recipients').insert(recipientsRows)
    }

    // 5. Envoi sequentiel (rate limit ~10 SMS/sec)
    const pushtype: 'alert' | 'marketing' = campaign.campaign_type === 'marketing' ? 'marketing' : 'alert'
    const shortenLinks = !!campaign.shorten_links

    let sentCount = 0
    let failedCount = 0
    let segmentsUsed = 0

    for (const r of validRecipients) {
      try {
        // Si raccourcissement activé et URLs détectées dans le rendu → bascule POST
        let textToSend = r.rendered
        let shortenLinksOpt: { urls: string[] } | undefined
        if (shortenLinks) {
          const urls = detectUrls(r.rendered)
          if (urls.length > 0) {
            const transformed = replaceUrlsWithShortPlaceholder(r.rendered)
            textToSend = transformed.text
            shortenLinksOpt = { urls: transformed.urls }
          }
        }

        const result = await sendSms(r.phone, textToSend, {
          sender: campaign.sender,
          pushtype,
          shortenLinks: shortenLinksOpt,
        })

        if (result.ok) {
          sentCount++
          segmentsUsed += r.segments
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
      // Rate limit doux : 10 SMS/sec max
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 6. Met à jour la campagne
    await db.from('sms_campaigns').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      total_recipients: contacts.length,
      sent_count: sentCount,
      failed_count: failedCount,
      segments_used: segmentsUsed,
    }).eq('id', id)

    await logger.flush()

    return NextResponse.json({
      ok: true,
      total_recipients: contacts.length,
      valid: validRecipients.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skipped.length,
      segments_used: segmentsUsed,
    })
  } catch (err) {
    logger.error('sms-campaign-send-fatal', err, { campaign_id: id })
    await db.from('sms_campaigns').update({ status: 'failed' }).eq('id', id)
    await logger.flush()
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
