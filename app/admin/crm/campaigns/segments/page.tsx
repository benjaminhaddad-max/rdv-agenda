'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Plus, Trash2, Copy, Search, Filter, List, RefreshCw,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Segment {
  id: string
  name: string
  description: string | null
  segment_type: 'dynamic' | 'static'
  contact_count: number | null
  created_at: string
  updated_at: string
}

const TYPE_META = {
  dynamic: { label: 'Segment dynamique', color: '#0038f0', icon: Filter },
  static:  { label: 'Liste statique', color: '#a855f7', icon: List },
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'dynamic' | 'static'>('all')
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/segments')
      const data = await res.json()
      setSegments(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = segments.filter(s => {
    if (typeFilter !== 'all' && s.segment_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const remove = async (s: Segment) => {
    if (!confirm(`Supprimer « ${s.name} » ?`)) return
    const res = await fetch(`/api/segments/${s.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error)
  }

  const duplicate = async (s: Segment) => {
    const full = await fetch(`/api/segments/${s.id}`).then(r => r.json())
    const res = await fetch('/api/segments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `${s.name} (copie)`,
        description: full.description,
        segment_type: full.segment_type ?? 'dynamic',
        filters: full.filters ?? {},
        filter_groups: full.filter_groups ?? [],
        preset_flags: full.preset_flags ?? null,
        manual_contact_ids: full.manual_contact_ids ?? [],
      }),
    })
    if (res.ok) {
      const created = await res.json()
      window.location.href = `/admin/crm/campaigns/segments/${created.id}`
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', color: '#0e1e35', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '0 20px', height: 52, background: '#ffffff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin/crm/campaigns" style={{ color: '#4a6070', textDecoration: 'none', fontSize: 12 }}>← Campagnes</a>
          <div style={{ width: 1, height: 22, background: '#e5ddc8' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} style={{ color: '#0038f0' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Segments & listes</span>
          </div>
        </div>
        <LogoutButton />
      </div>

      <div style={{ padding: '24px 24px 16px', maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ fontSize: 13, color: '#4a6070', margin: '0 0 16px', lineHeight: 1.5 }}>
          Créez des audiences réutilisables pour vos campagnes email et SMS — comme les segments et listes HubSpot.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e5ddc8', borderRadius: 8, padding: '6px 12px', flex: '1 1 240px' }}>
            <Search size={14} style={{ color: '#4a6070' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontFamily: 'inherit' }}
          >
            <option value="all">Tous les types</option>
            <option value="dynamic">Segments dynamiques</option>
            <option value="static">Listes statiques</option>
          </select>
          <button
            onClick={load}
            style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a6070', fontFamily: 'inherit' }}
          >
            <RefreshCw size={13} /> Actualiser
          </button>
          <button
            onClick={() => setShowNew(true)}
            style={{ background: 'rgba(46,163,242,0.12)', border: '1px solid rgba(46,163,242,0.3)', borderRadius: 8, padding: '8px 16px', color: '#0038f0', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
          >
            <Plus size={14} /> Nouveau
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#4a6070' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px dashed #e5ddc8', borderRadius: 12 }}>
            <Users size={40} style={{ color: '#a89e8a', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Aucun segment pour le moment</div>
            <div style={{ fontSize: 13, color: '#4a6070', marginBottom: 16 }}>Créez un segment dynamique (filtres CRM) ou une liste statique (contacts figés).</div>
            <button onClick={() => setShowNew(true)} style={{ background: 'rgba(46,163,242,0.12)', border: '1px solid rgba(46,163,242,0.3)', borderRadius: 8, padding: '10px 18px', color: '#0038f0', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Créer un segment
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(s => {
              const meta = TYPE_META[s.segment_type] ?? TYPE_META.dynamic
              const Icon = meta.icon
              return (
                <div
                  key={s.id}
                  style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${meta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/admin/crm/campaigns/segments/${s.id}`} style={{ fontSize: 14, fontWeight: 600, color: '#0e1e35', textDecoration: 'none' }}>
                      {s.name}
                    </Link>
                    {s.description && (
                      <div style={{ fontSize: 12, color: '#4a6070', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0038f0' }}>{(s.contact_count ?? 0).toLocaleString('fr-FR')}</div>
                    <div style={{ fontSize: 10, color: '#4a6070' }}>contacts</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: `${meta.color}15`, padding: '4px 8px', borderRadius: 999 }}>
                    {meta.label}
                  </span>
                  <div style={{ fontSize: 11, color: '#4a6070', minWidth: 100, textAlign: 'right' }}>
                    {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true, locale: fr })}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => duplicate(s)} title="Dupliquer" style={iconBtnStyle}><Copy size={13} /></button>
                    <button onClick={() => remove(s)} title="Supprimer" style={{ ...iconBtnStyle, color: '#ef4444' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewSegmentModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { window.location.href = `/admin/crm/campaigns/segments/${id}` }}
        />
      )}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid #e5ddc8', borderRadius: 6,
  padding: 6, cursor: 'pointer', color: '#4a6070', display: 'flex', alignItems: 'center',
}

function NewSegmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [segmentType, setSegmentType] = useState<'dynamic' | 'static'>('dynamic')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), segment_type: segmentType }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const seg = await res.json()
      onCreated(seg.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
      setCreating(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Nouveau segment ou liste</h2>
        <label style={{ fontSize: 12, color: '#4a6070', display: 'block', marginBottom: 6 }}>Nom</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Terminale IDF — NRP2"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 13, marginBottom: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
          autoFocus
        />
        <label style={{ fontSize: 12, color: '#4a6070', display: 'block', marginBottom: 6 }}>Type</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['dynamic', 'static'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setSegmentType(t)}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                border: `1px solid ${segmentType === t ? '#0038f0' : '#e5ddc8'}`,
                background: segmentType === t ? 'rgba(46,163,242,0.08)' : '#fff',
                color: segmentType === t ? '#0038f0' : '#4a6070',
              }}
            >
              {t === 'dynamic' ? 'Segment dynamique' : 'Liste statique'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid #e5ddc8', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
          <button onClick={create} disabled={creating || !name.trim()} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#0038f0', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: creating ? 0.6 : 1 }}>
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
