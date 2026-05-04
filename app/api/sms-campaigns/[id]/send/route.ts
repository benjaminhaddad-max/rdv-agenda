import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, formatPhoneForSms } from '@/lib/smsfactor'
import { logger } from '@/lib/logger'

/**
 * POST /api/sms-campaigns/[id]/send
 *
 * Lance l'envoi d'une campagne SMS :
 * 1. Charge les destinataires (filtres + manual_contact_ids)
 * 2. Insère un sms_campaign_recipients par destinataire (status=pending)
 * 3. Envoie en boucle (rate-limited) via lib/smsfactor.ts
 * 4. Met à jour status + ticket sur chaque recipient
 * 5. Met à jour les stats agrégées sur la campagne
 *
 * Vercel timeout 60s → on traite en synchrone jusqu'à 800-1500 SMS par run.
 * Pour plus, il faudrait paginer en chunks (à faire si besoin).
 */

export const maxDuration = 300  // 5 min (plan Pro Vercel)

interface ContactRow {
  hubspot_contact_id: string
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

export async function POST(
  _req: NextRequest,
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
    // MVP : on prend manual_contact_ids OU on charge tous les contacts qui matchent
    // les filtres de base (à étendre quand on aura besoin de filtres avancés).
    let contacts: ContactRow[] = []

    if (campaign.manual_contact_ids && campaign.manual_contact_ids.length > 0) {
      const { data } = await db.from('crm_contacts')
        .select('hubspot_contact_id, firstname, phone')
        .in('hubspot_contact_id', campaign.manual_contact_ids)
      contacts = (data || []) as ContactRow[]
    } else if (campaign.filters && Object.keys(campaign.filters).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from('crm_contacts').select('hubspot_contact_id, firstname, phone')
      // Filtres simples supportés au MVP (à étendre si besoin)
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

    // 4. Insère les recipients en pending
    const validRecipients: Array<{ contact: ContactRow; phone: string; rendered: string; segments: number }> = []
    const skipped: Array<{ contact: ContactRow; reason: string }> = []

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

    // 5. Envoie en boucle (sequentially pour rester sous le rate limit SMS Factor ~10/sec)
    let sentCount = 0
    let failedCount = 0
    let segmentsUsed = 0

    for (const r of validRecipients) {
      try {
        const result = await sendSms(r.phone, r.rendered, campaign.sender)
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
