'use client'

/**
 * « Écrire un mail » — lycée ou organisateur de forum. Le mail part de la
 * boîte de la marque (partenariat@diploma-sante.fr ou partenariat@afem-edu.fr)
 * avec la plaquette jointe ; le modèle choisi pré-remplit l'objet et le texte,
 * tout reste modifiable avant l'envoi. Les réponses reviennent dans la fiche.
 * Depuis un forum, l'IA rédige d'office un mail adapté à l'événement (date
 * sûre ou probable, type de forum, historique) et recommande la marque.
 */

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileText, Mail, Paperclip, Send, Sparkles, TriangleAlert } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Input, CrmV2Segmented, CrmV2Select, CrmV2Textarea, CrmV2Toggle, hexA } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { LYCEE_MODES, lookup, type LyceeContactRow, type LyceeMode } from '@/lib/lycees'
import {
  DEFAULT_MAILBOXES, MAIL_BRANDS, MAIL_PURPOSES, parseEmails, renderTemplate,
  type LyceeEmailTemplate, type MailPurpose, type TemplateContext,
} from '@/lib/lycee-mail-shared'
import type { LyceeMailDraft } from '@/lib/lycee-mail-ai'
import { api, fmtDate, parisTodayKey } from './ui'

/** Valeur du sélecteur de modèle pour le brouillon rédigé par l'IA */
const AI = '__ai'

export type ComposeTarget = {
  uai?: string | null
  eventId?: string | null
  /** Sous-titre (nom du lycée / du forum) */
  name: string
  mode?: LyceeMode | null
  purpose?: MailPurpose
  /** Réponse à un mail reçu (même fil Gmail) */
  replyTo?: { id: string; subject: string | null; from_email: string | null; from_name: string | null; mode: LyceeMode } | null
}

type Suggestion = { email: string; label: string; name: string | null }
type MailboxInfo = { mode: LyceeMode; mailbox: string; ok: boolean; error?: string }

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10)
}

