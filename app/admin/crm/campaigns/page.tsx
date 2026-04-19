'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Mail, Plus, Search, Send, Clock, Pause, Check, AlertTriangle, Archive,
  Eye, MousePointerClick, X, FileText, Users, Calendar, Trash2, Copy, Edit3,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'

// ─── Types ────────────────────────────────────────────────────────────────
interface Campaign {
  id: string
  name: string
  subject: string
  preheader: string | null
  sender_email: string
  sender_name: string
  reply_to: string | null
  template_id: string | null
  design_json: unknown
  html_body: string
  text_body: string | null
  segment_ids: string[]
  extra_filters: unknown
  manual_contact_ids: string[]
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed' | 'archived'
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_sent: number
  total_delivered: number
  total_opens: number
  total_unique_opens: number
  total_clicks: number
  total_unique_clicks: number
  total_bounces: number
  total_unsubscribes: number
  created_at: string
  updated_at: string
}

const STATUS_META: Record<Campaign['status'], { label: string; color: string; bg: string; icon: typeof Mail }> = {
  draft:     { label: 'Brouillon',  color: '#8b8fa8', bg: '#1d2f4b', icon: FileText },
  scheduled: { label: 'Programmée', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)', icon: Clock },
  sending:   { label: 'Envoi…',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: Send },
  sent:      { label: 'Envoyée',    color: '#22c55e', bg: 'rgba(34,197,94,0.15)', icon: Check },
  paused:    { label: 'En pause',   color: '#ccac71', bg: 'rgba(204,172,113,0.15)', icon: Pause },
  failed:    { label: 'Échec',      color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: AlertTriangle },
  archived:  { label: 'Archivée',   color: '#8b8fa8', bg: 'rgba(139,143,168,0.15)', icon: Archive },
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = campaigns.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q)
    }
    return true
  })

  const duplicate = async (c: Campaign) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `${c.name} (copie)`,
        subject: c.subject,
        preheader: c.preheader,
        sender_email: c.sender_email,
        sender_name: c.sender_name,
        reply_to: c.reply_to,
        template_id: c.template_id,
        design_json: c.design_json,
        html_body: c.html_body,
        text_body: c.text_body,
        segment_ids: c.segment_ids,
        extra_filters: c.extra_filters,
      }),
    })
    if (res.ok) load()
  }

  const remove = async (c: Campaign) => {
    if (!confirm(`Supprimer la campagne "${c.name}" ?`)) return
    const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error)
  }

  // Stats globales
  const stats = {
    total: campaigns.length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    totalSent: campaigns.reduce((s, c) => s + (c.total_sent || 0), 0),
    totalOpens: campaigns.reduce((s, c) => s + (c.total_unique_opens || 0), 0),
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1624', color: '#e4e7eb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 20px', height: 52, background: '#1d2f4b', borderBottom: '1px solid #2d4a6b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin/crm" style={{ color: '#8b8fa8', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Retour CRM
          </a>
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Campagnes Email</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/admin/crm/campaigns/templates" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={12} /> Templates
          </a>
          <a href="/admin/crm/campaigns/segments" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={12} /> Segments
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '24px 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          <StatCard label="Total" value={stats.total} color="#ccac71" icon={Mail} />
          <StatCard label="Brouillons" value={stats.draft} color="#8b8fa8" icon={FileText} />
          <StatCard label="Envoyées" value={stats.sent} color="#22c55e" icon={Check} />
          <StatCard label="Emails envoyés" value={stats.totalSent.toLocaleString('fr-FR')} color="#06b6d4" icon={Send} />
          <StatCard label="Ouvertures uniques" value={stats.totalOpens.toLocaleString('fr-FR')} color="#a855f7" icon={Eye} />
        </div>
      </div>

      {/* Barre d'actions */}
      <div style={{ padding: '0 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', flex: '1 1 280px' }}>
            <Search size={14} style={{ color: '#8b8fa8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou sujet…"
              style={{ flex: 1, background: 'transparent', border: 'none', color: '#e4e7eb', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', color: '#e4e7eb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowNewModal(true)}
            style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '8px 16px', color: '#ccac71', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Plus size={14} /> Nouvelle campagne
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: '0 24px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <Empty message="Chargement…" />
        ) : filtered.length === 0 ? (
          campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: '#152438', border: '1px dashed #2d4a6b', borderRadius: 12 }}>
              <Mail size={48} style={{ color: '#2d4a6b', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#e4e7eb', marginBottom: 6 }}>Aucune campagne pour le moment</div>
              <div style={{ fontSize: 13, color: '#8b8fa8', marginBottom: 20 }}>Créez votre première campagne email pour toucher vos prospects.</div>
              <button
                onClick={() => setShowNewModal(true)}
                style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '10px 20px', color: '#ccac71', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
              >
                <Plus size={14} /> Créer ma première campagne
              </button>
            </div>
          ) : (
            <Empty message="Aucune campagne ne correspond aux filtres." />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(c => (
              <CampaignRow
                key={c.id}
                campaign={c}
                onOpen={() => window.location.href = `/admin/crm/campaigns/${c.id}`}
                onDuplicate={() => duplicate(c)}
                onDelete={() => remove(c)}
              />
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewCampaignModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false)
            window.location.href = `/admin/crm/campaigns/${id}`
          }}
        />
      )}
    </div>
  )
}

