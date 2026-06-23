/**
 * Reprise campagne SMS : envoie tous les "pending" en un seul appel campagne SMS Factor.
 * Usage: bun scripts/resume-sms-campaign.mjs <campaign_id>
 */
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const src = readFileSync('.env.local', 'utf8')
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 0) continue
      const key = line.slice(0, i).trim()
      let val = line.slice(i + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  } catch { /* ignore */ }
}

loadEnvLocal()

const campaignId = process.argv[2]
if (!campaignId) {
  console.error('Usage: bun scripts/resume-sms-campaign.mjs <campaign_id>')
  process.exit(1)
}

function finalizeMessage(rendered, campaign) {
  let text = String(rendered || campaign.message || '')
  const links = Array.isArray(campaign.tracked_links) ? campaign.tracked_links : []
  for (const link of links) {
    if (link?.placeholder && link?.url) {
      text = text.split(link.placeholder).join(link.url)
    }
  }
  if (campaign.campaign_type === 'marketing' && !/STOP\s/i.test(text)) {
    text = text.replace(/\s+$/, '') + '\nSTOP 36035'
  }
  return text
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { sendSmsCampaignBulk } = await import('../lib/smsfactor.ts')

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  const { data: campaign, error: campErr } = await db
    .from('sms_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()
  if (campErr || !campaign) throw new Error(campErr?.message || 'Campagne introuvable')

  const PAGE = 1000
  let totalSubmitted = 0
  const sampleText = finalizeMessage('', campaign)

  while (true) {
    const { data: pending, error } = await db
      .from('sms_campaign_recipients')
      .select('id, phone, rendered_message')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('id', { ascending: true })
      .limit(PAGE)
    if (error) throw new Error(error.message)
    if (!pending?.length) break

    const text = finalizeMessage(pending[0].rendered_message, campaign)
    if (text !== sampleText && totalSubmitted === 0) {
      const allSame = pending.every(r => finalizeMessage(r.rendered_message, campaign) === text)
      if (!allSame) throw new Error('Messages differents par destinataire — bulk impossible')
    }

    console.log(`[resume-bulk] Lot ${Math.floor(totalSubmitted / PAGE) + 1} : ${pending.length} nums`)
    const result = await sendSmsCampaignBulk(
      pending.map(r => ({ phone: r.phone, gsmsmsid: r.id })),
      text,
      { sender: campaign.sender || 'Edumove', pushtype: 'alert' },
    )
    if (!result.ok) throw new Error(result.error || 'bulk failed')

    const now = new Date().toISOString()
    const segments = Math.ceil([...text].length / 67) || 4
    const ids = pending.map(r => r.id)
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const { error: upErr } = await db.from('sms_campaign_recipients').update({
        status: 'sent',
        rendered_message: text,
        segments_count: segments,
        sms_factor_ticket: result.ticket || null,
        sent_at: now,
        error_message: null,
      }).in('id', chunk)
      if (upErr) throw new Error(upErr.message)
    }

    totalSubmitted += pending.length
    console.log(`[resume-bulk] ticket ${result.ticket} — SF sent ${result.sent}/${result.total}`)
    if (pending.length < PAGE) break
  }

  if (totalSubmitted === 0) {
    console.log('[resume-bulk] Aucun destinataire pending')
    return
  }

  const now = new Date().toISOString()
  const finalText = finalizeMessage('', campaign)
  const segments = Math.ceil([...finalText].length / 67) || 4

  const { count: sentTotal } = await db
    .from('sms_campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')
  const { count: failedTotal } = await db
    .from('sms_campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')

  await db.from('sms_campaigns').update({
    status: 'sent',
    sent_at: now,
    sent_count: sentTotal ?? 0,
    failed_count: failedTotal ?? 0,
    total_recipients: (sentTotal ?? 0) + (failedTotal ?? 0),
    segments_used: (sentTotal ?? 0) * segments,
    updated_at: now,
  }).eq('id', campaignId)

  console.log(JSON.stringify({ ok: true, submitted: totalSubmitted, sent_total: sentTotal }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
