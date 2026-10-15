import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBrevoEmail } from '@/lib/brevo'
import { logger } from '@/lib/logger'

/**
 * Alerte mail quand les tokens Facebook des pages Meta Lead Ads ne marchent plus
 * (session invalidée après changement de mot de passe, app retirée, expiration…).
 * Sans ça, les leads s'arrêtent silencieusement : incident du 14/10/2026, 8 h
 * sans lead avant que quelqu'un s'en rende compte.
 *
 * Appelé par le cron meta-leads-poll (toutes les 15 min). État anti-spam dans
 * crm_settings (clé meta_token_alert) :
 * — mail « coupé » dès qu'une page casse, puis rappel toutes les 12 h ;
 * — mail « rétabli » quand tout remarche ;
 * — mail « expire bientôt » (1×/24 h) si l'accès aux données expire sous 7 jours.
 */

const GRAPH = 'https://graph.facebook.com/v22.0'
const SETTING_KEY = 'meta_token_alert'
const ALERT_RECIPIENTS = [{ email: 'aaron@diploma-sante.fr', name: 'Aaron' }]
const RECONNECT_URL = 'https://hub.diploma-sante.fr/admin/crm-v2/meta-ads'
const REMIND_EVERY_MS = 12 * 60 * 60 * 1000
const EXPIRING_WARN_MS = 7 * 24 * 60 * 60 * 1000
const EXPIRING_REMIND_MS = 24 * 60 * 60 * 1000

type PageRow = { page_id: string; page_name?: string | null; access_token: string }

type TokenCheck =
  | { page_id: string; name: string; state: 'ok'; dataAccessExpiresAt: number | null }
  | { page_id: string; name: string; state: 'invalid'; reason: string }
  | { page_id: string; name: string; state: 'unknown' }

type AlertState = {
  broken: string[]
  alerted_at: string | null
  expiring_alerted_at: string | null
}

async function checkPageToken(page: PageRow): Promise<TokenCheck> {
  const name = page.page_name || page.page_id
  try {
    const t = encodeURIComponent(page.access_token)
    const res = await fetch(`${GRAPH}/debug_token?input_token=${t}&access_token=${t}`)
    const j = await res.json() as {
      data?: { is_valid?: boolean; data_access_expires_at?: number; error?: { message?: string } }
      error?: { code?: number; message?: string }
    }
    // 190 = token invalide/expiré ; 102 = session invalide
    if (j.error) {
      if (j.error.code === 190 || j.error.code === 102) {
        return { page_id: page.page_id, name, state: 'invalid', reason: j.error.message || 'token invalide' }
      }
      return { page_id: page.page_id, name, state: 'unknown' }
    }
    if (j.data?.is_valid === false) {
      return { page_id: page.page_id, name, state: 'invalid', reason: j.data.error?.message || 'token invalide' }
    }
    const exp = j.data?.data_access_expires_at
    return { page_id: page.page_id, name, state: 'ok', dataAccessExpiresAt: exp ? exp * 1000 : null }
  } catch {
    // Panne réseau / Graph indisponible : on ne conclut rien
    return { page_id: page.page_id, name, state: 'unknown' }
  }
}

async function loadState(db: SupabaseClient): Promise<AlertState> {
  const { data } = await db.from('crm_settings').select('value').eq('key', SETTING_KEY).maybeSingle()
  const v = (data?.value ?? {}) as Partial<AlertState>
  return {
    broken: Array.isArray(v.broken) ? v.broken.map(String) : [],
    alerted_at: typeof v.alerted_at === 'string' ? v.alerted_at : null,
    expiring_alerted_at: typeof v.expiring_alerted_at === 'string' ? v.expiring_alerted_at : null,
  }
}

