'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  Search, X, ChevronDown, ChevronUp, LayoutDashboard, Users, ExternalLink,
  ArrowUpDown, GraduationCap, MapPin, BookOpen, Phone, Mail, RefreshCw,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'

// ── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  hubspot_deal_id: string
  dealname: string | null
  dealstage: string | null
  formation: string | null
  closedate: string | null
  createdate: string | null
  description: string | null
  closer: { id: string; name: string; avatar_color: string } | null
  telepro: { id: string; name: string; avatar_color: string } | null
  contact: {
    hubspot_contact_id: string
    firstname: string | null
    lastname: string | null
    email: string | null
    phone: string | null
    classe_actuelle: string | null
    zone_localite: string | null
    departement: string | null
  } | null
}

interface StatsData {
  stages: Record<string, number>
  formations: Record<string, number>
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  emoji: '🔴' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb', bg: 'rgba(76,171,219,0.10)',  emoji: '🔵' },
  '3165428981': { label: 'Délai Réflexion',       color: '#ccac71', bg: 'rgba(204,172,113,0.10)', emoji: '🟡' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   emoji: '🟢' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7', bg: 'rgba(168,85,247,0.10)',  emoji: '🟣' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a', bg: 'rgba(22,163,74,0.10)',   emoji: '✅' },
  '3165428985': { label: 'Fermé Perdu',           color: '#555870', bg: 'rgba(85,88,112,0.10)',   emoji: '⚫' },
}

const FORMATION_OPTIONS = [
  '', 'PASS', 'LSPS', 'LAS', 'P-1', 'P-2', 'PAES FR', 'PAES EU', 'LSPS2 UPEC', 'LSPS3 UPEC',
]

const CLASSE_OPTIONS = [
  '', 'Terminale', 'Première', 'Seconde', 'Troisième', 'PASS',
  'LSPS 1', 'LSPS 2', 'LSPS 3', 'LAS 1', 'LAS 2', 'LAS 3', 'Etudes médicales',
]

type SortCol = 'dealname' | 'formation' | 'classe' | 'zone' | 'stage' | 'created'

// ── Helpers ──────────────────────────────────────────────────────────────────

