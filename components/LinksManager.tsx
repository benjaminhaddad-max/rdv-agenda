'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Link, Plus, Trash2, ExternalLink } from 'lucide-react'

const RDV_TYPES = [
  { key: 'parcoursup',   label: 'Accompagnement Parcoursup',       icon: '🎓', color: '#4cabdb' },
  { key: 'medecine',     label: 'Coaching Orientation Médecine',    icon: '🩺', color: '#ccac71' },
  { key: 'information',  label: "Rendez-vous d'information",        icon: '💡', color: '#22c55e' },
  { key: 'inscription',  label: "Rendez-vous d'inscription",        icon: '✍️', color: '#a78bfa' },
]

const CHANNELS = [
  { key: 'instagram',  label: 'Instagram', medium: 'social' },
  { key: 'facebook',   label: 'Facebook',  medium: 'social' },
  { key: 'tiktok',     label: 'TikTok',    medium: 'social' },
  { key: 'linkedin',   label: 'LinkedIn',  medium: 'social' },
  { key: 'email',      label: 'Email',     medium: 'email' },
  { key: 'sms',        label: 'SMS',       medium: 'sms' },
  { key: 'whatsapp',   label: 'WhatsApp',  medium: 'messaging' },
  { key: 'google',     label: 'Google Ads', medium: 'cpc' },
  { key: 'direct',     label: 'Lien direct', medium: 'direct' },
]

type CampaignLink = {
  id: string
  type: string
  channel: string
  campaign: string
  content: string
  createdAt: string
}

function buildUrl(baseUrl: string, type: string, source: string, medium: string, campaign: string, content: string) {
  const params = new URLSearchParams()
  params.set('type', type)
  if (source)   params.set('utm_source', source)
  if (medium)   params.set('utm_medium', medium)
  if (campaign) params.set('utm_campaign', campaign)
  if (content)  params.set('utm_content', content)
  return `${baseUrl}/rdv?${params.toString()}`
}

