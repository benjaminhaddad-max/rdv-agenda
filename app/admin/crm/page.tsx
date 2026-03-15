'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Search, LayoutDashboard, Users, X, ChevronDown, Zap, Bell, List, GraduationCap } from 'lucide-react'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'
import CRMEditDrawer from '@/components/CRMEditDrawer'
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

// Ces listes sont chargées dynamiquement depuis /api/crm/field-options
// (valeurs réellement présentes dans crm_contacts, telles que renvoyées par HubSpot)

// ── Vues prédéfinies ───────────────────────────────────────────────────────────
type ViewPreset = 'all' | 'a_attribuer' | 'recents'

const VIEW_PRESETS: { id: ViewPreset; label: string; description: string; icon: typeof List }[] = [
  {
    id: 'all',
    label: 'Tous les leads',
    description: 'Vue complète sans filtre',
    icon: List,
  },
  {
    id: 'a_attribuer',
    label: 'À attribuer',
    description: 'Sans télépro assigné (+ exclure un propriétaire)',
    icon: Zap,
  },
  {
    id: 'recents',
    label: 'Formulaires récents',
    description: 'Formulaire soumis dans les 3 derniers mois',
    icon: Bell,
  },
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
  if (period === 'today') return d.toDateString() === now.toDateString()
  if (period === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
    return d >= weekAgo
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
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
  const [syncing, setSyncing]         = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; label: string } | null>(null)
  const [lastSync, setLastSync]       = useState<SyncLog | null>(null)

  // Vue prédéfinie
  const [viewPreset, setViewPreset] = useState<ViewPreset>('all')

  // Server-side filters (déclenchent un appel API)
  const [search, setSearch]           = useState('')
  const [stage, setStage]             = useState('')
  const [closerHsId, setCloserHsId]   = useState('')
  const [teleproHsId, setTeleproHsId] = useState('')
  const [noTelepro, setNoTelepro]     = useState(false)
  const [ownerExclude, setOwnerExclude] = useState('')
  const [recentFormMonths, setRecentFormMonths] = useState(0)
  const [leadStatus, setLeadStatus]   = useState('')
  const [source, setSource]           = useState('')

  // Overrides des filtres par défaut
  const [showExternal, setShowExternal] = useState(false)  // montrer équipe externe (ex. Benjamin Delacour)
  const [allClasses, setAllClasses]     = useState(true)   // true = toutes classes (défaut) ; false = Terminale/Première/Seconde + récents seulement

  // Client-side filters (appliqués sur les données déjà chargées)
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')
  const [period, setPeriod]       = useState('')

  // Listes utilisateurs pour les dropdowns
  const [closers, setClosers]     = useState<RdvUser[]>([])
  const [telepros, setTelepros]   = useState<RdvUser[]>([])
  const [allUsers, setAllUsers]   = useState<RdvUser[]>([])

  // Options dynamiques depuis HubSpot (valeurs réelles)
  const [leadStatusOptions, setLeadStatusOptions] = useState<SelectOption[]>([{ id: '', label: 'Tous les statuts lead' }])
  const [sourceOptions, setSourceOptions]         = useState<SelectOption[]>([{ id: '', label: 'Toutes les origines' }])

  // Sélection en masse + drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTeleproId, setBulkTeleproId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Charger les utilisateurs ─────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/users?role=commercial').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setClosers(arr)
      setAllUsers(prev => [...prev.filter(u => u.role !== 'commercial'), ...arr])
    })
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setTelepros(arr)
      setAllUsers(prev => [...prev.filter(u => u.role !== 'telepro'), ...arr])
    })
    // Charger les valeurs réelles HubSpot pour statut lead + origine
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOptions([
          { id: '', label: 'Tous les statuts lead' },
          ...d.leadStatuses.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.sources?.length) {
        setSourceOptions([
          { id: '', label: 'Toutes les origines' },
          ...d.sources.map((v: string) => ({ id: v, label: v })),
        ])
      }
    })
  }, [])

  // ── Récupérer les contacts ───────────────────────────────────────────────────

  const fetchContacts = useCallback(async (resetPage = false) => {
    setLoading(true)
    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)

    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        page: String(currentPage),
      })
      if (search)               params.set('search', search)
      if (stage)                params.set('stage', stage)
      if (closerHsId)           params.set('closer_hs_id', closerHsId)
      if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
      if (noTelepro)            params.set('no_telepro', '1')
      if (ownerExclude)         params.set('owner_exclude', ownerExclude)
      if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
      if (showExternal)         params.set('show_external', '1')
      if (allClasses)           params.set('all_classes', '1')
      if (leadStatus)           params.set('lead_status', leadStatus)
      if (source)               params.set('source', source)

      const res = await fetch(`/api/crm/contacts?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, closerHsId, teleproHsId, noTelepro, ownerExclude, recentFormMonths, showExternal, allClasses, leadStatus, source, page])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchContacts(true), 300)
  }

  // ── Appliquer un preset de vue ────────────────────────────────────────────────

  function applyPreset(preset: ViewPreset) {
    setViewPreset(preset)
    // Reset les filtres server-side qui changent avec le preset
    setNoTelepro(preset === 'a_attribuer')
    setRecentFormMonths(preset === 'recents' ? 3 : 0)
    // Reset les filtres qui peuvent devenir incohérents
    if (preset !== 'all') {
      setStage(''); setCloserHsId(''); setTeleproHsId('')
    }
    // ownerExclude et search restent inchangés (Pascal peut les ajuster)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchContacts(true), 100)
  }

  // ── HubSpot sync ─────────────────────────────────────────────────────────────

  async function handleSync(full = false) {
    setSyncing(true)
    setSyncProgress(null)
    const headers = { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` }

    try {
      if (!full) {
        // Sync incrémental : un seul appel
        const res = await fetch('/api/cron/crm-sync?force=1', { headers })
        const data = await res.json()
        setLastSync({
          synced_at: new Date().toISOString(),
          contacts_upserted: data.contacts_upserted ?? 0,
          deals_upserted: data.deals_upserted ?? 0,
          duration_ms: data.duration_ms ?? 0,
          error_message: data.error ?? null,
        })
      } else {
        // Sync complet : premier appel (deals + premier chunk contacts)
        setSyncProgress({ done: 0, label: 'Sync deals + premiers contacts…' })
        const res1 = await fetch('/api/cron/crm-sync?full=1&force=1', { headers })
        const data1 = await res1.json()

        let totalContacts = data1.contacts_upserted ?? 0
        let cursor: string | null = data1.next_cursor ?? null

        setSyncProgress({ done: totalContacts, label: `${totalContacts.toLocaleString('fr')} contacts synchro…` })

        // Chunks suivants tant qu'il y a un cursor
        while (cursor) {
          const res = await fetch(`/api/cron/crm-sync?contact_cursor=${encodeURIComponent(cursor)}&force=1`, { headers })
          const data = await res.json()

          totalContacts += data.contacts_upserted ?? 0
          cursor = data.next_cursor ?? null

          setSyncProgress({
            done: totalContacts,
            label: cursor
              ? `${totalContacts.toLocaleString('fr')} contacts synchro…`
              : `✓ ${totalContacts.toLocaleString('fr')} contacts synchronisés`,
          })

          if (data.error) break
        }

        setLastSync({
          synced_at: new Date().toISOString(),
          contacts_upserted: totalContacts,
          deals_upserted: data1.deals_upserted ?? 0,
          duration_ms: 0,
          error_message: null,
        })
      }

      await fetchContacts(true)
    } catch { /* silent */ }
    finally {
      setSyncing(false)
      setTimeout(() => setSyncProgress(null), 4000)
    }
  }

  function formatSyncTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const min = Math.round(diff / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    return `il y a ${h}h`
  }

  // ── Filtres client-side ───────────────────────────────────────────────────────

  const displayed = filterClientSide(contacts, period, formation, classe)
  const totalPages = Math.ceil(total / LIMIT)

  const hasWithDeal  = contacts.filter(c => !!c.deal).length
  const hasNoTelepro = contacts.filter(c => c.deal && !c.deal.teleprospecteur).length
  const hasNoCloser  = contacts.filter(c => c.deal && !c.deal.closer).length

  const hasActiveFilters = search || stage || closerHsId || teleproHsId || formation || classe || period || noTelepro || ownerExclude || recentFormMonths > 0 || leadStatus || source

  function resetAll() {
    setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod('')
    setNoTelepro(false); setOwnerExclude(''); setRecentFormMonths(0)
    setLeadStatus(''); setSource('')
    setViewPreset('all')
    // On ne reset PAS showExternal ni allClasses (ce sont des préférences de vue, pas des filtres)
  }

  // ── Sélection en masse ────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectFirst(n: number) {
    const ids = displayed.slice(0, n).map(c => c.hubspot_contact_id)
    setSelectedIds(new Set(ids))
  }

  function selectAll() {
    setSelectedIds(new Set(displayed.map(c => c.hubspot_contact_id)))
  }

  async function handleBulkAssign() {
    if (!bulkTeleproId || selectedIds.size === 0) return
    setBulkAssigning(true)
    try {
      await fetch('/api/crm/contacts/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: [...selectedIds], teleprospecteur: bulkTeleproId }),
      })
      setSelectedIds(new Set())
      setBulkTeleproId('')
      await fetchContacts(true)
    } finally {
      setBulkAssigning(false)
    }
  }

  // ── Dropdown options ───────────────────────────────────────────────────────────

  // Dropdown options
  const closerOptions: SelectOption[] = [
    { id: '', label: 'Tous les closers' },
    ...closers.map(c => ({ id: c.hubspot_owner_id ?? c.id, label: c.name })),
  ]
  const teleproOptions: SelectOption[] = [
    { id: '', label: 'Tous les télépros' },
    ...telepros.map(t => ({ id: t.hubspot_user_id ?? t.id, label: t.name })),
  ]
  // Tous les utilisateurs avec un hubspot_owner_id (pour "Exclure propriétaire")
  const ownerExcludeOptions: SelectOption[] = [
    { id: '', label: 'Aucune exclusion' },
    ...allUsers
      .filter(u => u.hubspot_owner_id)
      .map(u => ({ id: u.hubspot_owner_id!, label: u.name })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
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
          <a href="/admin/crm/transactions" style={{ background: 'rgba(204,172,113,0.10)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '5px 12px', color: '#ccac71', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
            <GraduationCap size={12} /> Transactions 2026-2027
          </a>
          <a href="/admin" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <LayoutDashboard size={12} /> Dashboard
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* ── Sync bar ────────────────────────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => handleSync(false)}
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
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            title="Sync complet depuis sept. 2024 (premier lancement)"
            style={{
              background: 'transparent',
              border: '1px solid #1a2f45',
              borderRadius: 8,
              padding: '6px 10px',
              color: '#3a5070',
              fontSize: 11,
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            Sync complet
          </button>
          {syncProgress && syncing && (
            <span style={{ fontSize: 11, color: '#4cabdb', fontWeight: 600 }}>
              {syncProgress.label}
            </span>
          )}
          {!syncing && syncProgress && (
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
              {syncProgress.label}
            </span>
          )}
          {!syncProgress && lastSync && (
            <span style={{ fontSize: 11, color: lastSync.error_message ? '#ef4444' : '#3a5070' }}>
              {lastSync.error_message
                ? `⚠ ${lastSync.error_message}`
                : `✓ ${formatSyncTime(lastSync.synced_at)} · ${lastSync.contacts_upserted.toLocaleString('fr')} contacts · ${lastSync.deals_upserted} deals`
              }
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatChip value={total} label="contacts" color="#8b8fa8" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasWithDeal} label="avec deal" color="#4cabdb" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasNoTelepro} label="sans télépro" color="#ccac71" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasNoCloser} label="sans closer" color="#ef4444" />
        </div>
      </div>

      {/* ── Vue presets ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px 0',
        background: '#0b1624',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderBottom: '1px solid #1a2f45',
        paddingBottom: 0,
      }}>
        {VIEW_PRESETS.map(preset => {
          const Icon = preset.icon
          const isActive = viewPreset === preset.id
          const accentColor = preset.id === 'a_attribuer' ? '#ccac71' : preset.id === 'recents' ? '#4cabdb' : '#8b8fa8'
          return (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              title={preset.description}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${accentColor}` : '2px solid transparent',
                padding: '8px 14px 9px',
                color: isActive ? accentColor : '#555870',
                fontSize: 12,
                fontWeight: isActive ? 700 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={12} />
              {preset.label}
            </button>
          )
        })}

        {/* Séparateur + indicateur actif */}
        {viewPreset !== 'all' && (
          <span style={{ marginLeft: 6, fontSize: 11, color: '#3a5070' }}>
            {viewPreset === 'a_attribuer' && '— leads sans télépro assigné'}
            {viewPreset === 'recents' && '— formulaire soumis il y a moins de 3 mois'}
          </span>
        )}

        {/* Lien Transactions 2026-2027 */}
        <div style={{ marginLeft: 'auto' }}>
          <a
            href="/admin/crm/transactions"
            style={{
              background: 'rgba(204,172,113,0.10)',
              border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#ccac71',
              fontSize: 12,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            <GraduationCap size={13} />
            Transactions 2026-2027
          </a>
        </div>
      </div>

      {/* ── Bandeau filtres par défaut ──────────────────────────────────────── */}
      <div style={{
        padding: '6px 20px',
        background: '#090f1a',
        borderBottom: '1px solid #1a2f45',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: '#3a5070', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
          Filtres auto
        </span>

        {/* Toggle : filtre classe/date */}
        <button
          onClick={() => { setAllClasses(v => !v); scheduleRefetch() }}
          title={allClasses ? 'Toutes classes affichées — cliquer pour filtrer sur Terminale/Première/Seconde + récents' : 'Filtre actif : Terminale · Première · Seconde + formulaires depuis sept. 2025'}
          style={{
            background: allClasses ? 'rgba(76,171,219,0.1)' : 'rgba(204,172,113,0.1)',
            border: `1px solid ${allClasses ? 'rgba(76,171,219,0.3)' : 'rgba(204,172,113,0.35)'}`,
            borderRadius: 20,
            padding: '3px 10px',
            color: allClasses ? '#4cabdb' : '#ccac71',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 9 }}>●</span>
          {allClasses ? 'Toutes classes' : 'Terminale · Première · Seconde + récents'}
        </button>

        {/* Toggle : exclure équipe externe */}
        <button
          onClick={() => { setShowExternal(v => !v); scheduleRefetch() }}
          title={showExternal ? 'Équipe externe incluse' : 'Contacts équipe externe masqués (ex. Benjamin Delacour)'}
          style={{
            background: showExternal ? 'rgba(239,68,68,0.1)' : 'rgba(76,171,219,0.1)',
            border: `1px solid ${showExternal ? 'rgba(239,68,68,0.3)' : 'rgba(76,171,219,0.3)'}`,
            borderRadius: 20,
            padding: '3px 10px',
            color: showExternal ? '#ef4444' : '#4cabdb',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 9 }}>{showExternal ? '○' : '●'}</span>
          {showExternal ? 'Équipe externe visible' : 'Équipe externe masquée'}
          {showExternal && <span style={{ opacity: 0.5 }}>✕</span>}
        </button>

        <span style={{ fontSize: 10, color: '#2d4a6b', marginLeft: 4 }}>
          — cliquer pour activer/désactiver
        </span>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px',
        background: '#0d1a28',
        borderBottom: '1px solid #1a2f45',
        flexShrink: 0,
      }}>
        {/* Row 1: Search + reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#0b1624',
            border: '1px solid #2d4a6b',
            borderRadius: 8,
            padding: '7px 12px',
            flex: '1 1 auto',
            maxWidth: 380,
          }}>
            <Search size={13} style={{ color: '#3a5070', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Nom, email, téléphone…"
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

          <div style={{ width: 1, height: 24, background: '#2d4a6b', flexShrink: 0 }} />
          <FilterSelect
            value={leadStatus}
            onChange={v => { setLeadStatus(v); scheduleRefetch() }}
            options={leadStatusOptions}
          />
          <FilterSelect
            value={source}
            onChange={v => { setSource(v); scheduleRefetch() }}
            options={sourceOptions}
          />

          {/* Exclure propriétaire — utile en vue "À attribuer" pour exclure ex. Benjamin Delacour */}
          {ownerExcludeOptions.length > 1 && (
            <>
              <div style={{ width: 1, height: 24, background: '#2d4a6b', flexShrink: 0 }} />
              <FilterSelect
                value={ownerExclude}
                onChange={v => { setOwnerExclude(v); scheduleRefetch() }}
                options={ownerExcludeOptions}
                placeholder="Exclure propriétaire"
              />
            </>
          )}
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Filtres :</span>
            {noTelepro && <FilterPill label="Sans télépro" onRemove={() => { setNoTelepro(false); setViewPreset('all'); scheduleRefetch() }} />}
            {recentFormMonths > 0 && <FilterPill label={`Form. < ${recentFormMonths} mois`} onRemove={() => { setRecentFormMonths(0); setViewPreset('all'); scheduleRefetch() }} />}
            {stage && <FilterPill label={STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
            {formation && <FilterPill label={formation} onRemove={() => setFormation('')} />}
            {classe && <FilterPill label={classe} onRemove={() => setClasse('')} />}
            {closerHsId && <FilterPill label={closerOptions.find(o => o.id === closerHsId)?.label ?? 'Closer'} onRemove={() => { setCloserHsId(''); scheduleRefetch() }} />}
            {teleproHsId && <FilterPill label={teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
            {ownerExclude && <FilterPill label={`Excl. ${ownerExcludeOptions.find(o => o.id === ownerExclude)?.label ?? 'propriétaire'}`} onRemove={() => { setOwnerExclude(''); scheduleRefetch() }} />}
            {period && <FilterPill label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
            {leadStatus && <FilterPill label={leadStatusOptions.find(o => o.id === leadStatus)?.label ?? leadStatus} onRemove={() => { setLeadStatus(''); scheduleRefetch() }} />}
            {source && <FilterPill label={sourceOptions.find(o => o.id === source)?.label ?? source} onRemove={() => { setSource(''); scheduleRefetch() }} />}
            {search && <FilterPill label={`"${search}"`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
          </div>
        )}
      </div>

      {/* ── Table area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 20px' }}>
        {(formation || classe || period) && !loading && (
          <div style={{ padding: '10px 20px 6px', fontSize: 12, color: '#3a5070' }}>
            {displayed.length} résultat{displayed.length !== 1 ? 's' : ''} affiché{displayed.length !== 1 ? 's' : ''} sur {contacts.length} chargés
          </div>
        )}

        {/* ── Barre sélection en masse ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'rgba(13,30,52,0.98)', border: `1px solid #2d4a6b`,
            borderRadius: 10, padding: '10px 16px', margin: '8px 20px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4cabdb' }}>
              ☑ {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[25, 100, 500].map(n => (
                <button key={n} onClick={() => selectFirst(n)}
                  style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.3)', borderRadius: 6, padding: '4px 10px', color: '#4cabdb', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {n} premiers
                </button>
              ))}
              <button onClick={selectAll}
                style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, padding: '4px 10px', color: '#ccac71', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tout ({displayed.length})
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#555870', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Désélectionner
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#8b8fa8' }}>Assigner à :</span>
            <select
              value={bulkTeleproId}
              onChange={e => setBulkTeleproId(e.target.value)}
              style={{ background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 10px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit' }}
            >
              <option value="">— Choisir un télépro —</option>
              {telepros.map(u => (
                <option key={u.id} value={u.hubspot_user_id || u.id}>{u.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkTeleproId || bulkAssigning}
              style={{
                background: bulkTeleproId ? '#22c55e' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${bulkTeleproId ? '#22c55e' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: 8, padding: '6px 16px', color: '#fff', fontSize: 12,
                fontWeight: 700, cursor: bulkTeleproId ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', opacity: bulkAssigning ? 0.6 : 1,
              }}
            >
              {bulkAssigning ? 'Attribution…' : 'Assigner'}
            </button>
          </div>
        )}

        <div style={{ padding: '0 20px' }}>
        <CRMContactsTable
          contacts={displayed}
          loading={loading}
          mode="admin"
          onRefresh={() => fetchContacts()}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpenDrawer={setDrawerContact}
          leadStatusOptions={leadStatusOptions.filter(o => o.id !== '')}
          sourceOptions={sourceOptions.filter(o => o.id !== '')}
        /></div>

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

      {/* ── CRM Edit Drawer ─────────────────────────────────────────────────── */}
      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers}
          telepros={telepros}
          onClose={() => setDrawerContact(null)}
          onRefresh={() => fetchContacts()}
        />
      )}
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
