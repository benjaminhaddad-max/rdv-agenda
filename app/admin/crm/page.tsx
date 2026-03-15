'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Search, LayoutDashboard, Users, X, ChevronDown } from 'lucide-react'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'
import LogoutButton from '@/components/LogoutButton'

// ── Static option lists ────────────────────────────────────────────────────────

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

const FORMATION_OPTIONS = [
  { id: '',              label: 'Toutes formations' },
  { id: 'PASS',          label: 'PASS' },
  { id: 'LSPS',          label: 'LSPS' },
  { id: 'LAS',           label: 'LAS' },
  { id: 'P-1',           label: 'P-1' },
  { id: 'P-2',           label: 'P-2' },
  { id: 'PAES FR',       label: 'PAES FR' },
  { id: 'PAES EU',       label: 'PAES EU' },
  { id: 'LSPS2 UPEC',   label: 'LSPS2 UPEC' },
  { id: 'LSPS3 UPEC',   label: 'LSPS3 UPEC' },
]

const CLASSE_OPTIONS = [
  { id: '',                  label: 'Toutes classes' },
  { id: 'Terminale',         label: 'Terminale' },
  { id: 'Première',          label: 'Première' },
  { id: 'Seconde',           label: 'Seconde' },
  { id: 'Troisième',         label: 'Troisième' },
  { id: 'PASS',              label: 'PASS' },
  { id: 'LSPS 1',            label: 'LSPS 1' },
  { id: 'LSPS 2',            label: 'LSPS 2' },
  { id: 'LSPS 3',            label: 'LSPS 3' },
  { id: 'LAS 1',             label: 'LAS 1' },
  { id: 'LAS 2',             label: 'LAS 2' },
  { id: 'LAS 3',             label: 'LAS 3' },
  { id: 'Etudes médicales',  label: 'Études médicales' },
]