// ─── Composants ──────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon }: { label: string; value: number | string; color: string; icon: typeof Mail }) {
  return (
    <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: '#8b8fa8' }}>{message}</div>
  )
}

function CampaignRow({ campaign: c, onOpen, onDuplicate, onDelete }: {
  campaign: Campaign
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const meta = STATUS_META[c.status]
  const Icon = meta.icon
  const openRate = c.total_sent > 0 ? Math.round((c.total_unique_opens / c.total_sent) * 100) : 0
  const clickRate = c.total_sent > 0 ? Math.round((c.total_unique_clicks / c.total_sent) * 100) : 0

  return (
    <div
      onClick={onOpen}
      style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all .15s' }}
    >
      {/* Icône statut */}
      <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} style={{ color: meta.color }} />
      </div>

      {/* Nom + sujet */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e7eb', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
        <div style={{ fontSize: 12, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
      </div>

      {/* Stats (si envoyée) */}
      {c.status === 'sent' && (
        <>
          <Metric label="Envoyés" value={c.total_sent} />
          <Metric label="Ouverts" value={`${openRate}%`} color="#a855f7" />
          <Metric label="Clics" value={`${clickRate}%`} color="#06b6d4" />
        </>
      )}

      {/* Date */}
      <div style={{ fontSize: 11, color: '#8b8fa8', textAlign: 'right', minWidth: 100 }}>
        {c.sent_at ? (
          <>Envoyée le<br /><span style={{ color: '#e4e7eb', fontWeight: 600 }}>{formatDate(c.sent_at)}</span></>
        ) : c.scheduled_at ? (
          <>Programmée<br /><span style={{ color: '#06b6d4', fontWeight: 600 }}>{formatDate(c.scheduled_at)}</span></>
        ) : (
          <>Modifiée<br /><span style={{ color: '#e4e7eb', fontWeight: 600 }}>{formatDate(c.updated_at)}</span></>
        )}
      </div>

      {/* Badge statut */}
      <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
        {meta.label}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        <IconBtn title="Dupliquer" onClick={onDuplicate}><Copy size={13} /></IconBtn>
        {c.status === 'draft' && (
          <IconBtn title="Supprimer" onClick={onDelete} color="#ef4444"><Trash2 size={13} /></IconBtn>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, color = '#e4e7eb' }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ minWidth: 70, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#8b8fa8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function IconBtn({ children, onClick, title, color = '#8b8fa8' }: { children: React.ReactNode; onClick: () => void; title: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 6, padding: 6, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  )
}

// ─── Modal nouvelle campagne ─────────────────────────────────────────────
function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim() || !subject.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, subject }),
      })
      if (res.ok) {
        const created = await res.json()
        onCreated(created.id)
      } else {
        alert((await res.json()).error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, background: '#1d2f4b', border: '1px solid #2d4a6b', borderRadius: 12, padding: 24, zIndex: 61 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e4e7eb' }}>Nouvelle campagne</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8b8fa8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Nom interne *</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Relance PASS - Avril 2026"
          autoFocus
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: '#8b8fa8', marginTop: 4 }}>Visible uniquement en interne</div>

        <div style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, marginTop: 14 }}>Sujet de l&apos;email *</div>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Ex: Plus que 3 jours pour t'inscrire {{prenom}} 🎓"
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: '#8b8fa8', marginTop: 4 }}>Tu peux utiliser <code style={{ color: '#ccac71' }}>{'{{prenom}}'}</code>, <code style={{ color: '#ccac71' }}>{'{{nom}}'}</code></div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#152438', border: '1px solid #2d4a6b', color: '#8b8fa8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Annuler</button>
          <button
            onClick={submit}
            disabled={!name.trim() || !subject.trim() || loading}
            style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', color: '#ccac71', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: !name.trim() || !subject.trim() || loading ? 0.5 : 1 }}
          >
            {loading ? 'Création…' : 'Créer et continuer →'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Utils ───────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0b1624',
  border: '1px solid #2d4a6b',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e4e7eb',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