async function saveState(db: SupabaseClient, state: AlertState): Promise<void> {
  await db.from('crm_settings').upsert({
    key: SETTING_KEY,
    value: state,
    description: 'État des alertes mail « token Facebook expiré » (Meta Lead Ads)',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
}

function wrapHtml(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">
<h2 style="font-size:18px;margin:0 0 12px">${title}</h2>${body}
<p style="margin-top:20px"><a href="${RECONNECT_URL}" style="background:#1e293b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir Meta Lead Ads</a></p>
</div>`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function checkMetaTokensAndAlert(db: SupabaseClient, pages: PageRow[]) {
  const checks = await Promise.all(pages.map(checkPageToken))
  const invalid = checks.filter((c): c is Extract<TokenCheck, { state: 'invalid' }> => c.state === 'invalid')
  const state = await loadState(db)
  const now = Date.now()
  let mailed: 'broken' | 'restored' | 'expiring' | null = null

  const brokenNames = invalid.map(c => c.name).sort()
  const changed = brokenNames.join('|') !== [...state.broken].sort().join('|')

  try {
    if (invalid.length > 0) {
      const due = changed || !state.alerted_at || now - new Date(state.alerted_at).getTime() >= REMIND_EVERY_MS
      if (due) {
        const list = invalid.map(c => `<li><b>${esc(c.name)}</b> — ${esc(c.reason)}</li>`).join('')
        await sendBrevoEmail({
          to: ALERT_RECIPIENTS,
          subject: `[Meta Lead Ads] Connexion Facebook coupée — les leads n'arrivent plus (${invalid.length} page${invalid.length > 1 ? 's' : ''})`,
          htmlContent: wrapHtml('Les leads Facebook n’arrivent plus dans le CRM', `
<p>Le CRM n’a plus accès à ces pages Facebook :</p><ul>${list}</ul>
<p><b>À faire :</b> ouvre Meta Lead Ads et clique « Connecter un formulaire » pour reconnecter Facebook (coche bien toutes les pages).</p>
<p>Les leads reçus pendant la coupure restent chez Facebook (90 jours) : ils pourront être rattrapés après la reconnexion.</p>`),
          textContent: `Le CRM n'a plus accès aux pages Facebook : ${brokenNames.join(', ')}. Reconnecte Facebook depuis ${RECONNECT_URL} (« Connecter un formulaire »).`,
          tags: ['meta-token-alert'],
        })
        state.alerted_at = new Date().toISOString()
        mailed = 'broken'
      }
      state.broken = brokenNames
    } else if (state.broken.length > 0 && checks.every(c => c.state === 'ok')) {
      await sendBrevoEmail({
        to: ALERT_RECIPIENTS,
        subject: '[Meta Lead Ads] Connexion Facebook rétablie',
        htmlContent: wrapHtml('Connexion Facebook rétablie', `
<p>Toutes les pages Facebook répondent de nouveau (${checks.map(c => esc(c.name)).join(', ')}).</p>
<p>Pense à rattraper les leads de la période de coupure.</p>`),
        textContent: 'Toutes les pages Facebook répondent de nouveau. Pense à rattraper les leads de la période de coupure.',
        tags: ['meta-token-alert'],
      })
      state.broken = []
      state.alerted_at = null
      mailed = 'restored'
    }

    // Accès aux données qui expire bientôt (Facebook l'impose ~tous les 90 jours)
    if (invalid.length === 0) {
      const expiries = checks
        .map(c => (c.state === 'ok' ? c.dataAccessExpiresAt : null))
        .filter((x): x is number => typeof x === 'number' && x > 0)
      const soonest = expiries.length ? Math.min(...expiries) : null
      const expDue = !state.expiring_alerted_at || now - new Date(state.expiring_alerted_at).getTime() >= EXPIRING_REMIND_MS
      if (soonest && soonest - now < EXPIRING_WARN_MS && expDue) {
        const when = new Date(soonest).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' })
        await sendBrevoEmail({
          to: ALERT_RECIPIENTS,
          subject: `[Meta Lead Ads] La connexion Facebook expire le ${when}`,
          htmlContent: wrapHtml('La connexion Facebook va bientôt expirer', `
<p>Facebook coupera l’accès du CRM aux leads le <b>${esc(when)}</b>.</p>
<p>Pour éviter la coupure, ouvre Meta Lead Ads et clique « Connecter un formulaire » avant cette date.</p>`),
          textContent: `Facebook coupera l'accès du CRM aux leads le ${when}. Reconnecte-toi avant depuis ${RECONNECT_URL}.`,
          tags: ['meta-token-alert'],
        })
        state.expiring_alerted_at = new Date().toISOString()
        mailed = mailed ?? 'expiring'
      }
    }
  } catch (e) {
    logger.error('meta-token-alert-mail', e)
  }

  await saveState(db, state)
  return {
    invalid: brokenNames,
    unknown: checks.filter(c => c.state === 'unknown').map(c => c.name),
    mailed,
  }
}
