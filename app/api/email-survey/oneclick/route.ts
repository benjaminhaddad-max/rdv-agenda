import { NextResponse } from 'next/server'
import { verifyFormContactToken } from '@/lib/form-contact-link'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

/**
 * GET /api/email-survey/oneclick?t=TOKEN&fac=...&strat=...
 * Réponses en 1 clic depuis l'e-mail (repli HTML).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('t')?.trim() || ''
  const fac = url.searchParams.get('fac')?.trim() || ''
  const strat = url.searchParams.get('strat')?.trim() || ''

  const payload = token === 'demo' ? null : verifyFormContactToken(token)
  if (!payload && token !== 'demo') {
    return htmlPage('Lien invalide ou expiré', false)
  }

  const cid = payload?.cid || 'demo'
  logger.info('email-survey-oneclick', 'réponse 1-clic', { cid, fac, strat })

  if (payload?.cid && (fac || strat)) {
    const db = createServiceClient()
    const custom: Record<string, string> = {}
    if (fac) custom.faculte_visee_email = fac
    if (strat) custom.strategie_prepa_email = strat

    const { data: row } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, hubspot_raw')
      .eq('hubspot_contact_id', payload.cid)
      .maybeSingle()

    if (row) {
      const raw = (row.hubspot_raw as Record<string, unknown>) || {}
      await db
        .from('crm_contacts')
        .update({
          hubspot_raw: { ...raw, ...custom },
          synced_at: new Date().toISOString(),
        })
        .eq('hubspot_contact_id', payload.cid)
    }
  }

  const label = fac || strat || 'réponse'
  return htmlPage(`Merci ! Votre choix « ${label} » a été enregistré.`, true)
}

function htmlPage(message: string, ok: boolean) {
  const color = ok ? '#137333' : '#c5221f'
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Merci</title></head>
<body style="font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f6f8fc">
<div style="background:#fff;padding:32px;border-radius:12px;text-align:center;max-width:400px">
<p style="font-size:18px;color:${color};margin:0">${message}</p>
</div></body></html>`
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
