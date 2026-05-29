'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import CRMContactsTable, { type CRMContact } from './CRMContactsTable'
import CRMEditDrawer from './CRMEditDrawer'

// ── Constantes ──────────────────────────────────────────────────────────────
// Charte Diploma Santé 2026
const NAVY      = '#ffffff'      // bg page
const NAVY_BG   = '#f6f9fc'      // bg champs (bleu pâle charte) — ne PAS utiliser le bleu nuit pour le fond des inputs
const NAVY_BDR  = '#e5ddc8'      // bordures
const GOLD      = '#c6aa7c'      // doré charte
const BLUE      = '#4fabdb'      // bleu Diploma
const TEXT_DIM  = '#5b6b7a'      // texte secondaire (sur fond clair)
const TEXT_MID  = '#12314d'      // texte principal (bleu nuit charte) — pour la lisibilité

const POLL_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_USER_VIEW_POLL_MS ?? '30000')
  return Number.isFinite(raw) && raw >= 10000 ? raw : 30000
})()
const SEARCH_DEBOUNCE_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_SEARCH_DEBOUNCE_MS ?? '180')
  return Number.isFinite(raw) && raw >= 80 ? raw : 180
})()

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: BLUE },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#4a6070' },
}

interface RdvUser {
  id: string
  name: string
  role: string
  avatar_color?: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

type CrmPropertyMeta = {
  name: string
  label?: string
  type?: string
  groupName?: string
}

interface Props {
  ownerParam: 'telepro_id' | 'telepro_hs_id' | 'telepro_owner_hs_id' | 'closer_hs_id' | 'contact_owner_hs_id'
  ownerId: string
  mode: 'closer' | 'telepro'
  onTotalChange?: (n: number) => void
  initialSourceFilter?: string
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
export default function UserCRMView({ ownerParam, ownerId, mode, onTotalChange, initialSourceFilter }: Props) {
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
  const [filterSource, setFilterSource]         = useState(initialSourceFilter ?? '')
  // Filtres spécifiques contacts (mode télépro : "Mes Contacts")
  const [filterClasse, setFilterClasse]         = useState('')
  const [filterPeriod, setFilterPeriod]         = useState('')

  // mode='telepro' → filtres CONTACT ; mode='closer' → filtres TRANSACTION
  const isContactsView = mode === 'telepro'

  // ─ Sort
  // Tri par defaut : date de creation du contact (du plus recent au plus ancien)
  // → les nouveaux leads remontent automatiquement en haut de la liste.
  const [sortBy, setSortBy]   = useState('createdat_contact')
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
  const [zoneOpts, setZoneOpts]             = useState<string[]>([])
  const [allCrmProps, setAllCrmProps]       = useState<CrmPropertyMeta[]>([])
  const extraColsStorageKey = `crm-extra-columns-user-${mode}`
  const [extraColumns, setExtraColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(extraColsStorageKey)
      if (saved) return JSON.parse(saved) as string[]
    } catch {
      // ignore
    }
    return []
  })

