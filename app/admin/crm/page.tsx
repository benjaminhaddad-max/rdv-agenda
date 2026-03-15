'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, LayoutDashboard, Users } from 'lucide-react'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'
import LogoutButton from '@/components/LogoutButton'

const STAGE_OPTIONS = [
  { id: '',           label: 'Toutes les étapes' },
  { id: '3165428979', label: '🔴 À Replanifier' },
  { id: '3165428980', label: '🔵 RDV Pris' },
  { id: '3165428981', label: '🟡 Délai Réflexion' },
  { id: '3165428982', label: '🟢 Pré-inscription' },
  { id: '3165428983', label: '🟣 Finalisation' },
  { id: '3165428984', label: '✅ Inscription Confirmée' },
  { id: '3165428985', label: '⚫ Fermé Perdu' },
]

interface RdvUser {
  id: string
  name: string
  role: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface SyncLog {
  synced_at: string
  contacts_upserted: number
  deals_upserted: number
  duration_ms: number
  error_message?: string | null
}

const selectStyle: React.CSSProperties = {
  background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 8,
  padding: '6px 10px', color: '#8b8fa8', fontSize: 12, cursor: 'pointer',
  outline: 'none', fontFamily: 'inherit',
}

export default function CRMPage() {
  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [lastSync, setLastSync]   = useState<SyncLog | null>(null)

  // Filtres
  const [search, setSearch]         = useState('')
  const [stage, setStage]           = useState('')
  const [closerHsId, setCloserHsId] = useState('')
  const [teleproHsId, setTeleproHsId] = useState('')

  // Listes pour les dropdowns
  const [closers, setClosers]   = useState<RdvUser[]>([])
  const [telepros, setTelepros] = useState<RdvUser[]>([])

  const LIMIT = 50

  // Charger les utilisateurs pour les filtres
  useEffect(() => {
    fetch('/api/users?role=commercial').then(r => r.json()).then(d => setClosers(Array.isArray(d) ? d : []))
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => setTelepros(Array.isArray(d) ? d : []))
    fetchLastSync()
  }, [])

  async function fetchLastSync() {
    try {
      // On peut lire le log depuis une route ou directement (on utilise le endpoint cron avec un trick)
      // Pour simplifier, on stocke juste le dernier sync info en local state après chaque sync
      // Le composant affichera "jamais synchronisé" si pas de data
    } catch { /* silent */ }
  }

  const fetchContacts = useCallback(async (resetPage = false) => {
    setLoading(true)
    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)

    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        page: String(currentPage),
      })
      if (search)      params.set('search', search)
      if (stage)       params.set('stage', stage)
      if (closerHsId)  params.set('closer_hs_id', closerHsId)
      if (teleproHsId) params.set('telepro_hs_id', teleproHsId)

      const res = await fetch(`/api/crm/contacts?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [search, stage, closerHsId, teleproHsId, page])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  // Lancer le sync HubSpot → Supabase
  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/cron/crm-sync?force=1', {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      })
      const data = await res.json()
      setLastSync({
        synced_at: new Date().toISOString(),
        contacts_upserted: data.contacts_upserted ?? 0,
        deals_upserted: data.deals_upserted ?? 0,
        duration_ms: data.duration_ms ?? 0,
        error_message: data.error ?? null,
      })
      // Recharger les contacts après sync
      await fetchContacts(true)
    } catch { /* silent */ }
    finally { setSyncing(false) }
  }

  function formatSyncTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const min = Math.round(diff / 60000)
    if (min < 1) return 'à l\'instant'
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    return `il y a ${h}h`
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624' }}>

      {/* ── Topbar ── */}
      <div style={{ padding: '0 20px', height: 52, background: '#1d2f4b', borderBottom: '1px solid #2d4a6b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600 }}>CRM — Contacts & Transactions</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href="/admin" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <LayoutDashboard size={12} /> Dashboard
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* ── Barre sync + stats ── */}
      <div style={{ padding: '10px 20px', background: '#152438', borderBottom: '1px solid #2d4a6b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ background: syncing ? 'rgba(76,171,219,0.1)' : 'rgba(76,171,219,0.15)', border: '1px solid rgba(76,171,219,0.3)', borderRadius: 8, padding: '6px 14px', color: '#4cabdb', fontSize: 12, cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Synchronisation…' : '🔄 Sync HubSpot'}
          </button>
          {lastSync && (
            <span style={{ fontSize: 11, color: lastSync.error_message ? '#ef4444' : '#555870' }}>
              {lastSync.error_message
                ? `⚠ Erreur sync: ${lastSync.error_message}`
                : `✓ ${formatSyncTime(lastSync.synced_at)} · ${lastSync.contacts_upserted} contacts · ${lastSync.deals_upserted} deals · ${lastSync.duration_ms}ms`
              }
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#555870' }}>
          <span><strong style={{ color: '#e8eaf0' }}>{total}</strong> contacts</span>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div style={{ padding: '10px 20px', background: '#0f1c2e', borderBottom: '1px solid #1e3350', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        {/* Recherche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 10px', flex: '1 1 200px', minWidth: 160, maxWidth: 280 }}>
          <Search size={12} style={{ color: '#555870', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchContacts(true)}
            style={{ background: 'transparent', border: 'none', color: '#e8eaf0', fontSize: 12, outline: 'none', flex: 1, fontFamily: 'inherit' }}
          />
        </div>

        {/* Étape */}
        <select value={stage} onChange={e => { setStage(e.target.value); }} style={selectStyle}>
          {STAGE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        {/* Closer */}
        <select value={closerHsId} onChange={e => setCloserHsId(e.target.value)} style={selectStyle}>
          <option value="">Tous les closers</option>
          {closers.map(c => <option key={c.id} value={c.hubspot_owner_id ?? ''}>{c.name}</option>)}
        </select>

        {/* Télépro */}
        <select value={teleproHsId} onChange={e => setTeleproHsId(e.target.value)} style={selectStyle}>
          <option value="">Tous les télépros</option>
          {telepros.map(t => <option key={t.id} value={t.hubspot_user_id ?? ''}>{t.name}</option>)}
        </select>

        {/* Appliquer */}
        <button
          onClick={() => fetchContacts(true)}
          style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '6px 14px', color: '#ccac71', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}
        >
          Filtrer
        </button>
        {(search || stage || closerHsId || teleproHsId) && (
          <button
            onClick={() => { setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('') }}
            style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 10px', color: '#555870', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        <CRMContactsTable
          contacts={contacts}
          loading={loading}
          mode="admin"
          onRefresh={() => fetchContacts()}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, paddingBottom: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '5px 14px', color: page === 0 ? '#2d4a6b' : '#8b8fa8', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
            >← Précédent</button>
            <span style={{ color: '#555870', fontSize: 12 }}>Page {page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '5px 14px', color: page >= totalPages - 1 ? '#2d4a6b' : '#8b8fa8', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
            >Suivant →</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
