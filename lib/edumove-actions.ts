/**
 * Actions sur les dossiers de la plateforme candidature.edumove.fr, depuis le
 * CRM (remplace le back-office admin.html d'Edumove). Écrit directement dans
 * la base Edumove (clé service), puis rafraîchit la copie CRM.
 *
 * Mêmes écritures que l'ancien back-office (statut + historique, situation,
 * suivi par fac, archivage, pièces, messages), avec les notifications envoyées
 * par le CRM (Brevo, expéditeur Edumove ; SMS Factor, expéditeur « Edumove »).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { edumoveDb, refreshEdumoveMirror, type Row } from '@/lib/edumove-sync'
import {
  EDUMOVE_FAC_NAMES, EDUMOVE_MANUAL_STATUSES, EDUMOVE_SITUATIONS, EDUMOVE_TRACKING_BY_UNI, EDUMOVE_UNIS, EDUMOVE_UPLOADABLE_DOCS,
} from '@/lib/edumove-stage'

export { EDUMOVE_FAC_NAMES, EDUMOVE_TRACKING_BY_UNI }
import { sendBrevoEmail } from '@/lib/brevo'
import { sendSms } from '@/lib/smsfactor'
import { logger } from '@/lib/logger'
import { edumoveEmailLayout as emailLayout } from '@/lib/edumove-mail-shared'

export const EDUMOVE_SITE_URL = (process.env.EDUMOVE_SITE_URL || 'https://candidature.edumove.fr').replace(/\/+$/, '')
const SENDER = { email: 'contact@edumove.fr', name: 'Edumove Admissions' }
const REPLY_TO = { email: 'admissions@edumove.fr', name: 'Edumove Admissions' }

/** Contacts des facs partenaires (ex-api/notify-fac-message.js d'Edumove). */
export const EDUMOVE_FAC_EMAILS: Record<string, string[]> = {
  LINK: ['d.elfadli@unilink.it'],
  UE: ['jessica.simi@universidadeuropea.es'],
  UCJC: ['eva.munoza@ucjc.edu', 'antonio.carrera@ucjc.edu'],
}
export class EdumoveActionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const firstName = (p: unknown) => {
  const v = String(p ?? '').trim()
  return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : 'Candidat'
}

async function safeNotify(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return true } catch (e) { logger.error(`edumove-notify:${label}`, e); return false }
}

async function loadCandidature(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from('candidatures').select('*').eq('id', id).maybeSingle()
  if (error) throw new EdumoveActionError(`Lecture du dossier impossible : ${error.message}`, 502)
  if (!data) throw new EdumoveActionError('Dossier introuvable', 404)
  return data as Row
}

const history = (c: Row) => (Array.isArray(c.status_history) ? (c.status_history as unknown[]) : [])

async function update(db: SupabaseClient, id: string, patch: Row): Promise<Row> {
  const { data, error } = await db.from('candidatures').update(patch).eq('id', id).select('*').maybeSingle()
  if (error) throw new EdumoveActionError(`Écriture impossible : ${error.message}`, 502)
  return (data ?? {}) as Row
}

// ── Notifications ────────────────────────────────────────────────────

async function notifyReponse(c: Row): Promise<{ email: boolean; sms: boolean }> {
  const prenom = firstName(c.prenom)
  const email = c.email ? await safeNotify('reponse-email', () => sendBrevoEmail({
    sender: SENDER, replyTo: REPLY_TO, to: [{ email: String(c.email) }],
    subject: `${prenom}, votre réponse Edumove est disponible`,
    htmlContent: emailLayout(`Bonjour ${prenom},`,
      `<p style="line-height:1.6">Votre réponse Edumove est disponible dans votre espace candidat : les facs auxquelles vous pouvez prétendre, les tests et les pièces à fournir.</p>`,
      { label: 'Voir ma réponse', url: `${EDUMOVE_SITE_URL}/espace.html` }),
    tags: ['edumove:reponse'],
  })) : false
  const sms = c.tel ? await safeNotify('reponse-sms', async () => {
    const r = await sendSms(String(c.tel), `Bonjour ${prenom}, votre réponse Edumove est disponible ! Connectez-vous à votre espace candidat : ${EDUMOVE_SITE_URL}`, { sender: 'Edumove', pushtype: 'alert' })
    if (!r.ok) throw new Error(r.error || 'SMS refusé')
  }) : false
  return { email, sms }
}

