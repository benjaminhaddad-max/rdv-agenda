'use client'

import { useState, useEffect } from 'react'
import { Save, RefreshCw, Eye, EyeOff, Copy, Check, Plus, Trash2, ExternalLink, Link2, FileText } from 'lucide-react'

const NAVY = '#ffffff'
const BLUE = '#4cabdb'
const GOLD = '#ccac71'

// ─── Onglet Contenus /rdv ─────────────────────────────────────────────────────

type RdvTypeRow = {
  id: number; rdv_key: string; title: string; subtitle: string
  description: string; icon: string; btn_label: string
  formation: string; tag: string; sort_order: number; active: boolean; updated_at: string
}

const FIELD_LABELS: { field: keyof RdvTypeRow; label: string; multiline?: boolean }[] = [
  { field: 'icon',        label: 'Icône (emoji)' },
  { field: 'title',       label: 'Titre de la carte' },
  { field: 'subtitle',    label: 'Sous-titre (affiché en or)' },
  { field: 'description', label: 'Description', multiline: true },
  { field: 'btn_label',   label: 'Texte du bouton CTA' },
  { field: 'tag',         label: 'Tag (badge wizard)' },
  { field: 'formation',   label: 'Nom formation → HubSpot' },
]

function TabContenus() {
  const [types, setTypes]     = useState<RdvTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [saved, setSaved]     = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft]     = useState<Partial<RdvTypeRow>>({})
  const [error, setError]     = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '8px 11px', color: '#1e293b',
    fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#ccac71', background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.2)', borderRadius: 8, padding: '7px 12px' }}>
          💡 Modifications appliquées <strong>immédiatement</strong> sur la page publique /rdv après sauvegarde.
        </div>
        <button onClick={load} style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 8, padding: '6px 11px', color: BLUE, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: 'inherit' }}>
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {types.map(type => {
            const isEditing = editing === type.rdv_key
            const isSaving  = saving  === type.rdv_key
            const justSaved = saved   === type.rdv_key
            return (
              <div key={type.rdv_key} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isEditing ? 'rgba(204,172,113,0.4)' : '#e2e8f0'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                {/* Row */}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isEditing ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{type.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: type.active ? '#1e293b' : '#64748b' }}>{type.title}</div>
                      <div style={{ fontSize: 11, color: GOLD }}>{type.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => toggleActive(type)} disabled={!!isSaving}
                      style={{ background: type.active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${type.active ? 'rgba(34,197,94,0.3)' : '#e2e8f0'}`, borderRadius: 6, padding: '4px 9px', color: type.active ? '#22c55e' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}
                    >
                      {type.active ? <><Eye size={10} /> Visible</> : <><EyeOff size={10} /> Masqué</>}
                    </button>
                    {isEditing ? (
                      <>
                        <button onClick={() => { setEditing(null); setDraft({}) }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', color: '#64748b', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                          Annuler
                        </button>
                        <button onClick={() => saveType(type.rdv_key)} disabled={isSaving} style={{ background: isSaving ? 'rgba(204,172,113,0.2)' : GOLD, border: 'none', borderRadius: 6, padding: '4px 12px', color: NAVY, cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Save size={10} /> {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setEditing(type.rdv_key); setDraft({ ...type }); setError(null) }} style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 6, padding: '4px 10px', color: BLUE, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                        ✏️ Modifier
                      </button>
                    )}
                    {justSaved && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Sauvegardé</span>}
                  </div>
                </div>

                {/* Formulaire */}
                {isEditing && (
                  <div style={{ padding: '16px' }}>
                    {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, padding: '7px 11px', color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {FIELD_LABELS.map(({ field, label, multiline }) => (
                        <div key={field} style={field === 'description' ? { gridColumn: '1 / -1' } : {}}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
                          {multiline ? (
                            <textarea value={(draft[field] as string) ?? ''} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                              onFocus={e => e.currentTarget.style.borderColor = GOLD} onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                          ) : (
                            <input type="text" value={(draft[field] as string) ?? ''} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} style={inputStyle}
                              onFocus={e => e.currentTarget.style.borderColor = GOLD} onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Aperçu */}
                    <div style={{ marginTop: 14, background: '#fff', borderRadius: 10, overflow: 'hidden', maxWidth: 300 }}>
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, ${NAVY})` }} />
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>{(draft.icon as string) || type.icon}</span>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: NAVY }}>{(draft.title as string) || type.title}</div>
                            <div style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>{(draft.subtitle as string) || type.subtitle}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#6b82a0', lineHeight: 1.5, marginBottom: 8 }}>{(draft.description as string) || type.description}</div>
                        <div style={{ background: NAVY, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{(draft.btn_label as string) || type.btn_label} →</div>
                      </div>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div style={{ padding: '0 16px 10px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '2px 7px' }}>CTA : <span style={{ color: '#64748b' }}>{type.btn_label}</span></span>
                    <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '2px 7px' }}>Formation : <span style={{ color: '#64748b' }}>{type.formation}</span></span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Onglet Liens & Campagnes ─────────────────────────────────────────────────

const RDV_TYPES_LINKS = [
  { key: 'parcoursup',  label: 'Accompagnement Parcoursup',    icon: '🎓', color: BLUE },
  { key: 'medecine',    label: 'Coaching Orientation Médecine', icon: '🩺', color: GOLD },
  { key: 'information', label: "Rendez-vous d'information",     icon: '💡', color: '#4ade80' },
  { key: 'inscription', label: "Rendez-vous d'inscription",     icon: '✍️', color: '#c084fc' },
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
  const [copiedId, setCopiedId]           = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin)
    try { const s = localStorage.getItem('rdv_campaign_links'); if (s) setSavedLinks(JSON.parse(s)) } catch { /* */ }
  }, [])

  function saveLinks(links: CampaignLink[]) {
    setSavedLinks(links); localStorage.setItem('rdv_campaign_links', JSON.stringify(links))
  }
  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  }
  function addLink() {
    if (!campaign.trim()) return
    const ch = CHANNELS.find(c => c.key === selectedChannel)!
    saveLinks([{ id: Date.now().toString(), type: activeType, channel: selectedChannel, campaign: campaign.trim(), content: content.trim(), createdAt: new Date().toISOString() }, ...savedLinks])
    setCampaign(''); setContent('')
  }

  const ch = CHANNELS.find(c => c.key === selectedChannel)!
  const previewUrl = baseUrl && campaign ? buildUrl(baseUrl, activeType, selectedChannel, ch.medium, campaign, content) : ''
  const grouped = RDV_TYPES_LINKS.map(t => ({ ...t, links: savedLinks.filter(l => l.type === t.key) }))

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '8px 11px', color: '#1e293b',
    fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* URL de base */}
      <div style={{ background: 'rgba(76,171,219,0.06)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <ExternalLink size={13} style={{ color: BLUE, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 2 }}>URL DE BASE — Page /rdv</div>
          <code style={{ fontSize: 12, color: BLUE }}>{baseUrl}/rdv</code>
        </div>
        <button onClick={() => copy(`${baseUrl}/rdv`, 'base')} style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 7, padding: '5px 10px', color: BLUE, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          {copiedId === 'base' ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
        </button>
        <a href={`${baseUrl}/rdv`} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px', color: '#64748b', fontSize: 11, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ExternalLink size={11} /> Ouvrir
        </a>
      </div>

      {/* Générateur */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} style={{ color: GOLD }} /> Générer un lien tracké
        </div>

        {/* Type */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>Type de RDV</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RDV_TYPES_LINKS.map(t => (
              <button key={t.key} onClick={() => setActiveType(t.key)} style={{ background: activeType === t.key ? `${t.color}20` : 'rgba(255,255,255,0.04)', border: `1px solid ${activeType === t.key ? `${t.color}50` : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, padding: '5px 11px', color: activeType === t.key ? t.color : '#64748b', fontSize: 11, fontWeight: activeType === t.key ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canal */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>Canal / Source</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {CHANNELS.map(c => (
              <button key={c.key} onClick={() => setSelectedChannel(c.key)} style={{ background: selectedChannel === c.key ? 'rgba(204,172,113,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectedChannel === c.key ? 'rgba(204,172,113,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: selectedChannel === c.key ? GOLD : '#64748b', fontSize: 11, fontWeight: selectedChannel === c.key ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Champs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Nom campagne *</label>
            <input value={campaign} onChange={e => setCampaign(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} placeholder="ex: parcoursup-2026" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Contenu (optionnel)</label>
            <input value={content} onChange={e => setContent(e.target.value)} placeholder="ex: story-lien-bio" style={inputStyle} />
          </div>
        </div>

        {previewUrl && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 3 }}>APERÇU</div>
            <code style={{ fontSize: 10, color: BLUE, wordBreak: 'break-all', lineHeight: 1.5 }}>{previewUrl}</code>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addLink} disabled={!campaign.trim()} style={{ background: campaign.trim() ? GOLD : '#f1f5f9', color: campaign.trim() ? NAVY : '#64748b', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: campaign.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={12} /> Sauvegarder
          </button>
          {previewUrl && (
            <>
              <button onClick={() => copy(previewUrl, 'preview')} style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, padding: '8px 14px', color: BLUE, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                {copiedId === 'preview' ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier</>}
              </button>
              <a href={previewUrl} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', color: '#64748b', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                <ExternalLink size={12} /> Tester
              </a>
            </>
          )}
        </div>
      </div>

      {/* Liens sauvegardés */}
      {savedLinks.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>📋 Liens sauvegardés ({savedLinks.length})</div>
          {grouped.filter(g => g.links.length > 0).map(group => (
            <div key={group.key} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: group.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
                {group.icon} {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {group.links.map(link => {
                  const chInfo = CHANNELS.find(c => c.key === link.channel)!
                  const url = buildUrl(baseUrl, link.type, link.channel, chInfo.medium, link.campaign, link.content)
                  return (
                    <div key={link.id} style={{ background: '#e2e8f0', border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ background: `${group.color}20`, border: `1px solid ${group.color}30`, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, color: group.color }}>{chInfo.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{link.campaign}</span>
                          {link.content && <span style={{ fontSize: 10, color: '#64748b' }}>· {link.content}</span>}
                        </div>
                        <code style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{url}</code>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => copy(url, link.id)} style={{ background: copiedId === link.id ? 'rgba(34,197,94,0.15)' : 'rgba(76,171,219,0.1)', border: `1px solid ${copiedId === link.id ? 'rgba(34,197,94,0.3)' : 'rgba(76,171,219,0.25)'}`, borderRadius: 6, padding: '4px 9px', color: copiedId === link.id ? '#22c55e' : BLUE, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {copiedId === link.id ? <><Check size={10} /> Copié</> : <><Copy size={10} /> Copier</>}
                        </button>
                        <a href={url} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 7px', color: '#64748b', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                          <ExternalLink size={10} />
                        </a>
                        <button onClick={() => saveLinks(savedLinks.filter(l => l.id !== link.id))} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 7px', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', fontFamily: 'inherit' }}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {savedLinks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#475569', fontSize: 12 }}>
          Aucun lien sauvegardé. Générez votre premier lien de campagne ci-dessus.
        </div>
      )}
    </div>
  )
}

// ─── Panel combiné ────────────────────────────────────────────────────────────

type Tab = 'contenus' | 'liens'

export default function SiteContenusPanel({ onClose, defaultTab = 'contenus' }: { onClose: () => void; defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, width: '100%', maxWidth: 880, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(204,172,113,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Link2 size={15} style={{ color: GOLD }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>Site & Contenus</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Gérez les textes de la page /rdv et vos liens de campagne</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20, lineHeight: 1, padding: '4px 8px' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ background: '#e2e8f0', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', gap: 0 }}>
          {([
            { key: 'contenus', label: 'Contenus /rdv', icon: <FileText size={13} /> },
            { key: 'liens',    label: 'Liens & Campagnes', icon: <Link2 size={13} /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === t.key ? GOLD : 'transparent'}`,
                padding: '12px 18px',
                color: tab === t.key ? GOLD : '#64748b',
                fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '24px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {tab === 'contenus' && <TabContenus />}
          {tab === 'liens'    && <TabLiens />}
        </div>
      </div>
    </div>
  )
}
