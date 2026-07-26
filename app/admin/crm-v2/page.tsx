'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns3, Filter, Plus, Users } from 'lucide-react'
import {
  CrmV2Avatar,
  CrmV2Button,
  CrmV2Empty,
  CrmV2Header,
  CrmV2Link,
  CrmV2Page,
  CrmV2PillTabs,
  CrmV2Search,
  CrmV2Spinner,
  CrmV2Table,
  CrmV2Td,
  CrmV2Th,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  type CRMSavedView,
  CRM_DEFAULT_VIEWS,
  loadCRMViews,
  viewToParams,
} from '@/lib/crm-views'

interface ContactRow {
  hubspot_contact_id: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  hs_lead_status?: string
  hubspot_owner_id?: string
  telepro_name?: string
  owner_name?: string
  created_at?: string
  recent_conversion_event?: string
}

interface Owner {
  hubspot_owner_id: string
  email?: string
  firstname?: string
  lastname?: string
}

function contactName(c: ContactRow) {
  return [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || c.hubspot_contact_id
}

export default function ContactsV2Page() {
  const [views, setViews] = useState<CRMSavedView[]>(loadCRMViews)
  const [activeViewId, setActiveViewId] = useState('all')
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [total, setTotal] = useState(0)
  const [owners, setOwners] = useState<Owner[]>([])
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const limit = 50

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
      .catch(() => { /* keep defaults */ })

    fetch('/api/crm/owners')
      .then(r => (r.ok ? r.json() : null))
      .then(j => setOwners(j?.owners ?? []))
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
      // L’API contacts utilise `page` (0-based), pas `offset`.
      params.set('page', String(page))
      if (searchDebounced) params.set('search', searchDebounced)
      // Prefer view_id when the API supports server-side view resolution
      if (activeView.id && activeView.id !== 'all') {
        params.set('view_id', activeView.id)
      }

      const res = await fetch(`/api/crm/contacts?${params.toString()}`)
      const json = await res.json()
      // L’API renvoie `data` (pas `contacts`).
      const rows: ContactRow[] = json.data ?? json.contacts ?? []
      setContacts(rows)
      setTotal(typeof json.total === 'number' ? json.total : rows.length)
      setSelected(new Set())
    } catch {
      setContacts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [activeView, page, searchDebounced])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(0) }, [activeViewId, searchDebounced])

  const ownerLabel = (id?: string) => {
    if (!id) return null
    const o = owners.find(x => x.hubspot_owner_id === id)
    if (!o) return id
    return [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || id
  }

  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set())
    else setSelected(new Set(contacts.map(c => c.hubspot_contact_id)))
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <CrmV2Page>
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
              Version classique (complète)
            </CrmV2Button>
            <CrmV2Button variant="secondary">
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <CrmV2Search
              placeholder="Recherche"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 280 }}
            />
            <button
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', color: crmV2.link,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}
            >
              <Filter size={14} /> Filtrer
            </button>
            <button
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', color: crmV2.link,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}
            >
              <Columns3 size={14} /> Modifier les colonnes
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 28px 40px' }}>
        <div style={{
          background: crmV2.bg,
          border: `1px solid ${crmV2.border}`,
          borderRadius: crmV2.radiusLg,
          overflow: 'hidden',
          boxShadow: crmV2.shadow,
        }}>
          {loading ? (
            <CrmV2Spinner />
          ) : contacts.length === 0 ? (
            <CrmV2Empty
              icon={<Users size={28} />}
              title="Aucun contact"
              description="Aucun résultat pour cette vue ou cette recherche."
            />
          ) : (
            <>
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={selected.size === contacts.length && contacts.length > 0}
                        onChange={toggleAll}
                        aria-label="Tout sélectionner"
                      />
                    </CrmV2Th>
                    <CrmV2Th>Nom</CrmV2Th>
                    <CrmV2Th>E-mail</CrmV2Th>
                    <CrmV2Th>Téléphone</CrmV2Th>
                    <CrmV2Th>Statut</CrmV2Th>
                    <CrmV2Th>Propriétaire</CrmV2Th>
                    <CrmV2Th>Source</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => {
                    const name = contactName(c)
                    const owner = ownerLabel(c.hubspot_owner_id) || c.owner_name
                    return (
                      <tr key={c.hubspot_contact_id} style={{ background: selected.has(c.hubspot_contact_id) ? '#f0fafb' : undefined }}>
                        <CrmV2Td>
                          <input
                            type="checkbox"
                            checked={selected.has(c.hubspot_contact_id)}
                            onChange={() => toggleOne(c.hubspot_contact_id)}
                            aria-label={`Sélectionner ${name}`}
                          />
                        </CrmV2Td>
                        <CrmV2Td>
                          <CrmV2Link href={`/admin/crm-v2/contacts/${c.hubspot_contact_id}`}>
                            {name}
                          </CrmV2Link>
                        </CrmV2Td>
                        <CrmV2Td style={{ color: crmV2.textMuted }}>{c.email || '—'}</CrmV2Td>
                        <CrmV2Td style={{ color: crmV2.textMuted }}>{c.phone || '—'}</CrmV2Td>
                        <CrmV2Td>
                          {c.hs_lead_status ? (
                            <span style={{
                              display: 'inline-block',
                              background: crmV2.bgSoft,
                              border: `1px solid ${crmV2.border}`,
                              borderRadius: crmV2.radiusPill,
                              padding: '2px 10px',
                              fontSize: 12,
                              color: crmV2.textMuted,
                              fontWeight: 500,
                            }}>
                              {c.hs_lead_status}
                            </span>
                          ) : '—'}
                        </CrmV2Td>
                        <CrmV2Td>
                          {owner ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <CrmV2Avatar name={owner} />
                              <span>{owner}</span>
                            </span>
                          ) : (
                            <span style={{ color: crmV2.textMuted }}>Non attribué</span>
                          )}
                        </CrmV2Td>
                        <CrmV2Td style={{ color: crmV2.textMuted, maxWidth: 200 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.recent_conversion_event || '—'}
                          </span>
                        </CrmV2Td>
                      </tr>
                    )
                  })}
                </tbody>
              </CrmV2Table>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderTop: `1px solid ${crmV2.border}`,
                background: crmV2.bgSoft, fontSize: 13, color: crmV2.textMuted,
              }}>
                <span>
                  Page {page + 1} / {totalPages}
                  {selected.size > 0 && (
                    <span style={{ marginLeft: 12, color: crmV2.gold, fontWeight: 600 }}>
                      {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <CrmV2Button
                    variant="secondary"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    Précédent
                  </CrmV2Button>
                  <CrmV2Button
                    variant="secondary"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Suivant
                  </CrmV2Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </CrmV2Page>
  )
}