function StageBadge({ stageId }: { stageId: string | null }) {
  if (!stageId) return <span style={{ color: '#555870', fontSize: 12 }}>—</span>
  const s = STAGE_MAP[stageId]
  if (!s) return <span style={{ fontSize: 12, color: '#555870' }}>{stageId}</span>
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}33`,
      borderRadius: 6,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
    }}>
      <span style={{ fontSize: 10 }}>{s.emoji}</span>
      {s.label}
    </span>
  )
}

function Avatar({ name, color, size = 26 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color || '#4f6ef7',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 22 ? 9 : 10, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  )
}

// ── Dropdown Filter ──────────────────────────────────────────────────────────

function DropFilter({
  value, onChange, options, placeholder, format,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  format?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== ''

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.08)' : 'rgba(13,30,52,0.8)',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.35)' : '#2d4a6b'}`,
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: isActive ? '#ccac71' : '#6b7a90', fontSize: 12, fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        {isActive ? (format ? format(value) : value) : placeholder}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
          background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '4px 0',
          maxHeight: 280, overflowY: 'auto', minWidth: '100%',
        }}>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'block', width: '100%', background: value === opt ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: 'none', padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                color: value === opt ? '#ccac71' : '#c8cad8', fontFamily: 'inherit',
                fontWeight: value === opt ? 700 : 400, textAlign: 'left', whiteSpace: 'nowrap',
              }}
            >
              {opt === '' ? placeholder : (format ? format(opt) : opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sortable Column Header ───────────────────────────────────────────────────

function SortHeader({
  label, col, currentSort, currentOrder, onSort,
}: {
  label: string; col: SortCol; currentSort: SortCol; currentOrder: 'asc' | 'desc'
  onSort: (col: SortCol) => void
}) {
  const isActive = currentSort === col
  return (
    <button
      onClick={() => onSort(col)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color: isActive ? '#ccac71' : '#3a5070', fontFamily: 'inherit',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      }}
    >
      {label}
      {isActive ? (
        currentOrder === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : (
        <ArrowUpDown size={9} style={{ opacity: 0.4 }} />
      )}
    </button>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal]   = useState(0)
  const [stats, setStats]   = useState<StatsData | null>(null)
  const [page, setPage]     = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch]       = useState('')
  const [stage, setStage]         = useState('')
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')

  // Sort
  const [sortCol, setSortCol]     = useState<SortCol>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Expanded row
  const [expanded, setExpanded]   = useState<string | null>(null)

  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (resetPage = false) => {
    setLoading(true)
    const p = resetPage ? 0 : page
    if (resetPage) setPage(0)

    const params = new URLSearchParams({ limit: String(LIMIT), page: String(p), sort: sortCol, order: sortOrder })
    if (search)    params.set('search', search)
    if (stage)     params.set('stage', stage)
    if (formation) params.set('formation', formation)
    if (classe)    params.set('classe', classe)

    try {
      const res = await fetch(`/api/crm/transactions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.data ?? [])
        setTotal(data.total ?? 0)
        setStats(data.stats ?? null)
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, formation, classe, sortCol, sortOrder, page])

  useEffect(() => { fetchData() }, [fetchData])

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchData(true), 300)
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortOrder('asc')
    }
  }

  const hasFilters = search || stage || formation || classe
  const totalPages = Math.ceil(total / LIMIT)

  function resetFilters() {
    setSearch(''); setStage(''); setFormation(''); setClasse('')
  }

  // Stage options for filter
  const stageOptions = ['', ...Object.keys(STAGE_MAP)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px', height: 52, background: '#1d2f4b',
        borderBottom: '1px solid #2d4a6b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GraduationCap size={14} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 13, color: '#ccac71', fontWeight: 700 }}>Transactions 2026-2027</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href="/admin/crm" style={{
            background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8,
            padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Users size={12} /> CRM Contacts
          </a>
          <a href="/admin" style={{
            background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8,
            padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <LayoutDashboard size={12} /> Dashboard
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: '#101e30',
        borderBottom: '1px solid #1a2f45',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0' }}>{total.toLocaleString('fr-FR')}</span>
            <span style={{ fontSize: 12, color: '#555870' }}>transactions</span>
          </div>
          {stats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(stats.stages).sort((a, b) => b[1] - a[1]).map(([id, count]) => {
                const s = STAGE_MAP[id]
                if (!s) return null
                return (
                  <button
                    key={id}
                    onClick={() => { setStage(stage === id ? '' : id); scheduleRefetch() }}
                    style={{
                      background: stage === id ? s.bg : 'transparent',
                      border: `1px solid ${stage === id ? s.color + '55' : 'transparent'}`,
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 9 }}>{s.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          style={{
            background: 'rgba(76,171,219,0.12)', border: '1px solid rgba(76,171,219,0.3)',
            borderRadius: 8, padding: '6px 12px', color: '#4cabdb', fontSize: 12,
            cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          Rafraîchir
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: '#0d1a28',
        borderBottom: '1px solid #1a2f45', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#0b1624', border: '1px solid #2d4a6b', borderRadius: 8,
          padding: '6px 12px', flex: '1 1 auto', maxWidth: 340,
        }}>
          <Search size={13} style={{ color: '#3a5070', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Rechercher une transaction…"
            value={search}
            onChange={e => { setSearch(e.target.value); scheduleRefetch() }}
            onKeyDown={e => { if (e.key === 'Enter') fetchData(true) }}
            style={{
              background: 'transparent', border: 'none', color: '#e8eaf0',
              fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit',
            }}
          />
          {search && (
            <button onClick={() => { setSearch(''); scheduleRefetch() }} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <DropFilter
          value={stage}
          onChange={v => { setStage(v); scheduleRefetch() }}
          options={stageOptions}
          placeholder="Toutes les étapes"
          format={v => (STAGE_MAP[v] ? STAGE_MAP[v].emoji + ' ' + STAGE_MAP[v].label : v)}
        />
        <DropFilter
          value={formation}
          onChange={v => { setFormation(v); scheduleRefetch() }}
          options={FORMATION_OPTIONS}
          placeholder="Toutes formations"
        />
        <DropFilter
          value={classe}
          onChange={v => { setClasse(v); scheduleRefetch() }}
          options={CLASSE_OPTIONS}
          placeholder="Toutes classes"
        />

        {hasFilters && (
          <button
            onClick={() => { resetFilters(); scheduleRefetch() }}
            style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '6px 12px', color: '#ef4444', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              gap: 5, fontWeight: 600,
            }}
          >
            <X size={11} /> Reset
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#555870' }}>
            <div style={{
              display: 'inline-block', width: 22, height: 22,
              border: '2px solid #2d4a6b', borderTopColor: '#4cabdb',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12,
            }} />
            <div style={{ fontSize: 13 }}>Chargement des transactions…</div>
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#555870' }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📋</div>
            <div style={{ fontWeight: 600, color: '#8b8fa8', marginBottom: 4 }}>Aucune transaction trouvée</div>
            <div style={{ fontSize: 12 }}>Modifiez vos filtres ou lancez une synchronisation CRM</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2d4a6b' }}>
                {[
                  { label: 'Transaction', col: 'dealname' as SortCol, width: '25%' },
                  { label: 'Formation', col: 'formation' as SortCol, width: '12%' },
                  { label: 'Classe actuelle', col: 'classe' as SortCol, width: '14%' },
                  { label: 'Zone / Localité', col: 'zone' as SortCol, width: '16%' },
                  { label: 'Étape', col: 'stage' as SortCol, width: '15%' },
                  { label: 'Créé le', col: 'created' as SortCol, width: '10%' },
                  { label: '', col: 'created' as SortCol, width: '8%' },
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap',
                      background: '#0d1624', position: 'sticky', top: 0, zIndex: 10,
                      width: h.width,
                    }}
                  >
                    {i < 6 ? (
                      <SortHeader label={h.label} col={h.col} currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const contactName = [tx.contact?.firstname, tx.contact?.lastname].filter(Boolean).join(' ') || '—'
                const zone = tx.contact?.zone_localite || tx.contact?.departement || '—'
                const isExpanded = expanded === tx.hubspot_deal_id
                const createdStr = tx.createdate
                  ? new Date(tx.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
                  : '—'

                return (
                  <Fragment key={tx.hubspot_deal_id}>
                    <tr
                      onClick={() => setExpanded(isExpanded ? null : tx.hubspot_deal_id)}
                      style={{
                        background: isExpanded ? 'rgba(45,74,107,0.3)' : 'transparent',
                        borderBottom: `1px solid ${isExpanded ? 'transparent' : '#16273a'}`,
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { if (!isExpanded) (e.currentTarget.style.background = 'rgba(29,47,75,0.6)') }}
                      onMouseLeave={e => { if (!isExpanded) (e.currentTarget.style.background = 'transparent') }}
                    >
                      {/* Transaction name + contact */}
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                          {tx.dealname || '(sans nom)'}
                        </div>
                        <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {contactName}
                        </div>
                      </td>

                      {/* Formation */}
                      <td style={{ padding: '11px 12px' }}>
                        {tx.formation ? (
                          <span style={{
                            background: 'rgba(204,172,113,0.10)', border: '1px solid rgba(204,172,113,0.25)',
                            borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 700,
                            color: '#ccac71', whiteSpace: 'nowrap',
                          }}>
                            {tx.formation}
                          </span>
                        ) : (
                          <span style={{ color: '#2d4a6b', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Classe */}
                      <td style={{ padding: '11px 12px' }}>
                        {tx.contact?.classe_actuelle ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <BookOpen size={11} style={{ color: '#5a6a7e', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#8b8fa8' }}>{tx.contact.classe_actuelle}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#2d4a6b', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Zone */}
                      <td style={{ padding: '11px 12px' }}>
                        {zone !== '—' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <MapPin size={11} style={{ color: '#5a6a7e', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {zone}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#2d4a6b', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Stage */}
                      <td style={{ padding: '11px 12px' }}>
                        <StageBadge stageId={tx.dealstage} />
                      </td>

                      {/* Date */}
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 11, color: '#4a5568', whiteSpace: 'nowrap' }}>{createdStr}</span>
                      </td>

                      {/* HubSpot link */}
                      <td style={{ padding: '11px 8px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <a
                          href={`https://app.hubspot.com/contacts/43296174/deal/${tx.hubspot_deal_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)',
                            borderRadius: 6, padding: '4px 8px', color: '#f97316', fontSize: 11,
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <ExternalLink size={10} /> HS
                        </a>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: 'rgba(0,0,0,0.2)', borderTop: '1px solid #2d4a6b', borderBottom: '1px solid #2d4a6b' }}>
                          <div style={{ padding: '18px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>

                            {/* Contact card */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2d4a6b', borderRadius: 10, padding: '14px 16px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Contact</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>{contactName}</div>
                              {tx.contact?.email && (
                                <a href={`mailto:${tx.contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4cabdb', fontSize: 12, textDecoration: 'none', marginBottom: 6 }}>
                                  <Mail size={11} />{tx.contact.email}
                                </a>
                              )}
                              {tx.contact?.phone && (
                                <a href={`tel:${tx.contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 12, textDecoration: 'none' }}>
                                  <Phone size={11} />{tx.contact.phone}
                                </a>
                              )}
                            </div>

                            {/* Formation & Classe */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2d4a6b', borderRadius: 10, padding: '14px 16px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Formation & Parcours</div>
                              {tx.formation && (
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#ccac71', marginBottom: 8 }}>{tx.formation}</div>
                              )}
                              {tx.contact?.classe_actuelle && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b8fa8', fontSize: 12, marginBottom: 4 }}>
                                  <BookOpen size={12} /> {tx.contact.classe_actuelle}
                                </div>
                              )}
                              {tx.closedate && (
                                <div style={{ fontSize: 12, color: '#555870', marginTop: 6 }}>
                                  📅 RDV : {new Date(tx.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                              )}
                            </div>

                            {/* Équipe */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2d4a6b', borderRadius: 10, padding: '14px 16px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Équipe</div>
                              {tx.closer ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <Avatar name={tx.closer.name} color={tx.closer.avatar_color} size={24} />
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e8eaf0' }}>{tx.closer.name}</div>
                                    <div style={{ fontSize: 10, color: '#555870' }}>Closer</div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: '#3a5070', marginBottom: 8 }}>Pas de closer assigné</div>
                              )}
                              {tx.telepro ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Avatar name={tx.telepro.name} color={tx.telepro.avatar_color} size={24} />
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e8eaf0' }}>{tx.telepro.name}</div>
                                    <div style={{ fontSize: 10, color: '#555870' }}>Télépro</div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: '#3a5070' }}>Pas de télépro assigné</div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7,
                padding: '6px 16px', color: page === 0 ? '#2d4a6b' : '#8b8fa8',
                cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              ← Précédent
            </button>
            <span style={{ fontSize: 12, color: '#555870' }}>
              Page {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7,
                padding: '6px 16px', color: page >= totalPages - 1 ? '#2d4a6b' : '#8b8fa8',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}
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

