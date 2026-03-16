'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import CRMContactsTable, { type CRMContact } from './CRMContactsTable'
import CRMEditDrawer from './CRMEditDrawer'

// ── Constantes ──────────────────────────────────────────────────────────────
const NAVY      = '#0d1e34'
const NAVY_BG   = '#1a2f4a'
const NAVY_BDR  = '#2d4a6b'
const GOLD      = '#ccac71'
const BLUE      = '#4cabdb'
const TEXT_DIM  = '#3a5070'
const TEXT_MID  = '#8b8fa8'

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: BLUE },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#555870' },
}

interface RdvUser {
  id: string
  name: string
  role: string
  avatar_color?: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface Props {
  ownerParam: 'telepro_hs_id' | 'closer_hs_id' | 'contact_owner_hs_id'
  ownerId: string
  mode: 'closer' | 'telepro'
  onTotalChange?: (n: number) => void
}

// ── Styled select helper ─────────────────────────────────────────────────────
function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: value ? 'rgba(204,172,113,0.08)' : NAVY_BG,
          border: `1px solid ${value ? 'rgba(204,172,113,0.35)' : NAVY_BDR}`,
          borderRadius: 8,
          padding: '7px 30px 7px 10px',
          color: value ? GOLD : TEXT_MID,
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          minWidth: 130,
          fontWeight: value ? 600 : 400,
        }}
      >
        {children}
      </select>
      <span style={{
        position: 'absolute',
        right: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        color: TEXT_DIM,
        pointerEvents: 'none',
        fontSize: 10,
      }}>▾</span>
    </div>
  )
}