export default function EmailComposeModal({ target, onClose, onSent }: {
  target: ComposeTarget
  onClose: () => void
  onSent: (message: string) => void
}) {
  const today = parisTodayKey()
  const reply = target.replyTo ?? null
  const [mode, setMode] = useState<LyceeMode>(reply?.mode ?? target.mode ?? 'diploma')
  const [templates, setTemplates] = useState<LyceeEmailTemplate[] | null>(null)
  const autoAi = !!target.eventId && !reply
  const [templateId, setTemplateId] = useState<string>(autoAi ? AI : '')
  const [aiDraft, setAiDraft] = useState<LyceeMailDraft | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [ctx, setCtx] = useState<TemplateContext>({})
  const [to, setTo] = useState(reply?.from_email ?? '')
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(reply ? (/^re\s*:/i.test(reply.subject || '') ? reply.subject! : `Re : ${reply.subject || ''}`) : '')
  const [body, setBody] = useState('')
  const [edited, setEdited] = useState(false)
  const [attach, setAttach] = useState(!reply)
  const [next, setNext] = useState(addDays(today, 7))
  const [mailboxes, setMailboxes] = useState<MailboxInfo[] | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missingMigration, setMissingMigration] = useState(false)

  // Modèles + destinataires possibles (contacts du lycée, standard, organisateur du forum)
  useEffect(() => {
    api<{ templates: LyceeEmailTemplate[] }>('/api/crm/lycees/email-templates')
      .then(d => setTemplates(d.templates))
      .catch(e => { setTemplates([]); if ((e as { missingMigration?: boolean }).missingMigration) setMissingMigration(true) })
    api<{ mailboxes: MailboxInfo[] }>('/api/crm/lycees/mailboxes').then(d => setMailboxes(d.mailboxes)).catch(() => setMailboxes([]))

    const load = async () => {
      const list: Suggestion[] = []
      const push = (email: string, label: string, name: string | null) => {
        for (const e of parseEmails(email)) if (!list.some(s => s.email === e)) list.push({ email: e, label, name })
      }
      const info: TemplateContext = {}
      let uai = target.uai ?? null
      if (target.eventId) {
        const d = await api<{ event: { date: string | null; title: string | null; organizer_contact: string | null; uai: string | null }; lycee: { name: string; city: string | null; email: string | null } | null }>(
          `/api/crm/lycees/events/${target.eventId}`)
        info.forumDate = d.event.date
        info.lycee = d.lycee?.name ?? d.event.title
        info.ville = d.lycee?.city ?? null
        if (d.event.organizer_contact) push(d.event.organizer_contact, 'Organisateur du forum', null)
        uai = uai ?? d.event.uai
      }
      if (uai) {
        const d = await api<{ lycee: { name: string; city: string | null; email: string | null; next_event?: { date: string | null } | null }; contacts: LyceeContactRow[] }>(`/api/crm/lycees/${uai}`)
        info.lycee = info.lycee ?? d.lycee.name
        info.ville = info.ville ?? d.lycee.city
        if (!target.eventId) info.forumDate = d.lycee.next_event?.date ?? null
        const contacts = [...d.contacts].filter(c => !c.is_alumni && c.email).sort((a, b) => Number(b.is_key) - Number(a.is_key))
        for (const c of contacts) push(c.email!, [c.name, c.role].filter(Boolean).join(' · ') || 'Contact', c.name)
        if (d.lycee.email) push(d.lycee.email, 'Mail du lycée (secrétariat)', null)
      }
      setSuggestions(list)
      setCtx(info)
      // Destinataire proposé : contact clé, sinon organisateur, sinon secrétariat
      if (!reply && list[0]) setTo(t => t || list[0].email)
    }
    load().catch(() => {}).finally(() => setLoaded(true))
  }, [target.uai, target.eventId, reply])

  const modeTemplates = useMemo(() => (templates ?? []).filter(t => t.mode === mode), [templates, mode])
  const chosen = modeTemplates.find(t => t.id === templateId) ?? null

  // Nom du contact pour « Bonjour X, » : seulement s'il n'y a qu'un destinataire connu nommé
  const toList = parseEmails(to)
  const contactName = toList.length === 1 ? suggestions.find(s => s.email === toList[0])?.name ?? null : null
  const fullCtx = useMemo(() => ({ ...ctx, contactName }), [ctx, contactName])

  // Premier modèle adapté (objectif demandé, sinon le premier de la marque)
  useEffect(() => {
    if (reply || !templates || templateId) return
    const t = modeTemplates.find(x => x.purpose === (target.purpose ?? (target.eventId ? 'forum' : 'conference'))) ?? modeTemplates[0]
    if (t) setTemplateId(t.id)
  }, [templates, modeTemplates, templateId, reply, target.purpose, target.eventId])

  // Tant que le texte n'a pas été retouché, il suit le modèle et le contexte
  useEffect(() => {
    if (edited) return
    if (chosen) {
      setSubject(renderTemplate(chosen.subject, fullCtx))
      setBody(renderTemplate(chosen.body, fullCtx))
      setAttach(chosen.attach_plaquette)
    } else if (reply) {
      setBody(`${fullCtx.contactName || reply.from_name ? `Bonjour ${fullCtx.contactName || reply.from_name},` : 'Bonjour,'}\n\n\n\nBien cordialement,`)
    }
  }, [chosen, fullCtx, edited, reply])

  // Brouillon IA adapté au lycée / à l'événement (m = marque imposée, sinon celle recommandée)
  const generate = async (m?: LyceeMode) => {
    setAiLoading(true)
    setAiError(null)
    setTemplateId(AI)
    try {
      const { draft } = await api<{ draft: LyceeMailDraft }>('/api/crm/lycees/emails/draft', {
        method: 'POST',
        json: { event_id: target.eventId ?? null, uai: target.uai ?? null, mode: m ?? null, contact_name: contactName, purpose: target.purpose ?? null },
      })
      setAiDraft(draft)
      setMode(draft.mode)
      setSubject(draft.subject)
      setBody(draft.body)
      setAttach(true)
      setEdited(false)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Erreur')
      if (!subject && !body) setTemplateId('')
    } finally {
      setAiLoading(false)
    }
  }

  // Depuis un forum : brouillon IA dès que les destinataires sont connus
  const [aiStarted, setAiStarted] = useState(false)
  useEffect(() => {
    if (!autoAi || !loaded || aiStarted) return
    setAiStarted(true)
    void generate(target.mode ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAi, loaded, aiStarted])

  const pickTemplate = (id: string) => {
    if (edited && !confirm('Remplacer ton texte par ce modèle ?')) return
    setEdited(false)
    if (id === AI) { void generate(mode); return }
    setTemplateId(id)
    if (!id) { setSubject(''); setBody('') }
  }

  const switchMode = (m: LyceeMode) => {
    if (m === mode) return
    if (edited && !confirm('Changer de marque remplace ton texte par un nouveau mail dans l’autre marque. Continuer ?')) return
    if (templateId === AI) { void generate(m); return }
    const purpose = chosen?.purpose
    setMode(m)
    setEdited(false)
    const t = (templates ?? []).filter(x => x.mode === m)
    setTemplateId((t.find(x => x.purpose === purpose) ?? t[0])?.id ?? '')
  }

  const toggleRecipient = (email: string) => {
    const list = parseEmails(to)
    setTo((list.includes(email) ? list.filter(e => e !== email) : [...list, email]).join(', '))
  }

  const brand = MAIL_BRANDS[mode]
  const box = mailboxes?.find(b => b.mode === mode)
  const fromAddress = box?.mailbox ?? DEFAULT_MAILBOXES[mode]
  const leftover = /\{\{\s*\w+\s*\}\}/.test(subject + body)

  const send = async () => {
    setError(null)
    if (!toList.length) { setError('Ajoute au moins un destinataire'); return }
    if (leftover) { setError('Il reste une variable {{…}} non remplacée dans le texte'); return }
    setSending(true)
    try {
      await api('/api/crm/lycees/emails', {
        method: 'POST',
        json: {
          mode, uai: target.uai ?? null, event_id: target.eventId ?? null, to: toList, cc: parseEmails(cc),
          subject, body, attach_plaquette: attach, template_id: chosen?.id ?? null, reply_to_id: reply?.id ?? null,
          next_action_at: next || null,
        },
      })
      onSent(`Mail envoyé depuis ${fromAddress} à ${toList.join(', ')}.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  const label = { fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 } as const

  return (
    <AdminModal
      open
      onClose={onClose}
      width={720}
      closeDisabled={sending}
      title={reply ? 'Répondre' : 'Écrire un mail'}
      subtitle={target.name}
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 12, color: crmV2.textMuted }}>
            {next ? `Relance prévue le ${fmtDate(next, { weekday: true })}` : 'Pas de relance prévue'}
          </span>
          <CrmV2Button onClick={onClose} disabled={sending}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" icon={<Send size={14} />} onClick={send} disabled={sending || aiLoading || missingMigration || !toList.length || !subject.trim() || !body.trim()}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {missingMigration && <AdminNotice tone="warning">La base n’est pas encore prête : il faut lancer la migration <b>supabase-migration-crm-v65-lycee-emails.sql</b> dans Supabase.</AdminNotice>}
        {error && <AdminNotice tone="error" onClose={() => setError(null)}>{error}</AdminNotice>}

        {!reply && (
          <div>
            <div style={label}>On écrit en tant que</div>
            <CrmV2Segmented size="sm" value={mode} onChange={switchMode} items={LYCEE_MODES.map(m => ({ id: m.id, label: m.label }))} />
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, fontSize: 12.5,
          background: hexA(brand.color, 0.06), border: `1px solid ${hexA(brand.color, 0.25)}`,
        }}>
          <Mail size={14} color={brand.color} />
          <span style={{ color: crmV2.textMuted }}>De</span>
          <b style={{ color: crmV2.text }}>{brand.senderName}</b>
          <span style={{ color: crmV2.textMuted }}>&lt;{fromAddress}&gt;</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: !box ? crmV2.textFaint : box.ok ? '#16a34a' : '#d13a41' }}>
            {!box ? '…' : box.ok ? <><CheckCircle2 size={13} /> Boîte connectée</> : <><TriangleAlert size={13} /> Boîte non connectée</>}
          </span>
        </div>
        {box && !box.ok && <AdminNotice tone="warning">{box.error} Un admin peut voir la marche à suivre dans Lycées → Mails → « Boîtes & modèles ».</AdminNotice>}

        {!reply && (
          <div>
            <div style={{ ...label, display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>Modèle</span>
              <button type="button" disabled={aiLoading} onClick={() => { if (!edited || confirm('Remplacer ton texte par un mail rédigé par l’IA ?')) void generate(mode) }} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#7e22ce', fontWeight: 800, fontSize: 12,
                cursor: aiLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}><Sparkles size={13} /> {templateId === AI && aiDraft ? 'Réécrire avec l’IA' : 'Rédiger avec l’IA'}</button>
            </div>
            <CrmV2Select value={templateId} onChange={e => pickTemplate(e.target.value)} style={{ width: '100%' }} disabled={aiLoading}>
              <option value={AI}>✨ Mail adapté par l’IA à ce {target.eventId ? 'forum' : 'lycée'}</option>
              <option value="">— Mail libre —</option>
              {MAIL_PURPOSES.map(p => {
                const list = modeTemplates.filter(t => t.purpose === p.id)
                return list.length ? (
                  <optgroup key={p.id} label={p.label}>
                    {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                ) : null
              })}
            </CrmV2Select>
          </div>
        )}

        {aiLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: hexA('#7e22ce', 0.06), border: `1px solid ${hexA('#7e22ce', 0.25)}`, fontSize: 12.5, color: '#7e22ce', fontWeight: 600 }}>
            <Sparkles size={14} /> L’IA rédige un mail adapté ({target.eventId ? 'type de forum, date sûre ou probable, source, historique' : 'historique du lycée, échanges passés'})… 10 à 20 secondes.
          </div>
        )}
        {aiError && <AdminNotice tone="warning" onClose={() => setAiError(null)}>{aiError} — choisis un modèle à la place.</AdminNotice>}
        {!aiLoading && templateId === AI && aiDraft && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: hexA('#7e22ce', 0.05), border: `1px solid ${hexA('#7e22ce', 0.2)}`, fontSize: 12.5, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: crmV2.text }}>
              <Sparkles size={14} color="#7e22ce" style={{ flexShrink: 0, marginTop: 2 }} />
              <span><b>Situation :</b> {aiDraft.situation}</span>
            </div>
            {aiDraft.recommended_mode !== mode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6, color: '#b45309' }}>
                <span style={{ flex: 1, minWidth: 220 }}><b>L’IA recommande plutôt {MAIL_BRANDS[aiDraft.recommended_mode].senderName}</b> — {aiDraft.mode_reason}</span>
                {!reply && <CrmV2Button size="sm" variant="gold" onClick={() => switchMode(aiDraft.recommended_mode)}>Rédiger en {aiDraft.recommended_mode === 'afem' ? 'AFEM' : 'Diploma Santé'}</CrmV2Button>}
              </div>
            ) : (
              <div style={{ marginTop: 4, color: crmV2.textMuted }}><b style={{ color: '#16a34a' }}>Marque recommandée : {MAIL_BRANDS[aiDraft.recommended_mode].senderName}</b> — {aiDraft.mode_reason}</div>
            )}
            <div style={{ marginTop: 4, color: crmV2.textFaint, fontSize: 11.5 }}>Brouillon : relis-le et ajuste avant d’envoyer.</div>
          </div>
        )}

        <div>
          <div style={{ ...label, display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1 }}>À</span>
            {!showCc && <button type="button" onClick={() => setShowCc(true)} style={{ background: 'none', border: 'none', color: crmV2.link, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Cc</button>}
          </div>
          <CrmV2Input value={to} onChange={e => setTo(e.target.value)} placeholder="cpe@lycee.fr, proviseur@lycee.fr" style={{ width: '100%' }} />
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {suggestions.map(s => {
                const on = toList.includes(s.email)
                return (
                  <button key={s.email} type="button" onClick={() => toggleRecipient(s.email)} title={s.email} style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: on ? 700 : 500,
                    border: `1px solid ${on ? crmV2.goldBorder : crmV2.border}`, background: on ? crmV2.goldSoft : crmV2.bg, color: on ? crmV2.goldDark : crmV2.text,
                  }}>{on ? '✓ ' : '+ '}{s.label} <span style={{ color: crmV2.textFaint }}>{s.email}</span></button>
                )
              })}
            </div>
          )}
          {!suggestions.length && <div style={{ fontSize: 11.5, color: crmV2.textFaint, marginTop: 4 }}>Aucun mail connu pour ce lycée : saisis l’adresse donnée au téléphone (pense à l’ajouter aux contacts).</div>}
        </div>
        {showCc && (
          <div>
            <div style={label}>Cc</div>
            <CrmV2Input value={cc} onChange={e => setCc(e.target.value)} placeholder="adresse en copie" style={{ width: '100%' }} />
          </div>
        )}

        <div>
          <div style={label}>Objet</div>
          <CrmV2Input value={subject} onChange={e => { setSubject(e.target.value); setEdited(true) }} style={{ width: '100%' }} />
        </div>

        <div>
          <div style={label}>Message</div>
          <CrmV2Textarea value={body} onChange={e => { setBody(e.target.value); setEdited(true) }} rows={16} style={{ width: '100%', lineHeight: 1.55, opacity: aiLoading ? 0.5 : 1 }}
            disabled={aiLoading} placeholder={aiLoading ? 'Rédaction en cours…' : undefined} />
          <div style={{ fontSize: 11.5, color: crmV2.textFaint, marginTop: 4 }}>
            Ta signature ({brand.team}, {fromAddress}, {brand.websiteLabel}) et le logo sont ajoutés automatiquement en bas du mail.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <CrmV2Toggle checked={attach} onChange={setAttach} label="Joindre la plaquette" />
          <a href={`/plaquettes/${brand.plaquette.file}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>
            {attach ? <Paperclip size={13} /> : <FileText size={13} />} {brand.plaquette.filename}
          </a>
        </div>

        <div>
          <div style={label}>Relance si pas de réponse</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ l: '+3 j', d: 3 }, { l: '+1 sem.', d: 7 }, { l: '+2 sem.', d: 14 }].map(x => (
              <CrmV2Button key={x.l} size="sm" variant={next === addDays(today, x.d) ? 'gold' : 'secondary'} onClick={() => setNext(addDays(today, x.d))}>{x.l}</CrmV2Button>
            ))}
            <CrmV2Input type="date" value={next} onChange={e => setNext(e.target.value)} style={{ width: 160 }} />
            <CrmV2Button size="sm" variant={!next ? 'gold' : 'ghost'} onClick={() => setNext('')}>Aucune</CrmV2Button>
          </div>
        </div>
        {lookup(LYCEE_MODES, target.mode ?? null) && target.mode !== mode && !reply && (
          <div style={{ fontSize: 12, color: '#b8963e' }}>Attention : ce lycée est noté en mode {lookup(LYCEE_MODES, target.mode ?? null)?.label}.</div>
        )}
      </div>
    </AdminModal>
  )
}