  function persistExtraColumns(next: string[]) {
    setExtraColumns(next)
    try {
      localStorage.setItem(extraColsStorageKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contactsAbortRef = useRef<AbortController | null>(null)
  function handleSearchChange(v: string) {
    setSearch(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v)
      setPage(0)
    }, SEARCH_DEBOUNCE_MS)
  }

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!ownerId) return
    contactsAbortRef.current?.abort()
    const requestAbort = new AbortController()
    contactsAbortRef.current = requestAbort
    setLoading(true)
    try {
      const params = new URLSearchParams({
        [ownerParam]: ownerId,
        limit: String(limit),
        page: String(page),
        sort_by: sortBy,
        sort_dir: sortDir,
        exact_count: '1',
        no_cache: '1',
        all_classes: '1',     // afficher tous les leads, pas seulement les classes prioritaires
        show_external: '1',   // vue personnelle "Mes Contacts/Transactions" : on
                              // ne masque pas les contacts de l'équipe externe
                              // si le user en est le télépro/closer. L'exclusion
                              // équipe externe sert pour la vue admin globale,
                              // pas pour la vue personnelle d'un commercial.
      })
      if (debouncedSearch)    params.set('search',      debouncedSearch)
      if (!isContactsView && filterStage) params.set('stage', filterStage)
      if (filterLeadStatus)   params.set('lead_status', filterLeadStatus)
      if (filterFormation)    params.set('formation',   filterFormation)
      if (filterSource)       params.set('source',      filterSource)
      if (filterClasse)       params.set('classe',      filterClasse)
      if (filterPeriod)       params.set('period',      filterPeriod)
      if (extraColumns.length > 0) params.set('props', extraColumns.join(','))

      const res = await fetch(`/api/crm/contacts?${params}`, { signal: requestAbort.signal })
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        const t = data.total ?? 0
        setTotal(t)
        onTotalChange?.(t)
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        // garde l'etat precedent en cas d'erreur reseau
      }
    } finally {
      setLoading(false)
    }
  }, [ownerParam, ownerId, limit, page, sortBy, sortDir, debouncedSearch, filterStage, filterLeadStatus, filterFormation, filterSource, filterClasse, filterPeriod, isContactsView, onTotalChange, extraColumns])

  useEffect(() => { fetchContacts() }, [fetchContacts])
  useEffect(() => () => contactsAbortRef.current?.abort(), [])

  // Keep the header badge in sync automatically, even when new leads arrive
  // in the background (without a manual refresh).
  const refreshTotalOnly = useCallback(async () => {
    if (!ownerId) return
    try {
      const params = new URLSearchParams({
        [ownerParam]: ownerId,
        limit: '0',
        exact_count: '1',
        no_cache: '1',
        all_classes: '1',
        show_external: '1',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (!isContactsView && filterStage) params.set('stage', filterStage)
      if (filterLeadStatus) params.set('lead_status', filterLeadStatus)
      if (filterFormation) params.set('formation', filterFormation)
      if (filterSource) params.set('source', filterSource)
      if (filterClasse) params.set('classe', filterClasse)
      if (filterPeriod) params.set('period', filterPeriod)

      const res = await fetch(`/api/crm/contacts?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const t = data.total ?? 0
      setTotal(prev => (prev === t ? prev : t))
      onTotalChange?.(t)
    } catch {
      // Silent retry on next tick.
    }
  }, [
    ownerParam,
    ownerId,
    debouncedSearch,
    isContactsView,
    filterStage,
    filterLeadStatus,
    filterFormation,
    filterSource,
    filterClasse,
    filterPeriod,
    onTotalChange,
  ])

  useEffect(() => {
    setFilterSource(initialSourceFilter ?? '')
    setPage(0)
  }, [initialSourceFilter])

  useEffect(() => {
    if (!ownerId) return
    const tickMs = POLL_MS
    const id = setInterval(() => { void refreshTotalOnly() }, tickMs)
    const onFocus = () => { void refreshTotalOnly() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTotalOnly()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ownerId, refreshTotalOnly])

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

  // Propriétés CRM dispo pour le picker de colonnes dynamiques.
  useEffect(() => {
    fetch('/api/crm/properties?object=contacts&limit=2000')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.properties)) setAllCrmProps(d.properties as CrmPropertyMeta[])
      })
      .catch(() => {})
  }, [])

  // Fetch field options (force-cache : profite du Cache-Control s-maxage=3600 côté CDN Vercel)
  useEffect(() => {
    fetch('/api/crm/field-options', { cache: 'force-cache' })
      .then(r => r.json())
      .then(d => {
        if (d.leadStatuses?.length) setLeadStatusOpts(d.leadStatuses)
        if (d.formations?.length)   setFormationOpts(d.formations)
        if (d.sources?.length)      setSourceOpts(d.sources)
        if (d.zones?.length)        setZoneOpts(d.zones)
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
    setFilterSource(initialSourceFilter ?? '')
    setFilterClasse('')
    setFilterPeriod('')
    setSearch('')
    setDebouncedSearch('')
    setPage(0)
  }

  const hasActiveFilters = !!(filterStage || filterLeadStatus || filterFormation || filterSource || filterClasse || filterPeriod || debouncedSearch)
  const totalPages = Math.max(1, Math.ceil(total / limit))

  // Options pour CRMContactsTable (inline editing)
  const leadStatusOptions = leadStatusOpts.map(v => ({ id: v, label: v }))
  const sourceOptions     = sourceOpts.map(v => ({ id: v, label: v }))
  const closerSelectOptions = [
    { id: '', label: '— Aucun —' },
    ...closers.map(u => ({ id: u.hubspot_owner_id || u.id, label: u.name })),
  ]
  // Le champ crm_contacts.telepro_user_id peut contenir soit le hubspot_user_id,
  // soit le hubspot_owner_id (selon la source : sync vs assignation manuelle vs
  // deal.teleprospecteur). On ajoute donc les 2 IDs comme entrées séparées
  // (même label) pour que le lookup par ID fonctionne dans tous les cas.
  const teleproSelectOptions = [
    { id: '', label: '— Aucun —' },
    ...telepros.flatMap(u => {
      const opts: { id: string; label: string }[] = []
      if (u.hubspot_owner_id) opts.push({ id: u.hubspot_owner_id, label: u.name })
      if (u.hubspot_user_id && u.hubspot_user_id !== u.hubspot_owner_id) opts.push({ id: u.hubspot_user_id, label: u.name })
      if (opts.length === 0) opts.push({ id: u.id, label: u.name })
      return opts
    }),
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
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0e1e35', display: 'flex', alignItems: 'center', gap: 8 }}>
              {ownerParam === 'closer_hs_id' ? '🎯 Mes Transactions' : (ownerParam === 'telepro_id' || ownerParam === 'telepro_hs_id' || ownerParam === 'telepro_owner_hs_id') ? '👥 Mes Contacts' : '👥 Mes Contacts'}
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
              background: '#12314d',
              border: '1px solid #12314d',
              borderRadius: 8,
              padding: '7px 14px',
              color: '#ffffff',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
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
                color: '#0e1e35',
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

          {/* ── Filtres TRANSACTION (mode closer uniquement) ── */}
          {!isContactsView && (
            <FilterSelect value={filterStage} onChange={v => { setFilterStage(v); setPage(0) }}>
              <option value="">Toutes les étapes</option>
              {Object.entries(STAGE_MAP).map(([id, s]) => (
                <option key={id} value={id}>{s.label}</option>
              ))}
            </FilterSelect>
          )}

          {/* ── Filtres CONTACT (toujours, mais surtout en mode télépro) ── */}

          {/* Statut du lead — toujours affiché ; les options se peuplent à la volée
              depuis /api/crm/field-options (vraies valeurs HubSpot). */}
          <FilterSelect value={filterLeadStatus} onChange={v => { setFilterLeadStatus(v); setPage(0) }}>
            <option value="">Statut du lead</option>
            {leadStatusOpts.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>

          {/* Classe actuelle — propriété du contact (mode télépro / Mes Contacts) */}
          {isContactsView && (
            <FilterSelect value={filterClasse} onChange={v => { setFilterClasse(v); setPage(0) }}>
              <option value="">Toutes les classes</option>
              {['Troisième','Seconde','Première','Terminale','PASS','LSPS 1','LSPS 2','LSPS 3','LAS 1','LAS 2','LAS 3','Etudes médicales','Etudes Sup.','Autre'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </FilterSelect>
          )}

          {/* Formation demandée — toujours affiché ; options chargées à la volée */}
          <FilterSelect value={filterFormation} onChange={v => { setFilterFormation(v); setPage(0) }}>
            <option value="">Toutes formations</option>
            {formationOpts.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>

          {/* Origine */}
          <FilterSelect value={filterSource} onChange={v => { setFilterSource(v); setPage(0) }}>
            <option value="">Toutes les sources</option>
            {sourceOpts.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>

          {/* Période de création du contact (mode Mes Contacts) */}
          {isContactsView && (
            <FilterSelect value={filterPeriod} onChange={v => { setFilterPeriod(v); setPage(0) }}>
              <option value="">Toutes les dates</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="90d">3 derniers mois</option>
              <option value="365d">12 derniers mois</option>
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
          allCrmProps={allCrmProps}
          extraColumns={extraColumns}
          onExtraColumnsChange={persistExtraColumns}
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
            Page <strong style={{ color: '#0e1e35' }}>{page + 1}</strong> / {totalPages}
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
          preloadedLeadStatuses={leadStatusOpts}
          preloadedFormations={formationOpts}
          preloadedSources={sourceOpts}
          preloadedZones={zoneOpts}
        />
      )}
    </div>
  )
}
