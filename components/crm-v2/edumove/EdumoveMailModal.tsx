'use client'

/**
 * Envoi d'un mail Edumove à un ou plusieurs candidats : modèle → objet et
 * texte modifiables → aperçu réel (variables remplacées) → envoi.
 */

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { AdminModal } from '@/components/crm-v2/admin/AdminUi'
import { CrmV2Button, CrmV2Field, CrmV2Input, CrmV2Select, CrmV2Textarea } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { EDUMOVE_MAIL_VARIABLES, renderEdumoveMail, type EdumoveMailTemplate } from '@/lib/edumove-mail-shared'
import { fullName, type DossierLite } from './types'

const MAX = 300

export default function EdumoveMailModal({ targets, templates, initialTemplateId, onClose, onSent }: {
  targets: DossierLite[]
  templates: EdumoveMailTemplate[]
  initialTemplateId?: string
  onClose: () => void
  onSent: () => void
}) {
  const withEmail = useMemo(() => targets.filter(t => t.email && t.email.includes('@')).slice(0, MAX), [targets])
  const first = templates.find(t => t.id === initialTemplateId) ?? templates[0]
  const [templateId, setTemplateId] = useState(first?.id ?? '')
  const [subject, setSubject] = useState(first?.subject ?? '')
  const [body, setBody] = useState(first?.body ?? '')
  const [alsoInChat, setAlsoInChat] = useState(true)
  const [idx, setIdx] = useState(0)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const pick = (id: string) => {
    const t = templates.find(x => x.id === id)
    setTemplateId(id)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }
  const insertVar = (key: string) => {
    const el = bodyRef.current
    const token = `{{${key}}}`
    if (!el) { setBody(b => b + token); return }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length })
  }

  const target = withEmail[Math.min(idx, withEmail.length - 1)]
  const preview = target ? renderEdumoveMail(subject, body, target) : null
  const n = withEmail.length
  const unresolved = /\{\{\s*[a-z_]+\s*\}\}/.test(preview ? preview.subject + preview.text : '')

  const send = async () => {
    if (!n || !subject.trim() || !body.trim()) return
    if (n > 1 && !window.confirm(`Envoyer ce mail à ${n} candidats ?`)) return
    setSending(true); setError(null)
    try {
      const r = await fetch('/api/crm/edumove/mail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: withEmail.map(t => t.candidature_id), subject, body, templateId, alsoInChat }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j?.error || 'Envoi impossible'); return }
      setResult(j)
      onSent()
    } finally { setSending(false) }
  }

  if (result) {
    return (
      <AdminModal open onClose={onClose} title="Envoi terminé" footer={<CrmV2Button variant="primary" onClick={onClose}>Fermer</CrmV2Button>}>
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          <div><strong>{result.sent}</strong> mail{result.sent > 1 ? 's' : ''} envoyé{result.sent > 1 ? 's' : ''}, tracé{result.sent > 1 ? 's' : ''} sur la fiche de chaque contact.</div>
          {result.failed > 0 && <div style={{ color: '#b91c1c' }}>{result.failed} en échec.</div>}
          {result.skipped > 0 && <div style={{ color: crmV2.textMuted }}>{result.skipped} ignoré{result.skipped > 1 ? 's' : ''} (sans e-mail ou en double).</div>}
          {result.errors.map(e => <div key={e} style={{ fontSize: 12, color: '#b91c1c' }}>{e}</div>)}
        </div>
      </AdminModal>
    )
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      closeDisabled={sending}
      width={980}
      title={n === 1 ? `Mail à ${fullName(withEmail[0])}` : `Mail à ${n} candidats`}
      subtitle={`De contact@edumove.fr · réponses vers admissions@edumove.fr${targets.length > n ? ` · ${targets.length - n} sans e-mail ou au-delà de ${MAX}, ignorés` : ''}`}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: crmV2.textMuted, flex: 1 }}>
            <input type="checkbox" checked={alsoInChat} onChange={e => setAlsoInChat(e.target.checked)} />
            Le mettre aussi dans sa messagerie Edumove (espace et appli)
          </label>
          {error && <span style={{ fontSize: 13, color: '#b91c1c' }}>{error}</span>}
          <CrmV2Button onClick={onClose} disabled={sending}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" icon={<Send size={14} />} onClick={() => void send()} disabled={sending || !n || !subject.trim() || !body.trim()}>
            {sending ? 'Envoi…' : n === 1 ? 'Envoyer' : `Envoyer à ${n}`}
          </CrmV2Button>
        </div>
      }
    >
      {n === 0 ? (
        <div style={{ fontSize: 14, color: crmV2.textMuted }}>Aucun de ces candidats n’a d’adresse e-mail.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CrmV2Field label="Modèle">
              <CrmV2Select value={templateId} onChange={e => pick(e.target.value)}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </CrmV2Select>
            </CrmV2Field>
            {templates.find(t => t.id === templateId)?.usage && (
              <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: -6 }}>{templates.find(t => t.id === templateId)?.usage}</div>
            )}
            <CrmV2Field label="Objet">
              <CrmV2Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} />
            </CrmV2Field>
            <CrmV2Field label="Message">
              <CrmV2Textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={14} style={{ fontFamily: 'inherit', lineHeight: 1.5 }} />
            </CrmV2Field>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: crmV2.textMuted }}>Insérer :</span>
              {EDUMOVE_MAIL_VARIABLES.map(v => (
                <button key={v.key} type="button" onClick={() => insertVar(v.key)} style={{
                  fontSize: 11.5, padding: '3px 8px', borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
                  color: crmV2.text, cursor: 'pointer', fontFamily: 'inherit',
                }}>{v.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted }}>
              <span style={{ flex: 1 }}>Aperçu pour <strong style={{ color: crmV2.text }}>{fullName(target)}</strong>{n > 1 ? ` (${idx + 1}/${n})` : ''}</span>
              {n > 1 && (
                <>
                  <CrmV2Button size="sm" variant="ghost" icon={<ChevronLeft size={13} />} aria-label="Précédent" onClick={() => setIdx(i => (i - 1 + n) % n)} />
                  <CrmV2Button size="sm" variant="ghost" icon={<ChevronRight size={13} />} aria-label="Suivant" onClick={() => setIdx(i => (i + 1) % n)} />
                </>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, padding: '8px 10px', borderRadius: 8, background: crmV2.bgHover }}>{preview?.subject || '(objet vide)'}</div>
            {unresolved && <div style={{ fontSize: 12, color: '#b45309' }}>Une variable n’est pas reconnue : vérifiez les {'{{…}}'}.</div>}
            <iframe title="Aperçu du mail" srcDoc={preview?.html ?? ''} sandbox=""
              style={{ width: '100%', height: 440, border: `1px solid ${crmV2.border}`, borderRadius: 10, background: '#f6f7fb' }} />
          </div>
        </div>
      )}
    </AdminModal>
  )
}
