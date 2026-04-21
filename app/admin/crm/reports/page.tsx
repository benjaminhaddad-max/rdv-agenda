'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  LayoutDashboard, Plus, Trash2, Edit3, Star, X, BarChart3, Search, Copy,
} from 'lucide-react'

interface Dashboard {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  is_default: boolean
  is_shared: boolean
  created_at: string
  updated_at: string
}

export default function DashboardsListPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboards')
      const data = await res.json()
      setDashboards(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = dashboards.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
  })

  const remove = async (d: Dashboard) => {
    if (d.is_default) { alert('Le dashboard par défaut ne peut pas être supprimé.'); return }
    if (!confirm(`Supprimer le dashboard "${d.name}" ?`)) return
    const res = await fetch(`/api/dashboards/${d.id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#33475b', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 24px', height: 52, background: '#ffffff', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={16} style={{ color: '#ccac71' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Dashboards & Rapports</span>
          <span style={{ fontSize: 11, color: '#516f90' }}>
            Crée des tableaux de bord personnalisés avec tes KPIs
          </span>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '8px 16px', color: '#ccac71', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
        >
          <Plus size={14} /> Nouveau dashboard
        </button>
      </div>

      {/* Recherche */}
      <div style={{ padding: '20px 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8, padding: '6px 12px', maxWidth: 400 }}>
          <Search size={14} style={{ color: '#516f90' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un dashboard…"
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#33475b', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Grid des dashboards */}
      <div style={{ padding: '0 24px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#516f90' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#ffffff', border: '1px dashed #cbd6e2', borderRadius: 12 }}>
            <LayoutDashboard size={48} style={{ color: '#cbd6e2', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Aucun dashboard pour le moment</div>
            <div style={{ fontSize: 13, color: '#516f90', marginBottom: 20 }}>
              Crée ton premier tableau de bord pour suivre tes KPIs en temps réel.
            </div>
            <button onClick={() => setShowNewModal(true)} style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '10px 20px', color: '#ccac71', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}>
              <Plus size={14} /> Créer mon premier dashboard
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map(d => (
              <DashboardCard key={d.id} dashboard={d} onDelete={() => remove(d)} />
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewDashboardModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => { window.location.href = `/admin/crm/reports/${id}` }}
        />
      )}
    </div>
  )
}

function DashboardCard({ dashboard: d, onDelete }: { dashboard: Dashboard; onDelete: () => void }) {
  return (
    <div
      onClick={() => window.location.href = `/admin/crm/reports/${d.id}`}
      style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all .15s', position: 'relative' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${d.color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BarChart3 size={20} style={{ color: d.color }} />
        </div>
        {d.is_default && (
          <span style={{ fontSize: 10, color: '#ccac71', background: 'rgba(204,172,113,0.15)', padding: '3px 8px', borderRadius: 999, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Star size={10} /> Par défaut
          </span>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#33475b', marginBottom: 4 }}>{d.name}</div>
      <div style={{ fontSize: 12, color: '#516f90', marginBottom: 14, minHeight: 32, lineHeight: 1.4 }}>
        {d.description || 'Pas de description'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#7c98b6' }}>
        <span>Modifié le {new Date(d.updated_at).toLocaleDateString('fr-FR')}</span>
        {!d.is_default && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' }}
            title="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

function NewDashboardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      if (res.ok) {
        const created = await res.json()
        onCreated(created.id)
      }
    } finally { setLoading(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 24, zIndex: 61 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#33475b' }}>Nouveau dashboard</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#516f90', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Nom *</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Performance Closers PASS"
          autoFocus
          style={{ width: '100%', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '8px 12px', color: '#33475b', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, marginTop: 12 }}>Description (optionnel)</div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="À quoi sert ce dashboard ?"
          rows={3}
          style={{ width: '100%', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '8px 12px', color: '#33475b', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#ffffff', border: '1px solid #cbd6e2', color: '#516f90', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Annuler</button>
          <button
            onClick={submit}
            disabled={!name.trim() || loading}
            style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', color: '#ccac71', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: !name.trim() || loading ? 0.5 : 1 }}
          >
            {loading ? 'Création…' : 'Créer →'}
          </button>
        </div>
      </div>
    </>
  )
}
