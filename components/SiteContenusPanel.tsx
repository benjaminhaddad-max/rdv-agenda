'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  Save, RefreshCw, Eye, EyeOff, Plus, Trash2, ExternalLink, Link2, FileText, Pencil, Lightbulb,
  CheckCircle2, GraduationCap, Stethoscope, PenLine, Info, ClipboardList,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Field, CrmV2Input, CrmV2Pill, CrmV2Textarea, hexA,
} from '@/components/crm-v2/primitives'
import { AdminIconButton, AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import {
  PanelCard, PanelCopyButton, PanelIconTile, PanelLoading, PanelSectionTitle, PanelShell, PanelTabs,
} from '@/components/crm-v2/panels/PanelUi'

const BLUE = '#4cabdb'
const GOLD = crmV2.gold

// ─── Onglet Contenus /rdv ─────────────────────────────────────────────────────

type RdvTypeRow = {
  id: number; rdv_key: string; title: string; subtitle: string
  description: string; icon: string; btn_label: string
  formation: string; tag: string; sort_order: number; active: boolean; updated_at: string
}

const FIELD_LABELS: { field: keyof RdvTypeRow; label: string; multiline?: boolean }[] = [
  { field: 'icon',        label: 'Icône (page publique)' },
  { field: 'title',       label: 'Titre de la carte' },
  { field: 'subtitle',    label: 'Sous-titre (affiché en or)' },
  { field: 'description', label: 'Description', multiline: true },
  { field: 'btn_label',   label: 'Texte du bouton CTA' },
  { field: 'tag',         label: 'Tag (badge wizard)' },
  { field: 'formation',   label: 'Nom formation → CRM' },
]

function TabContenus() {
  const [types, setTypes]     = useState<RdvTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [saved, setSaved]     = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft]     = useState<Partial<RdvTypeRow>>({})
  const [error, setError]     = useState<string | null>(null)

  const isMobile = useIsMobile()

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/rdv-types')
      const data = await res.json()
      setTypes(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function saveType(key: string) {
    setSaving(key); setError(null)
    try {
      const res = await fetch(`/api/rdv-types/${key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Erreur'); return }
      const updated = await res.json()
      setTypes(ts => ts.map(t => t.rdv_key === key ? { ...t, ...updated } : t))
      setEditing(null); setDraft({}); setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    } finally { setSaving(null) }
  }

  async function toggleActive(type: RdvTypeRow) {
    setSaving(type.rdv_key)
    try {
      const res = await fetch(`/api/rdv-types/${type.rdv_key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !type.active }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTypes(ts => ts.map(t => t.rdv_key === type.rdv_key ? { ...t, ...updated } : t))
      }
    } finally { setSaving(null) }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <AdminNotice tone="warning" icon={<Lightbulb size={15} />} style={{ flex: '1 1 260px' }}>
          Modifications appliquées <strong>immédiatement</strong> sur la page publique /rdv après sauvegarde.
        </AdminNotice>
        <CrmV2Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load}>Actualiser</CrmV2Button>
      </div>

      {loading ? (
        <PanelLoading />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {types.map(type => {
            const isEditing = editing === type.rdv_key
            const isSaving  = saving  === type.rdv_key
            const justSaved = saved   === type.rdv_key
            return (
              <PanelCard key={type.rdv_key} accent={isEditing} style={{ overflow: 'hidden' }}>
                {/* Ligne */}
                <div style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                  borderBottom: isEditing ? `1px solid ${crmV2.borderLight}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 200px' }}>
                    <PanelIconTile icon={<FileText size={15} />} color={type.active ? GOLD : crmV2.textFaint} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: type.active ? crmV2.text : crmV2.textMuted }}>{type.title}</div>
                      <div style={{ fontSize: 12, color: crmV2.goldDark }}>{type.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {justSaved && (
                      <span style={{ fontSize: 12, color: '#00866f', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={13} /> Sauvegardé
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleActive(type)} disabled={!!isSaving}
                      title={type.active ? 'Masquer sur la page /rdv' : 'Afficher sur la page /rdv'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 12px',
                        fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: isSaving ? 'wait' : 'pointer',
                        background: type.active ? hexA(crmV2.successStrong, 0.10) : crmV2.chipBg,
                        border: `1px solid ${type.active ? hexA(crmV2.successStrong, 0.30) : crmV2.chipBorder}`,
                        color: type.active ? crmV2.successStrong : crmV2.textMuted,
                      }}
                    >
                      {type.active ? <><Eye size={13} /> Visible</> : <><EyeOff size={13} /> Masqué</>}
                    </button>
                    {isEditing ? (
                      <>
                        <CrmV2Button size="sm" variant="secondary" onClick={() => { setEditing(null); setDraft({}) }}>Annuler</CrmV2Button>
                        <CrmV2Button size="sm" variant="primary" icon={<Save size={13} />} onClick={() => saveType(type.rdv_key)} disabled={!!isSaving}>
                          {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
                        </CrmV2Button>
                      </>
                    ) : (
                      <CrmV2Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => { setEditing(type.rdv_key); setDraft({ ...type }); setError(null) }}>
                        Modifier
                      </CrmV2Button>
                    )}
                  </div>
                </div>

                {/* Formulaire */}
                {isEditing && (
                  <div style={{ padding: isMobile ? 12 : 16 }}>
                    {error && <AdminNotice tone="error" style={{ marginBottom: 12 }}>{error}</AdminNotice>}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '12px 14px' }}>
                      {FIELD_LABELS.map(({ field, label, multiline }) => (
                        <CrmV2Field key={field} label={label} span={field === 'description' ? 2 : 1}>
                          {multiline ? (
                            <CrmV2Textarea value={(draft[field] as string) ?? ''} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} rows={2} style={{ minHeight: 64 }} />
                          ) : (
                            <CrmV2Input type="text" value={(draft[field] as string) ?? ''} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} />
                          )}
                        </CrmV2Field>
                      ))}
                    </div>
                    {/* Aperçu de la carte publique (l'icône est celle saisie pour la page /rdv) */}
                    <PanelSectionTitle style={{ marginTop: 16, marginBottom: 8 }}>Aperçu</PanelSectionTitle>
                    <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden', maxWidth: 300, boxShadow: crmV2.shadow }}>
                      <div style={{ height: 3, background: crmV2.goldGradient }} />
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>{(draft.icon as string) || type.icon}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.text }}>{(draft.title as string) || type.title}</div>
                            <div style={{ fontSize: 11, color: crmV2.goldDark, fontWeight: 700 }}>{(draft.subtitle as string) || type.subtitle}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: crmV2.textMuted, lineHeight: 1.5, marginBottom: 8 }}>{(draft.description as string) || type.description}</div>
                        <div style={{ background: crmV2.primary, borderRadius: 999, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{(draft.btn_label as string) || type.btn_label}</div>
                      </div>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <CrmV2Pill style={{ fontWeight: 500, color: crmV2.textMuted }}>CTA : <span style={{ color: crmV2.text, fontWeight: 600 }}>{type.btn_label}</span></CrmV2Pill>
                    <CrmV2Pill style={{ fontWeight: 500, color: crmV2.textMuted }}>Formation : <span style={{ color: crmV2.text, fontWeight: 600 }}>{type.formation}</span></CrmV2Pill>
                  </div>
                )}
              </PanelCard>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Onglet Liens & Campagnes ─────────────────────────────────────────────────

const RDV_TYPES_LINKS: { key: string; label: string; icon: ReactNode; color: string }[] = [
  { key: 'parcoursup',  label: 'Accompagnement Parcoursup',    icon: <GraduationCap size={13} />, color: BLUE },
  { key: 'medecine',    label: 'Coaching Orientation Médecine', icon: <Stethoscope size={13} />,   color: '#b8963e' },
  { key: 'information', label: "Rendez-vous d'information",     icon: <Info size={13} />,          color: crmV2.successStrong },
  { key: 'inscription', label: "Rendez-vous d'inscription",     icon: <PenLine size={13} />,       color: '#a855f7' },
]

const CHANNELS = [
  { key: 'instagram', label: 'Instagram', medium: 'social' },
  { key: 'facebook',  label: 'Facebook',  medium: 'social' },
  { key: 'tiktok',    label: 'TikTok',    medium: 'social' },
  { key: 'linkedin',  label: 'LinkedIn',  medium: 'social' },
  { key: 'email',     label: 'Email',     medium: 'email' },
  { key: 'sms',       label: 'SMS',       medium: 'sms' },
  { key: 'whatsapp',  label: 'WhatsApp',  medium: 'messaging' },
  { key: 'google',    label: 'Google Ads', medium: 'cpc' },
  { key: 'direct',    label: 'Lien direct', medium: 'direct' },
]

type CampaignLink = { id: string; type: string; channel: string; campaign: string; content: string; createdAt: string }

function buildUrl(base: string, type: string, source: string, medium: string, campaign: string, content: string) {
  const p = new URLSearchParams()
  p.set('type', type)
  if (source)   p.set('utm_source', source)
  if (medium)   p.set('utm_medium', medium)
  if (campaign) p.set('utm_campaign', campaign)
  if (content)  p.set('utm_content', content)
  return `${base}/rdv?${p.toString()}`
}

function TabLiens() {
  const [baseUrl, setBaseUrl]             = useState('')
  const [activeType, setActiveType]       = useState(RDV_TYPES_LINKS[0].key)
  const [selectedChannel, setSelectedChannel] = useState(CHANNELS[0].key)
  const [campaign, setCampaign]           = useState('')
  const [content, setContent]             = useState('')
  const [savedLinks, setSavedLinks]       = useState<CampaignLink[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin)
    try { const s = localStorage.getItem('rdv_campaign_links'); if (s) setSavedLinks(JSON.parse(s)) } catch { /* */ }
  }, [])

  function saveLinks(links: CampaignLink[]) {
    setSavedLinks(links); localStorage.setItem('rdv_campaign_links', JSON.stringify(links))
  }
  function addLink() {
    if (!campaign.trim()) return
    saveLinks([{ id: Date.now().toString(), type: activeType, channel: selectedChannel, campaign: campaign.trim(), content: content.trim(), createdAt: new Date().toISOString() }, ...savedLinks])
    setCampaign(''); setContent('')
  }

  const ch = CHANNELS.find(c => c.key === selectedChannel)!
  const previewUrl = baseUrl && campaign ? buildUrl(baseUrl, activeType, selectedChannel, ch.medium, campaign, content) : ''
  const grouped = RDV_TYPES_LINKS.map(t => ({ ...t, links: savedLinks.filter(l => l.type === t.key) }))

  const isMobile = useIsMobile()

  const choice = (active: boolean, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px', minHeight: isMobile ? 36 : undefined,
    fontSize: 12, fontWeight: active ? 700 : 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? hexA(color, 0.10) : crmV2.bg,
    border: `1px solid ${active ? hexA(color, 0.40) : crmV2.borderStrong}`,
    color: active ? color : crmV2.textMuted,
  })

  return (
    <>
      {/* URL de base */}
      <PanelCard style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <PanelIconTile icon={<ExternalLink size={15} />} color={crmV2.link} size={32} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <PanelSectionTitle>URL de base — page /rdv</PanelSectionTitle>
          <code style={{ fontSize: 13, color: crmV2.link, wordBreak: 'break-all' }}>{baseUrl}/rdv</code>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <PanelCopyButton text={`${baseUrl}/rdv`} />
          <a href={`${baseUrl}/rdv`} target="_blank" rel="noreferrer" style={linkBtn}>
            <ExternalLink size={13} /> Ouvrir
          </a>
        </div>
      </PanelCard>

      {/* Générateur */}
      <PanelCard style={{ padding: isMobile ? 14 : 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Plus size={16} color={GOLD} /> Générer un lien tracké
        </div>

        <PanelSectionTitle style={{ marginBottom: 8 }}>Type de RDV</PanelSectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {RDV_TYPES_LINKS.map(t => (
            <button key={t.key} type="button" onClick={() => setActiveType(t.key)} style={choice(activeType === t.key, t.color)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <PanelSectionTitle style={{ marginBottom: 8 }}>Canal / Source</PanelSectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {CHANNELS.map(c => (
            <button key={c.key} type="button" onClick={() => setSelectedChannel(c.key)} style={choice(selectedChannel === c.key, crmV2.goldDark)}>
              {c.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '12px 14px', marginBottom: 14 }}>
          <CrmV2Field label="Nom campagne *">
            <CrmV2Input value={campaign} onChange={e => setCampaign(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} placeholder="ex : parcoursup-2026" />
          </CrmV2Field>
          <CrmV2Field label="Contenu (optionnel)">
            <CrmV2Input value={content} onChange={e => setContent(e.target.value)} placeholder="ex : story-lien-bio" />
          </CrmV2Field>
        </div>

        {previewUrl && (
          <div style={{ background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            <PanelSectionTitle style={{ marginBottom: 4 }}>Aperçu</PanelSectionTitle>
            <code style={{ fontSize: 12, color: crmV2.link, wordBreak: 'break-all', lineHeight: 1.5 }}>{previewUrl}</code>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={addLink} disabled={!campaign.trim()}>
            Sauvegarder
          </CrmV2Button>
          {previewUrl && (
            <>
              <PanelCopyButton text={previewUrl} size="md" copiedLabel="Copié !" />
              <a href={previewUrl} target="_blank" rel="noreferrer" style={{ ...linkBtn, padding: '8px 16px', fontSize: 13 }}>
                <ExternalLink size={14} /> Tester
              </a>
            </>
          )}
        </div>
      </PanelCard>

      {/* Liens sauvegardés */}
      {savedLinks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PanelSectionTitle icon={<ClipboardList size={14} />} count={savedLinks.length}>Liens sauvegardés</PanelSectionTitle>
          {grouped.filter(g => g.links.length > 0).map(group => (
            <div key={group.key}>
              <div style={{
                fontSize: 11, color: group.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {group.icon} {group.label}
              </div>
              <PanelCard style={{ overflow: 'hidden' }}>
                {group.links.map((link, i) => {
                  const chInfo = CHANNELS.find(c => c.key === link.channel)!
                  const url = buildUrl(baseUrl, link.type, link.channel, chInfo.medium, link.campaign, link.content)
                  return (
                    <div key={link.id} style={{
                      padding: '8px 14px', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10,
                      borderBottom: i === group.links.length - 1 ? 'none' : `1px solid ${crmV2.borderLight}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{
                            background: hexA(group.color, 0.10), borderRadius: 999, padding: '1px 8px',
                            fontSize: 11, fontWeight: 700, color: group.color, flexShrink: 0,
                          }}>{chInfo.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.campaign}</span>
                          {link.content && <span style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>· {link.content}</span>}
                        </div>
                        <code style={{ fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', marginTop: 2 }}>{url}</code>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                        <PanelCopyButton text={url} iconOnly={isMobile} />
                        <a href={url} target="_blank" rel="noreferrer" title="Ouvrir" aria-label="Ouvrir" style={iconLink(isMobile)}>
                          <ExternalLink size={14} />
                        </a>
                        <AdminIconButton icon={<Trash2 size={14} />} title="Supprimer" tone="danger" onClick={() => saveLinks(savedLinks.filter(l => l.id !== link.id))} />
                      </div>
                    </div>
                  )
                })}
              </PanelCard>
            </div>
          ))}
        </div>
      )}
      {savedLinks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: crmV2.textMuted, fontSize: 13 }}>
          Aucun lien sauvegardé. Générez votre premier lien de campagne ci-dessus.
        </div>
      )}
    </>
  )
}

const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px',
  fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
  background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text,
}

function iconLink(isMobile: boolean): React.CSSProperties {
  const size = isMobile ? 40 : 32
  return {
    width: size, height: size, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.textMuted, textDecoration: 'none', flexShrink: 0,
  }
}

// ─── Panel combiné ────────────────────────────────────────────────────────────

type Tab = 'contenus' | 'liens'

export default function SiteContenusPanel({ onClose, defaultTab = 'contenus' }: { onClose: () => void; defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  return (
    <PanelShell
      variant="modal"
      width={880}
      onClose={onClose}
      icon={<Link2 size={16} />}
      title="Site & Contenus"
      subtitle="Gérez les textes de la page /rdv et vos liens de campagne"
      tabs={
        <PanelTabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'contenus', label: 'Contenus /rdv', icon: <FileText size={14} /> },
            { id: 'liens', label: 'Liens & Campagnes', icon: <Link2 size={14} /> },
          ]}
        />
      }
    >
      {tab === 'contenus' && <TabContenus />}
      {tab === 'liens'    && <TabLiens />}
    </PanelShell>
  )
}
