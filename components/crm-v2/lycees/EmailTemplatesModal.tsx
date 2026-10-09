'use client'

/**
 * « Boîtes & modèles » (admins) : état des deux boîtes partenariat (accès
 * Gmail, dernière relève, marche à suivre pour les connecter) et édition des
 * modèles de mail Diploma Santé / AFEM.
 */

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Copy, Plus, TriangleAlert } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Input, CrmV2Segmented, CrmV2Select, CrmV2Spinner, CrmV2Textarea, CrmV2Toggle, hexA } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { LYCEE_MODES, type LyceeMode } from '@/lib/lycees'
import { MAIL_BRANDS, MAIL_PURPOSES, TEMPLATE_VARIABLES, type LyceeEmailTemplate, type MailPurpose } from '@/lib/lycee-mail-shared'
import { api, fmtDateTime } from './ui'

type MailboxesResponse = {
  configured: boolean
  mailboxes: { mode: LyceeMode; mailbox: string; ok: boolean; error?: string; last_synced_at: string | null; last_error: string | null }[]
  setup: { client_id: string | null; service_account: string | null; scopes: string } | null
}

type Draft = Partial<LyceeEmailTemplate> & { mode: LyceeMode }

function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <code style={{
        flex: 1, minWidth: 0, fontSize: 12, padding: '6px 8px', borderRadius: 8, background: crmV2.bgSoft, border: `1px solid ${crmV2.border}`,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={value}>{value}</code>
      <CrmV2Button size="sm" icon={<Copy size={12} />} onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}>
        {done ? 'Copié' : 'Copier'}
      </CrmV2Button>
    </div>
  )
}

