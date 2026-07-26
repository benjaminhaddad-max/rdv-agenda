'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Users } from 'lucide-react'
import CRMContactsTable, { type CRMContact, type ContactInlinePatch } from '@/components/CRMContactsTable'
import {
  CrmV2Button,
  CrmV2Empty,
  CrmV2Header,
  CrmV2Page,
  CrmV2PillTabs,
  CrmV2Search,
  CrmV2Spinner,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  type CRMSavedView,
  CRM_DEFAULT_VIEWS,
  loadCRMViews,
  viewToParams,
} from '@/lib/crm-views'

const CRMEditDrawer = dynamic(() => import('@/components/CRMEditDrawer'), { ssr: false })

/**
 * Design B Contacts : chrome HubSpot + table CRM complète
 * (aperçu, ouvrir, colonnes, scroll, édition inline) — aucune feature retirée.
 */
export default function ContactsV2Page() {
  const [views, setViews] = useState<CRMSavedView[]>(loadCRMViews)
  const [activeViewId, setActiveViewId] = useState('all')
  const [contacts, setContacts] = useState<CRMContact[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(50)
  const [sortBy, setSortBy] = useState('contact_createdate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)
  type RdvUserLite = {
    id: string
    name: string
    role: string
    email?: string
    hubspot_owner_id?: string
    hubspot_user_id?: string
    avatar_color?: string
  }
  const [closers, setClosers] = useState<RdvUserLite[]>([])
  const [telepros, setTelepros] = useState<RdvUserLite[]>([])
  const [allUsers, setAllUsers] = useState<RdvUserLite[]>([])
  const [extraColumns, setExtraColumns] = useState<string[]>([])
  const [allCrmProps, setAllCrmProps] = useState<Array<{ name: string; label?: string; type?: string; groupName?: string }>>([])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    fetch('/api/crm/views')
      .then(r => (r.ok ? r.json() : null))
      .then((rows: Array<{
        id: string
        name: string
        filter_groups?: CRMSavedView['groups']
        preset_flags?: CRMSavedView['presetFlags']
      }> | null) => {
        if (!Array.isArray(rows) || rows.length === 0) return
        const mapped: CRMSavedView[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          groups: r.filter_groups ?? [],
          presetFlags: r.preset_flags ?? undefined,
          isDefault: false,
        }))
        setViews([...CRM_DEFAULT_VIEWS, ...mapped.filter(v => v.id !== 'all')])
      })
      .catch(() => {})

    fetch('/api/users?roles=closer,admin,telepro')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const users = (Array.isArray(j) ? j : (j?.users ?? [])) as RdvUserLite[]
        if (!Array.isArray(users)) return
        setAllUsers(users)
        setClosers(users.filter(u => u.role === 'closer' || u.role === 'admin'))
        setTelepros(users.filter(u => u.role === 'telepro'))
      })
      .catch(() => {})
  }, [])

  const activeView = useMemo(
    () => views.find(v => v.id === activeViewId) ?? views[0] ?? CRM_DEFAULT_VIEWS[0],
    [views, activeViewId]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = viewToParams(activeView)
      params.set('limit', String(limit))
      params.set('page', String(page))
      params.set('sort_by', sortBy)
      params.set('sort_dir', sortDir)
      if (searchDebounced) params.set('search', searchDebounced)
      if (activeView.id && activeView.id !== 'all') {
        params.set('view_id', activeView.id)
      }

      const res = await fetch(`/api/crm/contacts?${params.toString()}`)
      const json = await res.json()
      const rows: CRMContact[] = json.data ?? json.contacts ?? []
      setContacts(rows)
      setTotal(typeof json.total === 'number' ? json.total : rows.length)
      setSelectedIds(new Set())
    } catch {
      setContacts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [activeView, page, searchDebounced, limit, sortBy, sortDir])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [activeViewId, searchDebounced, limit])

  const handleContactPatched = (contactId: string, patch: ContactInlinePatch) => {
    setContacts(prev => prev.map(c => {
      if (c.hubspot_contact_id !== contactId) return c
      return { ...c, ...patch } as CRMContact
    }))
  }

  const closerSelectOptions = useMemo(
    () => closers
      .map(c => ({ id: c.hubspot_owner_id || c.id, label: c.name }))
      .filter(o => o.id),
    [closers]
  )
  const teleproSelectOptions = useMemo(
    () => telepros
      .map(t => ({ id: t.hubspot_user_id || t.hubspot_owner_id || t.id, label: t.name }))
      .filter(o => o.id),
    [telepros]
  )

  const ensureCrmPropsLoaded = useCallback(() => {
    if (allCrmProps.length > 0) return
    fetch('/api/crm/properties?object=contacts')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const props = j?.properties ?? j ?? []
        if (Array.isArray(props)) setAllCrmProps(props)
      })
      .catch(() => {})
  }, [allCrmProps.length])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <CrmV2Header
        title="Contacts"
        subtitle={
          <span>
            {total.toLocaleString('fr-FR')} contact{total > 1 ? 's' : ''}
            {' · '}
            <span style={{ color: crmV2.gold, fontWeight: 600 }}>Design B</span>
          </span>
        }
        actions={
          <>
            <CrmV2Button variant="ghost" onClick={() => { window.location.href = '/admin/crm' }}>
              Version classique
            </CrmV2Button>
            <CrmV2Button variant="secondary" onClick={() => { window.location.href = '/admin/crm' }}>
              <Plus size={14} /> Créer un contact
            </CrmV2Button>
          </>
        }
      />

      <div style={{ background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, padding: '16px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ overflowX: 'auto' }}>
            <CrmV2PillTabs
              items={views.slice(0, 12).map(v => ({ id: v.id, label: v.name }))}
              value={activeView.id}
              onChange={setActiveViewId}
            />
          </div>
          <CrmV2Search
            placeholder="Recherche"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
      </div>

      <div style={{ padding: '16px 20px 32px', flex: 1, minHeight: 0 }}>
        <div style={{
          background: crmV2.bg,
          border: `1px solid ${crmV2.border}`,
          borderRadius: crmV2.radiusLg,
          boxShadow: crmV2.shadow,
          // overflow auto (pas hidden) → scroll horizontal des colonnes
          overflow: 'auto',
        }}>
          {loading && contacts.length === 0 ? (
            <CrmV2Spinner />
          ) : contacts.length === 0 ? (
            <CrmV2Empty
              icon={<Users size={28} />}
              title="Aucun contact"
              description="Aucun résultat pour cette vue ou cette recherche."
            />
          ) : (
            <CRMContactsTable
              contacts={contacts}
              loading={loading}
              mode="admin"
              onRefresh={load}
              onContactPatched={handleContactPatched}
              selectedIds={selectedIds}
              onToggleSelect={id => {
                setSelectedIds(prev => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }}
              onSelectAll={ids => setSelectedIds(new Set(ids))}
              onDeselectAll={() => setSelectedIds(new Set())}
              onOpenDrawer={setDrawerContact}
              closerSelectOptions={closerSelectOptions}
              teleproSelectOptions={teleproSelectOptions}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={(col) => {
                if (col === sortBy) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
                else { setSortBy(col); setSortDir('desc') }
              }}
              allCrmProps={allCrmProps}
              extraColumns={extraColumns}
              onExtraColumnsChange={setExtraColumns}
              onRequestProps={ensureCrmPropsLoaded}
            />
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: `1px solid ${crmV2.border}`,
            background: crmV2.bgSoft, fontSize: 13, color: crmV2.textMuted,
            flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Par page :</span>
              {[25, 50, 100].map(n => (
                <CrmV2Button
                  key={n}
                  variant={limit === n ? 'gold' : 'secondary'}
                  onClick={() => setLimit(n)}
                  style={{ padding: '4px 10px' }}
                >
                  {n}
                </CrmV2Button>
              ))}
              {selectedIds.size > 0 && (
                <span style={{ marginLeft: 8, color: crmV2.gold, fontWeight: 600 }}>
                  {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Page {page + 1} / {totalPages}</span>
              <CrmV2Button variant="secondary" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                Précédent
              </CrmV2Button>
              <CrmV2Button variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
                Suivant
              </CrmV2Button>
            </div>
          </div>
        </div>
      </div>

      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers}
          telepros={telepros}
          allUsers={allUsers}
          onClose={() => setDrawerContact(null)}
          onRefresh={load}
        />
      )}
    </CrmV2Page>
  )
}