async function notifyStudentMessage(c: Row, content: string): Promise<{ email: boolean; sms: boolean }> {
  const prenom = firstName(c.prenom)
  const preview = content.length > 120 ? `${content.slice(0, 120)}…` : content
  const email = c.email ? await safeNotify('chat-email', () => sendBrevoEmail({
    sender: SENDER, replyTo: REPLY_TO, to: [{ email: String(c.email) }],
    subject: `💬 Nouveau message de l'équipe Edumove`,
    htmlContent: emailLayout(`Bonjour ${prenom},`,
      `<p style="line-height:1.6">Vous avez reçu un nouveau message de l'équipe Edumove :</p>
<div style="background:#f3f4f6;border-radius:8px;padding:12px 14px;line-height:1.5;white-space:pre-wrap">${esc(preview)}</div>`,
      { label: 'Répondre dans mon espace', url: `${EDUMOVE_SITE_URL}/espace.html` }),
    tags: ['edumove:chat'],
  })) : false
  const sms = c.tel ? await safeNotify('chat-sms', async () => {
    const r = await sendSms(String(c.tel), `Bonjour ${prenom}, vous avez un nouveau message de l'équipe Edumove sur votre espace : ${EDUMOVE_SITE_URL}/espace.html`, { sender: 'Edumove', pushtype: 'alert' })
    if (!r.ok) throw new Error(r.error || 'SMS refusé')
  }) : false
  return { email, sms }
}

/**
 * Push sur le téléphone du candidat (appli Edumove Lab), en plus du mail et du
 * SMS. Actif seulement si EDUMOVE_NOTIFY_SECRET est posé (même valeur sur le
 * projet Vercel du Lab) ; sinon rien n'est envoyé.
 */