export default function EmailTemplatesModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'modeles' | 'boites'>('modeles')
  const [boxes, setBoxes] = useState<MailboxesResponse | null>(null)
  const [templates, setTemplates] = useState<LyceeEmailTemplate[] | null>(null)
  const [mode, setMode] = useState<LyceeMode>('diploma')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates((await api<{ templates: LyceeEmailTemplate[] }>('/api/crm/lycees/email-templates')).templates)
    } catch (e) {
      setTemplates([])
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }, [])
  useEffect(() => {
    void loadTemplates()
    api<MailboxesResponse>('/api/crm/lycees/mailboxes').then(setBoxes).catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [loadTemplates])

  const list = (templates ?? []).filter(t => t.mode === mode)

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const body = { mode: draft.mode, name: draft.name, purpose: draft.purpose, subject: draft.subject, body: draft.body, attach_plaquette: draft.attach_plaquette !== false }
      if (draft.id) await api(`/api/crm/lycees/email-templates/${draft.id}`, { method: 'PATCH', json: body })
      else await api('/api/crm/lycees/email-templates', { method: 'POST', json: body })
      setNotice('Modèle enregistré.')
      setDraft(null)
      await loadTemplates()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }
  const archive = async () => {
    if (!draft?.id || !confirm('Retirer ce modèle de la liste ?')) return
    await api(`/api/crm/lycees/email-templates/${draft.id}`, { method: 'DELETE' }).catch(() => null)
    setDraft(null)
    await loadTemplates()
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(p => (p ? { ...p, [k]: v } : p))
  const label = { fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 } as const
  const notConnected = boxes?.mailboxes.filter(b => !b.ok) ?? []

  return (
    <AdminModal open onClose={onClose} width={820} title="Mails partenariat — boîtes & modèles" closeDisabled={saving}
      footer={draft ? (
        <>
          {draft.id && <CrmV2Button variant="danger" onClick={archive} disabled={saving} style={{ marginRight: 'auto' }}>Retirer</CrmV2Button>}
          <CrmV2Button onClick={() => setDraft(null)} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={save} disabled={saving || !draft.name?.trim() || !draft.subject?.trim() || !draft.body?.trim()}>{saving ? '…' : 'Enregistrer le modèle'}</CrmV2Button>
        </>
      ) : <CrmV2Button onClick={onClose}>Fermer</CrmV2Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <AdminNotice tone="error" onClose={() => setError(null)}>{error}</AdminNotice>}
        {notice && <AdminNotice tone="success" onClose={() => setNotice(null)}>{notice}</AdminNotice>}
        <CrmV2Segmented value={tab} onChange={setTab} items={[
          { id: 'modeles', label: 'Modèles de mail' },
          { id: 'boites', label: notConnected.length ? `Boîtes mail (${notConnected.length} à connecter)` : 'Boîtes mail' },
        ]} />

        {tab === 'boites' && (!boxes ? <CrmV2Spinner /> : (
          <>
            {boxes.mailboxes.map(b => (
              <div key={b.mailbox} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
                border: `1px solid ${b.ok ? hexA('#16a34a', 0.35) : hexA('#d13a41', 0.35)}`, background: b.ok ? hexA('#16a34a', 0.05) : hexA('#d13a41', 0.04),
              }}>
                {b.ok ? <CheckCircle2 size={18} color="#16a34a" /> : <TriangleAlert size={18} color="#d13a41" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{b.mailbox} <span style={{ fontWeight: 500, color: crmV2.textMuted }}>· {MAIL_BRANDS[b.mode].senderName}</span></div>
                  <div style={{ fontSize: 12, color: b.ok ? crmV2.textMuted : '#d13a41' }}>
                    {b.ok ? `Connectée — envoi et relève des réponses actifs${b.last_synced_at ? ` · dernière relève ${fmtDateTime(b.last_synced_at)}` : ''}` : b.error}
                  </div>
                  {b.ok && b.last_error && <div style={{ fontSize: 12, color: '#d13a41' }}>Dernière relève en erreur : {b.last_error}</div>}
                </div>
              </div>
            ))}
            {boxes.setup && (
              <div style={{ padding: 14, borderRadius: 12, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, fontSize: 13, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Connecter une boîte (une seule fois, aucun mot de passe à donner)</div>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <li>
                    Avec un compte <b>super-admin</b> du Google Workspace de la boîte, ouvrir{' '}
                    <a href="https://admin.google.com/ac/owl/domainwidedelegation" target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 700 }}>
                      Sécurité → Contrôle des API → Délégation au niveau du domaine
                    </a>.
                  </li>
                  <li>
                    Si une ligne existe déjà avec cet ID client (elle sert à Google Meet), cliquer dessus → <b>Modifier</b>. Sinon <b>Ajouter</b>.
                    <div style={{ marginTop: 4 }}>ID client :</div>
                    {boxes.setup.client_id ? <CopyField value={boxes.setup.client_id} /> : <div style={{ color: '#d13a41' }}>Introuvable — compte de service non configuré sur Vercel.</div>}
                  </li>
                  <li>
                    Dans « Champs d’application OAuth », coller exactement (la ligne Meet y reste) :
                    <CopyField value={boxes.setup.scopes} />
                  </li>
                  <li>Autoriser, attendre 1 à 5 minutes, puis rouvrir cette fenêtre : la boîte passe au vert.</li>
                </ol>
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8 }}>
                  Si afem-edu.fr est un Workspace séparé de diploma-sante.fr, refaire la même chose dans la console d’administration d’afem-edu.fr (même ID client).
                </div>
              </div>
            )}
          </>
        ))}

        {tab === 'modeles' && (!templates ? <CrmV2Spinner /> : draft ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div>
                <div style={label}>Nom du modèle</div>
                <CrmV2Input value={draft.name ?? ''} onChange={e => set('name', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <div style={label}>Marque</div>
                <CrmV2Select value={draft.mode} onChange={e => set('mode', e.target.value as LyceeMode)} style={{ width: '100%' }}>
                  {LYCEE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </CrmV2Select>
              </div>
              <div>
                <div style={label}>Usage</div>
                <CrmV2Select value={draft.purpose ?? 'autre'} onChange={e => set('purpose', e.target.value as MailPurpose)} style={{ width: '100%' }}>
                  {MAIL_PURPOSES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </CrmV2Select>
              </div>
            </div>
            <div>
              <div style={label}>Objet</div>
              <CrmV2Input value={draft.subject ?? ''} onChange={e => set('subject', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={label}>Message</div>
              <CrmV2Textarea value={draft.body ?? ''} onChange={e => set('body', e.target.value)} rows={16} style={{ width: '100%', lineHeight: 1.55 }} />
            </div>
            <CrmV2Toggle checked={draft.attach_plaquette !== false} onChange={v => set('attach_plaquette', v)} label="Joindre la plaquette par défaut" />
            <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.6 }}>
              <b>Variables</b> (remplacées à l’ouverture du mail, le texte reste modifiable avant l’envoi) :
              {TEMPLATE_VARIABLES.map(v => <div key={v.key}><code>{`{{${v.key}}}`}</code> — {v.label}</div>)}
              La signature (nom, pôle partenariats, adresse, site, logo) est ajoutée automatiquement : terminer le texte par « Bien cordialement, ».
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Segmented size="sm" value={mode} onChange={setMode} items={LYCEE_MODES.map(m => ({ id: m.id, label: m.label }))} />
              <CrmV2Button size="sm" variant="gold" icon={<Plus size={13} />} onClick={() => setDraft({ mode, purpose: 'autre', attach_plaquette: true, name: '', subject: '', body: '{{salutation}}\n\n\n\nBien cordialement,' })}>
                Nouveau modèle
              </CrmV2Button>
            </div>
            {!list.length && <div style={{ fontSize: 13, color: crmV2.textFaint }}>Aucun modèle pour cette marque.</div>}
            {MAIL_PURPOSES.map(p => {
              const items = list.filter(t => t.purpose === p.id)
              if (!items.length) return null
              return (
                <div key={p.id}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 6px' }}>{p.label}</div>
                  {items.map(t => (
                    <button key={t.id} type="button" onClick={() => setDraft(t)} style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6, borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${crmV2.border}`, background: crmV2.bg, fontFamily: 'inherit',
                    }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: crmV2.text }}>{t.name}</div>
                      <div style={{ fontSize: 12.5, color: crmV2.textMuted, marginTop: 2 }}>{t.subject}</div>
                      <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.body.replace(/\{\{salutation\}\}\s*/, '').slice(0, 160)}
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </AdminModal>
  )
}
