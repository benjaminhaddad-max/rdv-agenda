'use client'

/** Modèles de mails Edumove : liste, édition, aperçu avec un candidat fictif. */

import { useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { CrmV2Button, CrmV2Card, CrmV2Field, CrmV2Input, CrmV2Textarea } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { EDUMOVE_MAIL_VARIABLES, renderEdumoveMail, type EdumoveMailTemplate } from '@/lib/edumove-mail-shared'

const EXEMPLE = {
  prenom: 'léa', nom: 'Martin',
  uni_selections: { UCJC: {}, UE: {} },
  documents: { UCJC_identite: true, UE_bulletins: true },
}

export default function EdumoveModelesTab({ templates, custom, onSaved }: {
  templates: EdumoveMailTemplate[]
  custom: boolean
  onSaved: (t: EdumoveMailTemplate[], custom: boolean) => void
}) {
  const [list, setList] = useState<EdumoveMailTemplate[]>(templates)
  const [sel, setSel] = useState(templates[0]?.id ?? '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const cur = list.find(t => t.id === sel) ?? list[0]
  const edit = (patch: Partial<EdumoveMailTemplate>) => {
    setList(l => l.map(t => (t.id === cur.id ? { ...t, ...patch } : t)))
    setDirty(true); setMsg(null)
  }
  const add = () => {
    const id = `m${Date.now().toString(36)}`
    setList(l => [...l, { id, name: 'Nouveau modèle', usage: '', subject: '', body: 'Bonjour {{prenom}},\n\n\n\nL’équipe Edumove' }])
    setSel(id); setDirty(true)
  }
  const remove = () => {
    if (!cur || !window.confirm(`Supprimer le modèle « ${cur.name} » ?`)) return
    const next = list.filter(t => t.id !== cur.id)
    setList(next); setSel(next[0]?.id ?? ''); setDirty(true)
  }
  const save = async (templatesToSave: EdumoveMailTemplate[]) => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/crm/edumove/templates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templates: templatesToSave }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j?.error || 'Enregistrement impossible'); return }
      setList(j.templates); setDirty(false); setMsg('Enregistré.')
      if (!j.templates.some((t: EdumoveMailTemplate) => t.id === sel)) setSel(j.templates[0]?.id ?? '')
      onSaved(j.templates, !!j.custom)
    } finally { setSaving(false) }
  }
  const preview = cur ? renderEdumoveMail(cur.subject, cur.body, EXEMPLE) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <CrmV2Card style={{ padding: 8 }}>
        {list.map(t => (
          <button key={t.id} type="button" onClick={() => setSel(t.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', border: 'none',
            borderRadius: 8, padding: '9px 10px', background: t.id === cur?.id ? crmV2.goldSoft : 'transparent', color: crmV2.text,
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</div>
            {t.usage && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, lineHeight: 1.35 }}>{t.usage}</div>}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 6, padding: 6, borderTop: `1px solid ${crmV2.borderLight}`, marginTop: 6, flexWrap: 'wrap' }}>
          <CrmV2Button size="sm" icon={<Plus size={13} />} onClick={add}>Nouveau</CrmV2Button>
          {custom && (
            <CrmV2Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} disabled={saving}
              onClick={() => { if (window.confirm('Revenir aux modèles d’origine ? Vos modifications seront perdues.')) void save([]) }}>
              Modèles d’origine
            </CrmV2Button>
          )}
        </div>
      </CrmV2Card>

      {cur ? (
        <CrmV2Card style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CrmV2Field label="Nom du modèle"><CrmV2Input value={cur.name} onChange={e => edit({ name: e.target.value })} maxLength={80} /></CrmV2Field>
              <CrmV2Field label="Quand l’utiliser"><CrmV2Input value={cur.usage} onChange={e => edit({ usage: e.target.value })} maxLength={200} /></CrmV2Field>
              <CrmV2Field label="Objet"><CrmV2Input value={cur.subject} onChange={e => edit({ subject: e.target.value })} maxLength={200} /></CrmV2Field>
              <CrmV2Field label="Message">
                <CrmV2Textarea value={cur.body} onChange={e => edit({ body: e.target.value })} rows={14} style={{ fontFamily: 'inherit', lineHeight: 1.5 }} />
              </CrmV2Field>
              <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.6 }}>
                Variables : {EDUMOVE_MAIL_VARIABLES.map(v => <code key={v.key} style={{ marginRight: 6 }}>{`{{${v.key}}}`}</code>)}
                <br />Une ligne vide = un nouveau paragraphe. Les liens https deviennent cliquables.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <CrmV2Button variant="primary" icon={<Save size={14} />} disabled={!dirty || saving} onClick={() => void save(list)}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </CrmV2Button>
                <CrmV2Button variant="ghost" icon={<Trash2 size={14} />} onClick={remove}>Supprimer</CrmV2Button>
                {msg && <span style={{ fontSize: 13, color: msg === 'Enregistré.' ? '#047857' : '#b91c1c' }}>{msg}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: crmV2.textMuted }}>Aperçu (candidate fictive : Léa, UCJC + UE, pièces partielles)</div>
              <div style={{ fontSize: 13, fontWeight: 700, padding: '8px 10px', borderRadius: 8, background: crmV2.bgHover }}>{preview?.subject || '(objet vide)'}</div>
              <iframe title="Aperçu du modèle" srcDoc={preview?.html ?? ''} sandbox=""
                style={{ width: '100%', height: 460, border: `1px solid ${crmV2.border}`, borderRadius: 10, background: '#f6f7fb' }} />
            </div>
          </div>
        </CrmV2Card>
      ) : (
        <CrmV2Card style={{ padding: 18, fontSize: 14, color: crmV2.textMuted }}>Aucun modèle.</CrmV2Card>
      )}
    </div>
  )
}