const PERIOD_OPTIONS = [
  { id: '',       label: 'Toutes les périodes' },
  { id: 'today',  label: "Aujourd'hui" },
  { id: 'week',   label: 'Cette semaine' },
  { id: 'month',  label: 'Ce mois' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPeriodMatch(contact: CRMContact, period: string): boolean {
  if (!period) return true
  const dateStr = contact.deal?.createdate
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (period === 'today') {
    return d.toDateString() === now.toDateString()
  }
  if (period === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
    return d >= weekAgo
  }
  if (period === 'month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }
  return true
}

function filterClientSide(contacts: CRMContact[], period: string, formation: string, classe: string): CRMContact[] {
  return contacts.filter(c => {
    if (period && !isPeriodMatch(c, period)) return false
    if (formation && c.deal?.formation !== formation) return false
    if (classe && c.classe_actuelle !== classe) return false
    return true
  })
}

// ── Custom Select ──────────────────────────────────────────────────────────────

interface SelectOption { id: string; label: string }

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
}) {
  const current = options.find(o => o.id === value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== ''

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(13,30,52,0.8)',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#8b8fa8',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          minWidth: 120,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
          {current?.label ?? placeholder ?? options[0]?.label}
        </span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: '#0d1e34',
          border: '1px solid #2d4a6b',
          borderRadius: 10,
          zIndex: 200,
          minWidth: '100%',
          maxHeight: 280,
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: '4px 0',
        }}>
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                background: value === opt.id ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: 'none',
                padding: '8px 14px',
                color: value === opt.id ? '#ccac71' : '#c8cad8',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontWeight: value === opt.id ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [lastSync, setLastSync]   = useState<SyncLog | null>(null)

  // Server-side filters (trigger API call)
  const [search, setSearch]           = useState('')
  const [stage, setStage]             = useState('')
  const [closerHsId, setCloserHsId]   = useState('')
  const [teleproHsId, setTeleproHsId] = useState('')

  // Client-side filters (applied after data is loaded)
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')
  const [period, setPeriod]       = useState('')

  // Dropdown user lists
  const [closers, setClosers]   = useState<RdvUser[]>([])
  const [telepros, setTelepros] = useState<RdvUser[]>([])

  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load users + initial fetch ───────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/users?role=commercial').then(r => r.json()).then(d => setClosers(Array.isArray(d) ? d : []))
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => setTelepros(Array.isArray(d) ? d : []))
  }, [])

  // ── Fetch contacts from API ──────────────────────────────────────────────────

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

  // ── Auto-apply server-side filters with debounce ─────────────────────────────

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchContacts(true), 300)
  }

  // ── HubSpot sync ────────────────────────────────────────────────────────────

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
      await fetchContacts(true)
    } catch { /* silent */ }
    finally { setSyncing(false) }
  }

  function formatSyncTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const min = Math.round(diff / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    return `il y a ${h}h`
  }

  // ── Client-side filtering ────────────────────────────────────────────────────

  const displayed = filterClientSide(contacts, period, formation, classe)

  const totalPages = Math.ceil(total / LIMIT)

  const hasWithDeal = contacts.filter(c => !!c.deal).length
  const hasNoCloser = contacts.filter(c => c.deal && !c.deal.closer).length

  const hasActiveFilters = search || stage || closerHsId || teleproHsId || formation || classe || period

  function resetAll() {
    setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod('')
  }

  // Closer dropdown options
  const closerOptions: SelectOption[] = [
    { id: '', label: 'Tous les closers' },
    ...closers.map(c => ({ id: c.hubspot_owner_id ?? c.id, label: c.name })),
  ]
  const teleproOptions: SelectOption[] = [
    { id: '', label: 'Tous les télépros' },
    ...telepros.map(t => ({ id: t.hubspot_user_id ?? t.id, label: t.name })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ─────────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px',
        height: 52,
        background: '#1d2f4b',
        borderBottom: '1px solid #2d4a6b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
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

      {/* ── Sync bar ───────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        background: '#101e30',
        borderBottom: '1px solid #1a2f45',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 12,
      }}>
        {/* Left: sync button + last sync info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              background: syncing ? 'rgba(76,171,219,0.08)' : 'rgba(76,171,219,0.15)',
              border: '1px solid rgba(76,171,219,0.3)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#4cabdb',
              fontSize: 12,
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={12} style={{ animation: syncing ? 'spin 0.8s linear infinite' : 'none' }} />
            {syncing ? 'Synchronisation…' : 'Sync HubSpot'}
          </button>
          {lastSync && (
            <span style={{ fontSize: 11, color: lastSync.error_message ? '#ef4444' : '#3a5070' }}>
              {lastSync.error_message
                ? `⚠ Erreur: ${lastSync.error_message}`
                : `✓ ${formatSyncTime(lastSync.synced_at)} · ${lastSync.contacts_upserted} contacts · ${lastSync.deals_upserted} deals · ${lastSync.duration_ms}ms`
              }
            </span>
          )}
        </div>

        {/* Right: quick stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatChip value={total} label="contacts" color="#8b8fa8" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasWithDeal} label="avec deal" color="#4cabdb" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasNoCloser} label="sans closer" color="#ccac71" />
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px',
        background: '#0d1a28',
        borderBottom: '1px solid #1a2f45',
        flexShrink: 0,
      }}>
        {/* Row 1: Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {/* Search */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#0b1624',
            border: '1px solid #2d4a6b',
            borderRadius: 8,
            padding: '7px 12px',
            flex: '1 1 auto',
            maxWidth: 420,
            transition: 'border-color 0.15s',
          }}>
            <Search size={13} style={{ color: '#3a5070', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Rechercher par nom, email, téléphone…"
              value={search}
              onChange={e => { setSearch(e.target.value); scheduleRefetch() }}
              onKeyDown={e => { if (e.key === 'Enter') fetchContacts(true) }}
              style={{ background: 'transparent', border: 'none', color: '#e8eaf0', fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => { setSearch(''); scheduleRefetch() }} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Reset button — only when filters active */}
          {hasActiveFilters && (
            <button
              onClick={resetAll}
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                padding: '7px 12px',
                color: '#ef4444',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <X size={11} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Row 2: Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <FilterSelect
            value={stage}
            onChange={v => { setStage(v); scheduleRefetch() }}
            options={STAGE_OPTIONS}
          />
          <FilterSelect
            value={formation}
            onChange={setFormation}
            options={FORMATION_OPTIONS}
          />
          <FilterSelect
            value={classe}
            onChange={setClasse}
            options={CLASSE_OPTIONS}
          />
          <FilterSelect
            value={closerHsId}
            onChange={v => { setCloserHsId(v); scheduleRefetch() }}
            options={closerOptions}
          />
          <FilterSelect
            value={teleproHsId}
            onChange={v => { setTeleproHsId(v); scheduleRefetch() }}
            options={teleproOptions}
          />
          <FilterSelect
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
          />
        </div>

        {/* Active filters summary */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Filtres actifs :</span>
            {stage && <FilterPill label={STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
            {formation && <FilterPill label={formation} onRemove={() => setFormation('')} />}
            {classe && <FilterPill label={classe} onRemove={() => setClasse('')} />}
            {closerHsId && <FilterPill label={closerOptions.find(o => o.id === closerHsId)?.label ?? 'Closer'} onRemove={() => { setCloserHsId(''); scheduleRefetch() }} />}
            {teleproHsId && <FilterPill label={teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
            {period && <FilterPill label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
            {search && <FilterPill label={`"${search}"`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
          </div>
        )}
      </div>

      {/* ── Table area ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {/* Results count when client-side filters are active */}
        {(formation || classe || period) && !loading && (
          <div style={{ padding: '10px 0 6px', fontSize: 12, color: '#3a5070' }}>
            {displayed.length} résultat{displayed.length !== 1 ? 's' : ''} affiché{displayed.length !== 1 ? 's' : ''} sur {contacts.length} chargés
          </div>
        )}

        <CRMContactsTable
          contacts={displayed}
          loading={loading}
          mode="admin"
          onRefresh={() => fetchContacts()}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '6px 16px', color: page === 0 ? '#2d4a6b' : '#8b8fa8', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
            >
              ← Précédent
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                // Show pages near current, first and last
                const p = totalPages <= 7 ? i : (
                  i === 0 ? 0 :
                  i === 6 ? totalPages - 1 :
                  page <= 3 ? i :
                  page >= totalPages - 4 ? totalPages - 7 + i :
                  page - 3 + i
                )
                return (
                  <button
                    key={i}
                    onClick={() => setPage(p)}
                    style={{
                      background: p === page ? 'rgba(204,172,113,0.15)' : 'transparent',
                      border: `1px solid ${p === page ? 'rgba(204,172,113,0.4)' : 'transparent'}`,
                      borderRadius: 6,
                      width: 32,
                      height: 32,
                      color: p === page ? '#ccac71' : '#3a5070',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      fontWeight: p === page ? 700 : 400,
                    }}
                  >
                    {p + 1}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '6px 16px', color: page >= totalPages - 1 ? '#2d4a6b' : '#8b8fa8', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d4a6b; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a5a7a; }
      `}</style>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value.toLocaleString('fr-FR')}</span>
      <span style={{ fontSize: 11, color: '#3a5070' }}>{label}</span>
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(204,172,113,0.1)',
      border: '1px solid rgba(204,172,113,0.25)',
      borderRadius: 20,
      padding: '2px 8px 2px 10px',
      fontSize: 11,
      color: '#ccac71',
      fontWeight: 600,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', color: '#ccac71', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7, lineHeight: 1 }}
      >
        <X size={10} />
      </button>
    </span>
  )
}