async function pushAppliEdumove(email: unknown, texte: string): Promise<boolean> {
  const secret = process.env.EDUMOVE_NOTIFY_SECRET
  if (!secret || !email) return false
  const base = (process.env.EDUMOVE_LAB_URL || 'https://edumovelab.vercel.app').replace(/\/+$/, '')
  return safeNotify('push-appli', async () => {
    const r = await fetch(`${base}/api/edumove/notifier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-edumove-secret': secret },
      body: JSON.stringify({ email: String(email), texte: texte.length > 140 ? `${texte.slice(0, 140)}…` : texte }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`notifier ${r.status}`)
  })
}

export async function notifyFac(facKey: string, studentName: string | null, content: string, facLink: string | null) {
  const to = (EDUMOVE_FAC_EMAILS[facKey] ?? []).map(email => ({ email }))
  if (!to.length) return false
  return safeNotify('fac-email', () => sendBrevoEmail({
    sender: SENDER, replyTo: REPLY_TO, to,
    subject: studentName ? `Nouveau message Edumove — ${studentName}` : 'Nouveau message Edumove',
    htmlContent: emailLayout(`${EDUMOVE_FAC_NAMES[facKey] ?? facKey}`,
      `<p style="line-height:1.6">Edumove vous a envoyé un message${studentName ? ` au sujet de <strong>${esc(studentName)}</strong>` : ''} :</p>
<div style="background:#f3f4f6;border-radius:8px;padding:12px 14px;line-height:1.5;white-space:pre-wrap">${esc(content)}</div>`,
      facLink ? { label: 'Voir mes candidats', url: facLink } : undefined),
    tags: ['edumove:fac'],
  }))
}

export async function notifyAdmissionsFromFac(facKey: string, studentName: string | null, content: string) {
  return safeNotify('fac-to-admissions', () => sendBrevoEmail({
    sender: SENDER, to: [REPLY_TO],
    subject: studentName ? `Réponse ${EDUMOVE_FAC_NAMES[facKey] ?? facKey} — ${studentName}` : `Nouveau message de ${EDUMOVE_FAC_NAMES[facKey] ?? facKey}`,
    htmlContent: emailLayout(`Message de ${EDUMOVE_FAC_NAMES[facKey] ?? facKey}`,
      `<div style="background:#f3f4f6;border-radius:8px;padding:12px 14px;line-height:1.5;white-space:pre-wrap">${esc(content)}</div>`,
      { label: 'Ouvrir le CRM', url: 'https://hub.diploma-sante.fr/admin/crm-v2/edumove' }),
    tags: ['edumove:fac'],
  }))
}

// ── Actions ──────────────────────────────────────────────────────────

export type EdumoveAction =
  | { type: 'status'; status: string; notify?: boolean }
  | { type: 'situation'; situation: string }
  | { type: 'tracking'; uni: string; value: string }
  | { type: 'archive' }
  | { type: 'restore' }
  | { type: 'message'; content: string; notify?: boolean }
  | { type: 'fac_message'; uni: string; content: string; facLink?: string | null }

export type EdumoveActionResult = { ok: true; notified?: { email: boolean; sms: boolean } | boolean }

export async function runEdumoveAction(crm: SupabaseClient, candidatureId: string, action: EdumoveAction, actor: string): Promise<EdumoveActionResult> {
  const db = edumoveDb()
  const c = await loadCandidature(db, candidatureId)
  const now = new Date().toISOString()
  let updated: Row | null = null
  let notified: EdumoveActionResult['notified']

  switch (action.type) {
    case 'status': {
      if (!(EDUMOVE_MANUAL_STATUSES as readonly string[]).includes(action.status)) throw new EdumoveActionError('Statut non autorisé')
      if (action.status === c.status) return { ok: true }
      const patch: Row = {
        status: action.status,
        manual_override: true,
        status_history: [...history(c), { status: action.status, at: now, by: actor }],
      }
      if (action.status === 'reponse_edumove') patch.auto_response_generated_at = now
      updated = await update(db, candidatureId, patch)
      if (action.status === 'reponse_edumove' && action.notify) {
        notified = await notifyReponse(c)
        if (notified.email || notified.sms) await update(db, candidatureId, { sms_reponse_sent: true })
      }
      break
    }
    case 'situation': {
      if (!(EDUMOVE_SITUATIONS as readonly string[]).includes(action.situation)) throw new EdumoveActionError('Situation inconnue')
      updated = await update(db, candidatureId, { situation_actuelle: action.situation })
      break
    }
    case 'tracking': {
      const allowed = EDUMOVE_TRACKING_BY_UNI[action.uni]
      if (!allowed || !allowed.includes(action.value)) throw new EdumoveActionError('Suivi inconnu pour cette fac')
      const tracking = { ...((c.uni_tracking as Row | null) ?? {}), [`${action.uni}_status`]: action.value }
      const patch: Row = { uni_tracking: tracking }
      // Inscrit dans une fac → dossier accepté (comme l'ancien back-office), avec historique
      if (action.value === 'inscrit' && c.status !== 'accepte') {
        patch.status = 'accepte'
        patch.status_history = [...history(c), { status: 'accepte', at: now, by: actor, note: `inscrit ${action.uni}` }]
      }
      updated = await update(db, candidatureId, patch)
      break
    }
    case 'archive': {
      if (c.status === 'archive') return { ok: true }
      updated = await update(db, candidatureId, {
        status: 'archive',
        previous_status: c.status || 'en_cours',
        status_history: [...history(c), { status: 'archive', at: now, by: actor }],
      })
      break
    }
    case 'restore': {
      if (c.status !== 'archive') return { ok: true }
      const target = String(c.previous_status || 'reponse_edumove')
      updated = await update(db, candidatureId, {
        status: target,
        previous_status: null,
        status_history: [...history(c), { status: target, at: now, by: actor, note: 'restauré' }],
      })
      break
    }
    case 'message': {
      const content = String(action.content || '').trim()
      if (!content) throw new EdumoveActionError('Message vide')
      if (content.length > 5000) throw new EdumoveActionError('Message trop long')
      const { error } = await db.from('messages').insert({
        candidature_id: candidatureId, sender_id: actor, sender_role: 'super_admin',
        sender_name: 'Équipe EDUMOVE', content, channel: 'edumove',
      })
      if (error) throw new EdumoveActionError(`Envoi impossible : ${error.message}`, 502)
      if (action.notify !== false) {
        notified = await notifyStudentMessage(c, content)
        await pushAppliEdumove(c.email, content)
      }
      break
    }
    case 'fac_message': {
      const content = String(action.content || '').trim()
      if (!EDUMOVE_UNIS.some(u => u.key === action.uni)) throw new EdumoveActionError('Fac inconnue')
      if (!content) throw new EdumoveActionError('Message vide')
      if (content.length > 5000) throw new EdumoveActionError('Message trop long')
      const { error } = await db.from('fac_messages').insert({
        fac_key: action.uni, candidature_id: candidatureId, sender_role: 'super_admin', sender_email: actor, content,
      })
      if (error) throw new EdumoveActionError(`Envoi impossible : ${error.message}`, 502)
      const studentName = [c.prenom, c.nom].filter(Boolean).join(' ') || null
      notified = await notifyFac(action.uni, studentName, content, action.facLink ?? null)
      break
    }
    default:
      throw new EdumoveActionError('Action inconnue')
  }

  if (updated && Object.keys(updated).length) await refreshEdumoveMirror(crm, updated)
  return { ok: true, ...(notified !== undefined ? { notified } : {}) }
}

/** Dépôt d'une pièce par l'équipe (stockage Edumove, bucket candidature-docs). */
export async function uploadEdumoveDocument(crm: SupabaseClient, candidatureId: string, docKey: string, file: File): Promise<void> {
  if (!(EDUMOVE_UPLOADABLE_DOCS as readonly string[]).includes(docKey)) throw new EdumoveActionError('Type de pièce inconnu')
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const types: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }
  if (!types[ext]) throw new EdumoveActionError('Formats acceptés : PDF, JPG, PNG')
  if (file.size > 15 * 1024 * 1024) throw new EdumoveActionError('Fichier trop lourd (15 Mo max)')
  const db = edumoveDb()
  await loadCandidature(db, candidatureId)
  const path = `candidatures/${candidatureId}/${docKey}_${Date.now()}.${ext}`
  const { error: upErr } = await db.storage.from('candidature-docs').upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: types[ext], upsert: false,
  })
  if (upErr) throw new EdumoveActionError(`Dépôt impossible : ${upErr.message}`, 502)
  const url = db.storage.from('candidature-docs').getPublicUrl(path).data.publicUrl
  // Relecture juste avant d'écrire : ne pas écraser une pièce envoyée entre-temps par l'étudiant
  const fresh = await loadCandidature(db, candidatureId)
  const documents = { ...((fresh.documents as Row | null) ?? {}), [docKey]: url }
  const updated = await update(db, candidatureId, { documents })
  await refreshEdumoveMirror(crm, updated)
}

/** Messages du dossier : chat avec l'étudiant + échanges avec chaque fac. */
export async function loadEdumoveConversation(candidatureId: string) {
  const db = edumoveDb()
  const [msgs, fac] = await Promise.all([
    db.from('messages').select('id, sender_role, sender_name, content, channel, created_at').eq('candidature_id', candidatureId).order('created_at', { ascending: true }).limit(500),
    db.from('fac_messages').select('id, fac_key, sender_role, sender_email, content, created_at').eq('candidature_id', candidatureId).order('created_at', { ascending: true }).limit(500),
  ])
  return {
    messages: msgs.data ?? [],
    fac_messages: fac.data ?? [],
  }
}
