/**
 * Mails Edumove depuis le CRM : modèles (crm_settings, clé edumove_mail_templates,
 * sinon modèles par défaut) et envoi à un ou plusieurs candidats.
 *
 * Expéditeur contact@edumove.fr, réponses vers admissions@edumove.fr. Chaque
 * envoi est tracé sur la fiche du contact (crm_activities) ; en option, le
 * message est aussi posté dans la messagerie du candidat (espace + appli).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBrevoEmail } from '@/lib/brevo'
import { edumoveDb, edumoveDbConfigured } from '@/lib/edumove-sync'
import { EDUMOVE_DEFAULT_TEMPLATES, renderEdumoveMail, type EdumoveMailTemplate } from '@/lib/edumove-mail-shared'

export const EDUMOVE_TEMPLATES_SETTING = 'edumove_mail_templates'
const SENDER = { email: 'contact@edumove.fr', name: 'Edumove Admissions' }
const REPLY_TO = { email: 'admissions@edumove.fr', name: 'Edumove Admissions' }
export const EDUMOVE_MAIL_MAX_BATCH = 300

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export function sanitizeTemplates(input: unknown): EdumoveMailTemplate[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: EdumoveMailTemplate[] = []
  for (const t of input.slice(0, 60)) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    const id = clean(r.id, 60).replace(/[^a-z0-9_-]/gi, '') || `m${out.length}`
    if (seen.has(id)) continue
    seen.add(id)
    const name = clean(r.name, 80).trim()
    if (!name) continue
    out.push({ id, name, usage: clean(r.usage, 200), subject: clean(r.subject, 200), body: clean(r.body, 8000) })
  }
  return out
}

export async function getEdumoveTemplates(crm: SupabaseClient): Promise<{ templates: EdumoveMailTemplate[]; custom: boolean }> {
  const { data } = await crm.from('crm_settings').select('value').eq('key', EDUMOVE_TEMPLATES_SETTING).maybeSingle()
  const saved = sanitizeTemplates(data?.value)
  return saved.length ? { templates: saved, custom: true } : { templates: EDUMOVE_DEFAULT_TEMPLATES, custom: false }
}

export async function saveEdumoveTemplates(crm: SupabaseClient, templates: unknown): Promise<EdumoveMailTemplate[]> {
  const list = sanitizeTemplates(templates)
  if (!list.length) {
    // Liste vide = retour aux modèles par défaut
    await crm.from('crm_settings').delete().eq('key', EDUMOVE_TEMPLATES_SETTING)
    return EDUMOVE_DEFAULT_TEMPLATES
  }
  const { error } = await crm.from('crm_settings').upsert({
    key: EDUMOVE_TEMPLATES_SETTING, value: list, description: 'Modèles de mails Edumove (onglet Edumove du CRM)', updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  return list
}

type MirrorRow = {
  candidature_id: string
  hubspot_contact_id: string | null
  email: string | null
  prenom: string | null
  nom: string | null
  uni_selections: Record<string, unknown> | null
  documents: Record<string, unknown> | null
}

export type EdumoveMailResult = { sent: number; failed: number; skipped: number; errors: string[] }

export async function sendEdumoveMails(crm: SupabaseClient, opts: {
  ids: string[]
  subject: string
  body: string
  templateId?: string | null
  alsoInChat?: boolean
  actor: { email: string; ownerId: string | null }
}): Promise<EdumoveMailResult> {
  const ids = [...new Set(opts.ids.map(String))].slice(0, EDUMOVE_MAIL_MAX_BATCH)
  const { data, error } = await crm
    .from('crm_edumove_candidatures')
    .select('candidature_id, hubspot_contact_id, email, prenom, nom, uni_selections, documents')
    .in('candidature_id', ids)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as MirrorRow[]

  const result: EdumoveMailResult = { sent: 0, failed: 0, skipped: 0, errors: [] }
  const seenEmails = new Set<string>()
  const queue = rows.filter(r => {
    const e = String(r.email || '').trim().toLowerCase()
    if (!e || !e.includes('@') || seenEmails.has(e)) { result.skipped++; return false }
    seenEmails.add(e)
    return true
  })
  result.skipped += ids.length - rows.length
  const chat = opts.alsoInChat && edumoveDbConfigured() ? edumoveDb() : null

  const one = async (r: MirrorRow) => {
    const mail = renderEdumoveMail(opts.subject, opts.body, r)
    let err: string | null = null
    let messageId: string | null = null
    try {
      const res = await sendBrevoEmail({
        sender: SENDER, replyTo: REPLY_TO, to: [{ email: String(r.email).trim() }],
        subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
        tags: ['edumove:crm', ...(opts.templateId ? [`edumove:${opts.templateId}`] : [])],
      })
      messageId = (res as { messageId?: string } | null)?.messageId ?? null
    } catch (e) {
      err = e instanceof Error ? e.message : String(e)
    }
    if (err) { result.failed++; if (result.errors.length < 5) result.errors.push(`${r.email} : ${err}`) }
    else result.sent++

    // Messagerie du candidat (espace + appli), seulement pour un vrai dossier
    if (!err && chat && /^[0-9a-f-]{36}$/i.test(r.candidature_id)) {
      await chat.from('messages').insert({
        candidature_id: r.candidature_id, sender_id: opts.actor.email, sender_role: 'super_admin',
        sender_name: 'Équipe EDUMOVE', content: mail.text.trim(), channel: 'edumove',
      })
    }
    if (r.hubspot_contact_id) {
      await crm.from('crm_activities').insert({
        activity_type: 'email', hubspot_contact_id: r.hubspot_contact_id,
        subject: mail.subject, body: mail.html, direction: 'OUTGOING', status: err ? 'FAILED' : 'SENT',
        owner_id: opts.actor.ownerId,
        metadata: { source: 'edumove', sent_via: 'brevo', sender: SENDER.email, brevo_message_id: messageId, template_id: opts.templateId ?? null, candidature_id: r.candidature_id, error: err },
        occurred_at: new Date().toISOString(),
      })
    }
  }

  // 4 envois en parallèle : rapide sans brusquer Brevo
  for (let i = 0; i < queue.length; i += 4) await Promise.all(queue.slice(i, i + 4).map(one))
  return result
}