export default function LinksManager({ onClose }: { onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState('')
  const [activeType, setActiveType] = useState(RDV_TYPES[0].key)
  const [selectedChannel, setSelectedChannel] = useState(CHANNELS[0].key)
  const [campaign, setCampaign] = useState('')
  const [content, setContent] = useState('')
  const [savedLinks, setSavedLinks] = useState<CampaignLink[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin)
    }
    // Charger depuis localStorage
    try {
      const stored = localStorage.getItem('rdv_campaign_links')
      if (stored) setSavedLinks(JSON.parse(stored))
    } catch { /* silent */ }
  }, [])

  function saveLinks(links: CampaignLink[]) {
    setSavedLinks(links)
    localStorage.setItem('rdv_campaign_links', JSON.stringify(links))
  }

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function addLink() {
    if (!campaign.trim()) return
    const ch = CHANNELS.find(c => c.key === selectedChannel)!
    const newLink: CampaignLink = {
      id: Date.now().toString(),
      type: activeType,
      channel: selectedChannel,
      campaign: campaign.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }
    saveLinks([newLink, ...savedLinks])
    setCampaign('')
    setContent('')
  }

  function deleteLink(id: string) {
    saveLinks(savedLinks.filter(l => l.id !== id))
  }

  const activeTypeInfo = RDV_TYPES.find(t => t.key === activeType)!
  const activeChannelInfo = CHANNELS.find(c => c.key === selectedChannel)!

  const previewUrl = baseUrl ? buildUrl(baseUrl, activeType, selectedChannel, activeChannelInfo.medium, campaign, content) : ''

  // Grouper les liens par type
  const groupedLinks = RDV_TYPES.map(type => ({
    ...type,
    links: savedLinks.filter(l => l.type === type.key),
  }))

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#0b1624', border: '1px solid #2d4a6b', borderRadius: 20, width: '100%', maxWidth: 860, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ background: '#1d2f4b', borderBottom: '1px solid #2d4a6b', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(76,171,219,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Link size={16} style={{ color: '#4cabdb' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>Liens & Campagnes</div>
              <div style={{ fontSize: 12, color: '#555870' }}>Générez des liens trackés pour chaque canal</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Lien de base */}
        <div style={{ padding: '16px 28px', background: 'rgba(76,171,219,0.06)', borderBottom: '1px solid #2d4a6b', display: 'flex', alignItems: 'center', gap: 12 }}>
          <ExternalLink size={14} style={{ color: '#4cabdb', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#555870', fontWeight: 700, marginBottom: 2 }}>URL DE BASE — Page d&apos;accueil RDV</div>
            <code style={{ fontSize: 13, color: '#4cabdb', fontFamily: 'monospace' }}>{baseUrl}/rdv</code>
          </div>
          <button
            onClick={() => copy(`${baseUrl}/rdv`, 'base')}
            style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, padding: '6px 12px', color: '#4cabdb', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {copiedId === 'base' ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier</>}
          </button>
          <a href={`${baseUrl}/rdv`} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ExternalLink size={12} /> Ouvrir
          </a>
        </div>

        <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ── Générateur ── */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} style={{ color: '#ccac71' }} /> Générer un lien tracké
            </div>

            {/* Type de RDV */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Type de RDV</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {RDV_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveType(t.key)}
                    style={{
                      background: activeType === t.key ? `${t.color}20` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${activeType === t.key ? `${t.color}50` : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 8, padding: '6px 12px',
                      color: activeType === t.key ? t.color : '#8b8fa8',
                      fontSize: 12, fontWeight: activeType === t.key ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Canal */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Canal / Source</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CHANNELS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setSelectedChannel(c.key)}
                    style={{
                      background: selectedChannel === c.key ? 'rgba(204,172,113,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${selectedChannel === c.key ? 'rgba(204,172,113,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 7, padding: '5px 11px',
                      color: selectedChannel === c.key ? '#ccac71' : '#8b8fa8',
                      fontSize: 12, fontWeight: selectedChannel === c.key ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nom de campagne + contenu */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Nom campagne *</label>
                <input
                  value={campaign}
                  onChange={e => setCampaign(e.target.value)}
                  placeholder="ex: parcoursup-2026, rentrée-sept"
                  onKeyDown={e => e.key === 'Enter' && addLink()}
                  style={{ width: '100%', background: '#152438', border: '1px solid #2d4a6b', borderRadius: 9, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Contenu (optionnel)</label>
                <input
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="ex: story-lien-bio, post-carousel"
                  style={{ width: '100%', background: '#152438', border: '1px solid #2d4a6b', borderRadius: 9, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Prévisualisation du lien */}
            {previewUrl && campaign && (
              <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#555870', fontWeight: 700, marginBottom: 4 }}>APERÇU DU LIEN GÉNÉRÉ</div>
                <code style={{ fontSize: 11, color: '#4cabdb', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>{previewUrl}</code>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={addLink}
                disabled={!campaign.trim()}
                style={{ background: campaign.trim() ? '#ccac71' : '#243d5c', color: campaign.trim() ? '#0b1624' : '#555870', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: campaign.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} /> Sauvegarder le lien
              </button>
              {previewUrl && campaign && (
                <>
                  <button
                    onClick={() => copy(previewUrl, 'preview')}
                    style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 9, padding: '9px 16px', color: '#4cabdb', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {copiedId === 'preview' ? <><Check size={13} /> Copié !</> : <><Copy size={13} /> Copier maintenant</>}
                  </button>
                  <a href={previewUrl} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '9px 14px', color: '#8b8fa8', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ExternalLink size={13} /> Tester
                  </a>
                </>
              )}
            </div>
          </div>

          {/* ── Liens sauvegardés ── */}
          {savedLinks.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', marginBottom: 16 }}>
                📋 Liens sauvegardés ({savedLinks.length})
              </div>
              {groupedLinks.filter(g => g.links.length > 0).map(group => (
                <div key={group.key} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: group.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{group.icon}</span> {group.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.links.map(link => {
                      const ch = CHANNELS.find(c => c.key === link.channel)!
                      const url = buildUrl(baseUrl, link.type, link.channel, ch.medium, link.campaign, link.content)
                      return (
                        <div
                          key={link.id}
                          style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ background: `${group.color}20`, border: `1px solid ${group.color}30`, borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: group.color }}>
                                {ch.label}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#e8eaf0' }}>{link.campaign}</span>
                              {link.content && <span style={{ fontSize: 11, color: '#555870' }}>· {link.content}</span>}
                            </div>
                            <code style={{ fontSize: 11, color: '#555870', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                              {url}
                            </code>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => copy(url, link.id)}
                              style={{ background: copiedId === link.id ? 'rgba(34,197,94,0.15)' : 'rgba(76,171,219,0.1)', border: `1px solid ${copiedId === link.id ? 'rgba(34,197,94,0.3)' : 'rgba(76,171,219,0.25)'}`, borderRadius: 7, padding: '5px 10px', color: copiedId === link.id ? '#22c55e' : '#4cabdb', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              {copiedId === link.id ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
                            </button>
                            <a href={url} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '5px 8px', color: '#555870', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                              <ExternalLink size={11} />
                            </a>
                            <button
                              onClick={() => deleteLink(link.id)}
                              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '5px 8px', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', fontFamily: 'inherit' }}
                            >
                              <Trash2 size={11} />
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
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#3a5070', fontSize: 13 }}>
              Aucun lien sauvegardé. Générez votre premier lien de campagne ci-dessus.
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