// ── Composant principal ──────────────────────────────────────────────────────
export default function UserCRMView({ ownerParam, ownerId, mode, onTotalChange }: Props) {
  // ─ Contacts
  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [loading, setLoading]     = useState(false)
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [limit, setLimit]         = useState(50)

  // ─ Filters
  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStage, setFilterStage]         = useState('')
  const [filterLeadStatus, setFilterLeadStatus] = useState('')
  const [filterFormation, setFilterFormation]   = useState('')

  // ─ Sort
  const [sortBy, setSortBy]   = useState('synced_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ─ Drawer
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  // ─ Users (pour drawer)
  const [closers, setClosers]   = useState<RdvUser[]>([])
  const [telepros, setTelePros] = useState<RdvUser[]>([])

  // ─ Field options
  const [leadStatusOpts, setLeadStatusOpts] = useState<string[]>([])
  const [formationOpts, setFormationOpts]   = useState<string[]>([])
  const [sourceOpts, setSourceOpts]         = useState<string[]>([])

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearchChange(v: string) {
    setSearch(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v)
      setPage(0)
    }, 400)
  }

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!ownerId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        [ownerParam]: ownerId,
        limit: String(limit),
        page: String(page),
        sort_by: sortBy,
        sort_dir: sortDir,
        all_classes: '1',   // afficher tous les leads, pas seulement les classes prioritaires
      })
      if (debouncedSearch)    params.set('search',      debouncedSearch)
      if (filterStage)        params.set('stage',       filterStage)
      if (filterLeadStatus)   params.set('lead_status', filterLeadStatus)
      if (filterFormation)    params.set('formation',   filterFormation)

      const res = await fetch(`/api/crm/contacts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        const t = data.total ?? 0
        setTotal(t)
        onTotalChange?.(t)
      }
    } finally {
      setLoading(false)
    }
  }, [ownerParam, ownerId, limit, page, sortBy, sortDir, debouncedSearch, filterStage, filterLeadStatus, filterFormation, onTotalChange])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  // Fetch users pour CRMEditDrawer
  useEffect(() => {
    fetch('/api/users?roles=closer,admin,telepro')
      .then(r => r.json())
      .then((users: RdvUser[]) => {
        setClosers(users.filter(u => ['closer', 'admin'].includes(u.role)))
        setTelePros(users.filter(u => u.role === 'telepro'))
      })
      .catch(() => {})
  }, [])

  // Fetch field options
  useEffect(() => {
    fetch('/api/crm/field-options')
      .then(r => r.json())
      .then(d => {
        if (d.leadStatuses?.length) setLeadStatusOpts(d.leadStatuses)
        if (d.formations?.length)   setFormationOpts(d.formations)
        if (d.sources?.length)      setSourceOpts(d.sources)
      })
      .catch(() => {})
  }, [])

  function handleSortChange(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(0)
  }

  function resetFilters() {
    setFilterStage('')
    setFilterLeadStatus('')
    setFilterFormation('')
    setSearch('')
    setDebouncedSearch('')
    setPage(0)
  }

  const hasActiveFilters = !!(filterStage || filterLeadStatus || filterFormation || debouncedSearch)
  const totalPages = Math.max(1, Math.ceil(total / limit))

  // Options pour CRMContactsTable (inline editing)
  const leadStatusOptions = leadStatusOpts.map(v => ({ id: v, label: v }))
  const sourceOptions     = sourceOpts.map(v => ({ id: v, label: v }))
  const closerSelectOptions = [
    { id: '', label: '— Aucun —' },
    ...closers.map(u => ({ id: u.hubspot_owner_id || u.id, label: u.name })),
  ]
  const teleproSelectOptions = [
    { id: '', label: '— Aucun —' },
    ...telepros.map(u => ({ id: u.hubspot_user_id || u.id, label: u.name })),
  ]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: NAVY,
    }}>

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '18px 24px 0',
        borderBottom: `1px solid ${NAVY_BDR}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
              {ownerParam === 'closer_hs_id' ? '🎯 Mes Transactions' : ownerParam === 'telepro_hs_id' ? '🏷️ Mes Transactions' : '👥 Mes Contacts'}
              {total > 0 && (
                <span style={{
                  background: 'rgba(76,171,219,0.15)',
                  border: '1px solid rgba(76,171,219,0.3)',
                  borderRadius: 20,
                  padding: '1px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: BLUE,
                }}>
                  {total}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>
              Contacts + transactions depuis HubSpot
            </div>
          </div>
          <button
            onClick={() => { setPage(0); fetchContacts() }}
            disabled={loading}
            style={{
              background: NAVY_BG,
              border: `1px solid ${NAVY_BDR}`,
              borderRadius: 8,
              padding: '7px 14px',
              color: loading ? TEXT_DIM : TEXT_MID,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>

        {/* ── Barre de filtres ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160, maxWidth: 280 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: TEXT_DIM, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Rechercher…"
              style={{
                width: '100%',
                background: NAVY_BG,
                border: `1px solid ${search ? BLUE : NAVY_BDR}`,
                borderRadius: 8,
                padding: '7px 28px 7px 28px',
                color: '#e8eaf0',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
            />
            {search && (
              <button onClick={() => handleSearchChange('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Stage */}
          <FilterSelect value={filterStage} onChange={v => { setFilterStage(v); setPage(0) }}>
            <option value="">Toutes les étapes</option>
            {Object.entries(STAGE_MAP).map(([id, s]) => (
              <option key={id} value={id}>{s.label}</option>
            ))}
          </FilterSelect>

          {/* Statut lead */}
          {leadStatusOpts.length > 0 && (
            <FilterSelect value={filterLeadStatus} onChange={v => { setFilterLeadStatus(v); setPage(0) }}>
              <option value="">Tous les statuts</option>
              {leadStatusOpts.map(v => <option key={v} value={v}>{v}</option>)}
            </FilterSelect>
          )}

          {/* Formation */}
          {formationOpts.length > 0 && (
            <FilterSelect value={filterFormation} onChange={v => { setFilterFormation(v); setPage(0) }}>
              <option value="">Toutes formations</option>
              {formationOpts.map(v => <option key={v} value={v}>{v}</option>)}
            </FilterSelect>
          )}

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              style={{
                background: 'transparent',
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: 8,
                padding: '7px 12px',
                color: '#ef4444',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <X size={11} /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <CRMContactsTable
          contacts={contacts}
          loading={loading}
          mode={mode}
          onRefresh={fetchContacts}
          onOpenDrawer={setDrawerContact}
          leadStatusOptions={leadStatusOptions}
          sourceOptions={sourceOptions}
          closerSelectOptions={closerSelectOptions}
          teleproSelectOptions={teleproSelectOptions}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderTop: `1px solid ${NAVY_BDR}`,
        flexShrink: 0,
        background: '#0b1929',
      }}>
        {/* Par page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>Par page :</span>
          {[25, 50, 100].map(n => (
            <button key={n} onClick={() => { setLimit(n); setPage(0) }}
              style={{
                background: limit === n ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: `1px solid ${limit === n ? 'rgba(204,172,113,0.35)' : NAVY_BDR}`,
                borderRadius: 6,
                padding: '4px 10px',
                color: limit === n ? GOLD : TEXT_DIM,
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
                fontWeight: limit === n ? 700 : 400,
              }}
            >{n}</button>
          ))}
        </div>

        {/* Navigation pages */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: TEXT_MID }}>
            Page <strong style={{ color: '#e8eaf0' }}>{page + 1}</strong> / {totalPages}
            <span style={{ color: TEXT_DIM, marginLeft: 8 }}>({total} contacts)</span>
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: NAVY_BG,
                border: `1px solid ${NAVY_BDR}`,
                borderRadius: 6,
                width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: page === 0 ? TEXT_DIM : TEXT_MID,
                cursor: page === 0 ? 'default' : 'pointer',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: NAVY_BG,
                border: `1px solid ${NAVY_BDR}`,
                borderRadius: 6,
                width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: page >= totalPages - 1 ? TEXT_DIM : TEXT_MID,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── CRMEditDrawer ───────────────────────────────────────────────── */}
      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers as any}
          telepros={telepros as any}
          onClose={() => setDrawerContact(null)}
          onRefresh={fetchContacts}
        />
      )}
    </div>
  )
}
