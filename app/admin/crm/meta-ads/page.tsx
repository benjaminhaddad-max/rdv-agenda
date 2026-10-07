'use client'

import { useEffect, useState, useCallback, useMemo, Suspense, Fragment, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  Facebook, RefreshCw, CheckCircle2, Power, Trash2, ExternalLink, Loader2, ChevronDown, ChevronRight, Link2,
  Settings, Plus, FileText, Inbox, Layers,
} from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2CloseButton, CrmV2Drawer, CrmV2Empty, CrmV2Header, CrmV2Input,
  CrmV2Page, CrmV2Search, CrmV2SectionLabel, CrmV2Select, CrmV2Spinner, CrmV2StatusPill, CrmV2Table,
  CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { AdsBanner, AdsFaint, AdsIconTile, AdsMobileRow, AdsPillSelect, adsSpin } from '@/components/crm-v2/marketing2/ads/ui'
import { crmV2 } from '@/lib/crm-v2-theme'

export default function MetaAdsPageWrapper() {
  return (
    <Suspense fallback={<CrmV2Page><CrmV2Spinner /></CrmV2Page>}>
      <MetaAdsPage />
    </Suspense>
  )
}


type Page = {
  page_id: string
  page_name: string
  user_name: string | null
  subscribed: boolean
  active: boolean
  connected_at: string
  last_lead_at: string | null
  total_leads: number
}
type MetaQuestion = { key: string; label?: string; type?: string; options?: Array<{ key: string; value: string }> }
type FieldMapping = { crm_field: string; value_map?: Record<string, string> }
type Form = {
  form_id: string
  page_id: string
  name: string | null
  status: string | null
  leads_count: number
  origine_label: string | null
  default_owner_id: string | null
  workflow_id: string | null
  questions?: MetaQuestion[] | null
  field_mappings?: Record<string, FieldMapping> | null
}
type CrmProperty = {
  name: string
  label: string
  type: string
  field_type?: string
  options?: Array<{ value: string; label: string }>
  group_name?: string
}
type LeadEvent = {
  id: string
  leadgen_id: string
  form_id: string | null
  page_id: string | null
  contact_id: string | null
  contact_created: boolean
  status: string
  error: string | null
  received_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field_data: any[]
}
type Owner = { hubspot_owner_id: string; firstname?: string; lastname?: string; email?: string }

type View = 'forms' | 'leads' | 'mapping' | 'pages'

const FB_BLUE = '#1877F2'
const GREEN = '#16a34a'
const GREY = '#7c98b6'
const ORANGE = '#b45309'
const RED = '#d13a41'

/** Statut Meta d'un formulaire → libellé + couleur. */
function formStatus(status: string | null): { label: string; color: string } {
  switch (status) {
    case 'ACTIVE': return { label: 'Actif', color: GREEN }
    case 'PAUSED': return { label: 'En pause', color: GREY }
    case 'ARCHIVED': return { label: 'Archivé', color: GREY }
    case 'DELETED': return { label: 'Supprimé', color: GREY }
    case 'DRAFT': return { label: 'Brouillon', color: GREY }
    default: return { label: status || '?', color: GREY }
  }
}

/** État du mappage d'un formulaire (questions Meta → propriétés CRM). */
function mappingState(f: Form): { count: number; total: number; label: string; color: string | null } {
  const count = f.field_mappings ? Object.keys(f.field_mappings).length : 0
  const total = (f.questions || []).length
  if (count === 0) return { count, total, label: 'Mapper', color: null }
  if (total > 0 && count < total) {
    const missing = total - count
    return { count, total, label: `${missing} champ${missing > 1 ? 's' : ''} non mappé${missing > 1 ? 's' : ''}`, color: crmV2.gold }
  }
  return { count, total, label: `${count} mappé${count > 1 ? 's' : ''}`, color: GREEN }
}

function MetaAdsPage() {
  const params = useSearchParams()
  const [pages, setPages] = useState<Page[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [events, setEvents] = useState<LeadEvent[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [crmProps, setCrmProps] = useState<CrmProperty[]>([])
  const [mappingForm, setMappingForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Présentation : vue active, recherche, filtre par page, ligne ouverte (mobile)
  const [view, setView] = useState<View>('forms')
  const [formSearch, setFormSearch] = useState('')
  const [pageFilter, setPageFilter] = useState('')
  const [openFormId, setOpenFormId] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [pagesRes, metaRes] = await Promise.all([
        fetch('/api/meta/pages').then(r => r.json()),
        fetch('/api/crm/metadata').then(r => r.json()).catch(() => ({ owners: [] })),
      ])
      setPages(pagesRes.pages || [])
      setForms(pagesRes.forms || [])
      setEvents(pagesRes.events || [])
      setOwners(metaRes.owners || [])
      setCrmProps(metaRes.properties || [])
      if (pagesRes.error) setError(pagesRes.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Lit les query params connected= / error= du callback OAuth
  useEffect(() => {
    const connected = params.get('connected')
    const err = params.get('error')
    if (connected) setSuccess(`${connected} page${parseInt(connected) > 1 ? 's' : ''} connectée${parseInt(connected) > 1 ? 's' : ''} avec succès.`)
    if (err) setError(`Erreur Meta: ${err}`)
    if (connected || err) {
      // Nettoie l'URL
      window.history.replaceState({}, '', '/admin/crm/meta-ads')
    }
  }, [params])

  async function subscribe(pageId: string) {
    setBusy(pageId); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/meta/pages?action=subscribe&page_id=${pageId}`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSuccess('Webhook abonné. Les leads vont arriver en temps réel.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  async function refreshForms(pageId: string) {
    setBusy(pageId); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/meta/pages?action=refresh_forms&page_id=${pageId}`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSuccess(`${j.forms_count} formulaire(s) trouvé(s)`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  async function toggleActive(p: Page) {
    setBusy(p.page_id)
    try {
      await fetch('/api/meta/pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: p.page_id, active: !p.active }),
      })
      await load()
    } finally { setBusy(null) }
  }
  async function disconnect(pageId: string) {
    if (!confirm('Déconnecter cette page ? Les leads ne seront plus reçus.')) return
    setBusy(pageId)
    try {
      await fetch(`/api/meta/pages?page_id=${pageId}`, { method: 'DELETE' })
      await load()
    } finally { setBusy(null) }
  }
  async function updateForm(formId: string, patch: Partial<Form>) {
    await fetch('/api/meta/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_id: formId, ...patch }),
    })
    await load()
  }

  function connect() {
    window.location.href = '/api/meta/oauth/start'
  }

  function showPageForms(pageId: string) {
    setPageFilter(pageId)
    setView('forms')
  }

  // ── Données dérivées ──────────────────────────────────────────────────
  const pageName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of pages) m[p.page_id] = p.page_name
    return m
  }, [pages])

  const filteredForms = useMemo(() => {
    const search = formSearch.toLowerCase().trim()
    return forms.filter(f => {
      if (pageFilter && f.page_id !== pageFilter) return false
      if (!search) return true
      return (f.name || '').toLowerCase().includes(search) ||
        f.form_id.includes(search) ||
        (f.origine_label || '').toLowerCase().includes(search)
    })
  }, [forms, formSearch, pageFilter])

  // Onglet Mapping : recherche seule (le filtre par page n'y est pas affiché)
  const mappingForms = useMemo(() => {
    const search = formSearch.toLowerCase().trim()
    if (!search) return forms
    return forms.filter(f =>
      (f.name || '').toLowerCase().includes(search) ||
      f.form_id.includes(search) ||
      (f.origine_label || '').toLowerCase().includes(search))
  }, [forms, formSearch])

  const ownerOptions = owners.map(o => {
    const name = [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
    return <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>{name}</option>
  })

  const tabs = [
    { id: 'forms', label: 'Formulaires', count: forms.length },
    { id: 'leads', label: 'Leads reçus', count: events.length },
    { id: 'mapping', label: 'Mapping' },
    { id: 'pages', label: 'Pages connectées', count: pages.length },
  ]

  // ── Rendus partiels ───────────────────────────────────────────────────
  const fbTile = <AdsIconTile icon={<Facebook size={15} />} color={FB_BLUE} />

  function renderMappingButton(f: Form) {
    const m = mappingState(f)
    if (!m.color) {
      return (
        <CrmV2Button size="sm" variant="secondary" icon={<Link2 size={13} />} onClick={() => setMappingForm(f)}>
          Mapper
        </CrmV2Button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setMappingForm(f)}
        title="Modifier le mappage"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <CrmV2StatusPill label={m.label} color={m.color} />
      </button>
    )
  }

  function renderOrigineInput(f: Form, style?: CSSProperties) {
    return (
      <CrmV2Input
        type="text"
        defaultValue={f.origine_label || ''}
        placeholder={f.name || 'Meta Lead Ads'}
        onBlur={e => {
          if (e.target.value !== (f.origine_label || '')) {
            updateForm(f.form_id, { origine_label: e.target.value })
          }
        }}
        style={{ height: 32, ...style }}
      />
    )
  }

  function renderOwnerSelect(f: Form, style?: CSSProperties) {
    return (
      <CrmV2Select
        defaultValue={f.default_owner_id || ''}
        onChange={e => updateForm(f.form_id, { default_owner_id: e.target.value })}
        style={{ height: 32, ...style }}
      >
        <option value="">— Aucun —</option>
        {ownerOptions}
      </CrmV2Select>
    )
  }

  function renderForms() {
    const pageSelect = pages.length > 1 && (
      <AdsPillSelect
        icon={<Facebook size={14} />}
        value={pageFilter}
        onChange={e => setPageFilter(e.target.value)}
        aria-label="Page"
        style={isMobile ? { flex: '1 1 100%' } : undefined}
      >
        <option value="">Toutes les pages</option>
        {pages.map(p => <option key={p.page_id} value={p.page_id}>{p.page_name}</option>)}
      </AdsPillSelect>
    )
    return (
      <CrmV2TableCard
        toolbar={
          <>
            <CrmV2Search
              placeholder="Rechercher un formulaire…"
              value={formSearch}
              onChange={e => setFormSearch(e.target.value)}
              style={{ flex: isMobile ? '1 1 100%' : '0 1 280px' }}
            />
            {pageSelect}
          </>
        }
        footer={
          <span>
            {filteredForms.length} formulaire{filteredForms.length > 1 ? 's' : ''}
            {filteredForms.length !== forms.length ? ` sur ${forms.length}` : ''}
          </span>
        }
      >
        {forms.length === 0 ? (
          <CrmV2Empty
            icon={<FileText size={22} />}
            title="Aucun formulaire trouvé"
            description={pages.length === 0
              ? 'Clique sur « Connecter un formulaire » pour autoriser tes pages Facebook.'
              : 'Clique sur « Actualiser les formulaires » dans l’onglet Pages connectées pour les charger.'}
          />
        ) : filteredForms.length === 0 ? (
          <CrmV2Empty icon={<FileText size={22} />} title={formSearch ? `Aucun formulaire ne correspond à « ${formSearch} »` : 'Aucun formulaire pour cette page'} />
        ) : isMobile ? (
          <div>
            {filteredForms.map(f => {
              const st = formStatus(f.status)
              const open = openFormId === f.form_id
              return (
                <AdsMobileRow
                  key={f.form_id}
                  icon={fbTile}
                  title={f.name || '(sans nom)'}
                  subtitle={`${pageName[f.page_id] || f.page_id} · ${f.leads_count} lead${f.leads_count > 1 ? 's' : ''}`}
                  right={
                    <>
                      <CrmV2StatusPill label={st.label} color={st.color} />
                      {open ? <ChevronDown size={16} color={crmV2.textMuted} /> : <ChevronRight size={16} color={crmV2.textMuted} />}
                    </>
                  }
                  onClick={() => setOpenFormId(open ? null : f.form_id)}
                >
                  {open && (
                    <div style={{ display: 'grid', gap: 8, padding: '6px 0 6px 38px' }}>
                      <AdsFaint>{f.form_id}</AdsFaint>
                      <label style={mobileLabel}>Origine (CRM){renderOrigineInput(f, { height: 40 })}</label>
                      <label style={mobileLabel}>Owner par défaut{renderOwnerSelect(f, { height: 40 })}</label>
                      <div>{renderMappingButton(f)}</div>
                    </div>
                  )}
                </AdsMobileRow>
              )
            })}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Nom</CrmV2Th>
                <CrmV2Th>Statut</CrmV2Th>
                <CrmV2Th>Origine (CRM)</CrmV2Th>
                <CrmV2Th>Owner par défaut</CrmV2Th>
                <CrmV2Th>Mapping</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Leads</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {filteredForms.map(f => {
                const st = formStatus(f.status)
                return (
                  <CrmV2Tr key={f.form_id}>
                    <CrmV2Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {fbTile}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
                            {f.name || '(sans nom)'}
                          </div>
                          <AdsFaint>{pages.length > 1 ? `${pageName[f.page_id] || f.page_id} · ` : ''}{f.form_id}</AdsFaint>
                        </div>
                      </div>
                    </CrmV2Td>
                    <CrmV2Td><CrmV2StatusPill label={st.label} color={st.color} /></CrmV2Td>
                    <CrmV2Td style={{ minWidth: 180 }}>{renderOrigineInput(f, { maxWidth: 240 })}</CrmV2Td>
                    <CrmV2Td style={{ minWidth: 170 }}>{renderOwnerSelect(f, { maxWidth: 220 })}</CrmV2Td>
                    <CrmV2Td>{renderMappingButton(f)}</CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.leads_count}</CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>
    )
  }

  function renderLeadStatus(e: LeadEvent) {
    return (
      <>
        {e.status === 'processed' && <CrmV2StatusPill label={`OK ${e.contact_created ? '(créé)' : '(màj)'}`} color={GREEN} />}
        {e.status === 'error' && <span title={e.error || ''}><CrmV2StatusPill label="Erreur" color={RED} /></span>}
        {e.status === 'pending' && <CrmV2StatusPill label="En attente" color={ORANGE} />}
      </>
    )
  }

  function renderLeads() {
    return (
      <CrmV2TableCard footer={<span>{events.length} derniers leads reçus</span>}>
        {events.length === 0 ? (
          <CrmV2Empty icon={<Inbox size={22} />} title="Aucun lead reçu pour l’instant" />
        ) : isMobile ? (
          <div>
            {events.map(e => {
              const form = forms.find(f => f.form_id === e.form_id)
              const fd = (Array.isArray(e.field_data) ? e.field_data : []) as { name: string; values: string[] }[]
              return (
                <AdsMobileRow
                  key={e.id}
                  icon={<AdsIconTile icon={<Inbox size={15} />} color={crmV2.link} />}
                  title={fd.slice(0, 2).map(f => f.values?.[0] || '').filter(Boolean).join(' · ') || form?.name || e.form_id || '?'}
                  subtitle={`${new Date(e.received_at).toLocaleString('fr-FR')} · ${form?.name || e.form_id || '?'}`}
                  right={
                    <>
                      {renderLeadStatus(e)}
                      {e.contact_id && (
                        <Link href={`/admin/crm/contacts/${e.contact_id}`} aria-label="Voir le contact" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, color: crmV2.link }}>
                          <ExternalLink size={16} />
                        </Link>
                      )}
                    </>
                  }
                />
              )
            })}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Reçu</CrmV2Th>
                <CrmV2Th>Formulaire</CrmV2Th>
                <CrmV2Th>Statut</CrmV2Th>
                <CrmV2Th>Contact</CrmV2Th>
                <CrmV2Th>Données</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => {
                const form = forms.find(f => f.form_id === e.form_id)
                return (
                  <CrmV2Tr key={e.id}>
                    <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>{new Date(e.received_at).toLocaleString('fr-FR')}</CrmV2Td>
                    <CrmV2Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {fbTile}
                        <span style={{ fontWeight: 600 }}>{form?.name || e.form_id || '?'}</span>
                      </div>
                    </CrmV2Td>
                    <CrmV2Td>{renderLeadStatus(e)}</CrmV2Td>
                    <CrmV2Td>
                      {e.contact_id
                        ? <Link href={`/admin/crm/contacts/${e.contact_id}`} style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Voir <ExternalLink size={14} /></Link>
                        : '—'}
                    </CrmV2Td>
                    <CrmV2Td style={{ color: crmV2.textMuted }}>
                      {(Array.isArray(e.field_data) ? e.field_data : []).slice(0, 4).map((f: { name: string; values: string[] }, i: number) => (
                        <span key={`${f.name || 'f'}-${i}`} style={{ marginRight: 10 }}>
                          <strong style={{ color: crmV2.text }}>{f.name}</strong>: {f.values?.[0] || ''}
                        </span>
                      ))}
                    </CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>
    )
  }

  function renderMapping() {
    return (
      <CrmV2TableCard
        toolbar={
          <CrmV2Search
            placeholder="Rechercher un formulaire…"
            value={formSearch}
            onChange={e => setFormSearch(e.target.value)}
            style={{ flex: isMobile ? '1 1 100%' : '0 1 280px' }}
          />
        }
        footer={<span>Associe chaque question du formulaire Facebook à une propriété du CRM.</span>}
      >
        {mappingForms.length === 0 ? (
          <CrmV2Empty icon={<Layers size={22} />} title="Aucun formulaire à mapper" />
        ) : isMobile ? (
          <div>
            {mappingForms.map(f => {
              const m = mappingState(f)
              return (
                <AdsMobileRow
                  key={f.form_id}
                  icon={fbTile}
                  title={f.name || '(sans nom)'}
                  subtitle={`${m.count} / ${m.total} question${m.total > 1 ? 's' : ''} mappée${m.count > 1 ? 's' : ''}`}
                  right={<ChevronRight size={16} color={crmV2.textMuted} />}
                  onClick={() => setMappingForm(f)}
                />
              )
            })}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Formulaire</CrmV2Th>
                <CrmV2Th>Page</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Questions</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Champs mappés</CrmV2Th>
                <CrmV2Th>État</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>{''}</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {mappingForms.map(f => {
                const m = mappingState(f)
                return (
                  <CrmV2Tr key={f.form_id} onClick={() => setMappingForm(f)}>
                    <CrmV2Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {fbTile}
                        <span style={{ fontWeight: 600, color: crmV2.link }}>{f.name || '(sans nom)'}</span>
                      </div>
                    </CrmV2Td>
                    <CrmV2Td style={{ color: crmV2.textMuted }}>{pageName[f.page_id] || f.page_id}</CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right' }}>{m.total}</CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right' }}>{m.count}</CrmV2Td>
                    <CrmV2Td>
                      {m.color
                        ? <CrmV2StatusPill label={m.count >= m.total && m.total > 0 ? 'Complet' : m.label} color={m.color} />
                        : <CrmV2StatusPill label="Non mappé" color={GREY} />}
                    </CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right' }}>
                      <CrmV2Button size="sm" variant="secondary" icon={<Link2 size={13} />}>Configurer</CrmV2Button>
                    </CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>
    )
  }

  function renderPageActions(p: Page) {
    const isBusy = busy === p.page_id
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
        {!p.subscribed && (
          <CrmV2Button size="sm" variant="primary" icon={<Power size={13} />} onClick={() => subscribe(p.page_id)} disabled={isBusy}>
            Abonner webhook
          </CrmV2Button>
        )}
        <CrmV2Button
          size="sm"
          variant="secondary"
          icon={<RefreshCw size={13} style={isBusy ? adsSpin : undefined} />}
          onClick={() => refreshForms(p.page_id)}
          disabled={isBusy}
        >
          Actualiser les formulaires
        </CrmV2Button>
        <CrmV2Button size="sm" variant="secondary" onClick={() => toggleActive(p)} disabled={isBusy}>
          {p.active ? 'Désactiver' : 'Activer'}
        </CrmV2Button>
        <CrmV2Button size="sm" variant="danger" onClick={() => disconnect(p.page_id)} disabled={isBusy} title="Déconnecter" aria-label="Déconnecter la page">
          <Trash2 size={13} />
        </CrmV2Button>
      </div>
    )
  }

  function renderPageStatus(p: Page) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {p.subscribed
          ? <CrmV2StatusPill label="Webhook actif" color={GREEN} />
          : <CrmV2StatusPill label="Webhook non abonné" color={ORANGE} />}
        {!p.active && <CrmV2StatusPill label="Désactivée" color={RED} />}
      </div>
    )
  }

  function renderPages() {
    return (
      <CrmV2TableCard footer={<span>{pages.length} page{pages.length > 1 ? 's' : ''} connectée{pages.length > 1 ? 's' : ''}</span>}>
        {pages.length === 0 ? (
          <CrmV2Empty
            icon={<Facebook size={22} />}
            title="Aucune page connectée"
            description="Clique sur « Connecter un formulaire » pour démarrer."
            action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={connect}>Connecter un formulaire</CrmV2Button>}
          />
        ) : isMobile ? (
          <div>
            {pages.map(p => {
              const count = forms.filter(f => f.page_id === p.page_id).length
              return (
                <AdsMobileRow
                  key={p.page_id}
                  icon={fbTile}
                  title={p.page_name}
                  subtitle={`${p.total_leads} lead${p.total_leads > 1 ? 's' : ''} reçus · ${count} formulaire${count > 1 ? 's' : ''} · par ${p.user_name || '?'}`}
                  right={p.subscribed ? <CrmV2StatusPill label="Actif" color={GREEN} /> : <CrmV2StatusPill label="Non abonné" color={ORANGE} />}
                  onClick={() => showPageForms(p.page_id)}
                >
                  <div style={{ display: 'grid', gap: 6, padding: '4px 0 6px 38px' }}>
                    {(!p.active || p.last_lead_at) && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {!p.active && <CrmV2StatusPill label="Désactivée" color={RED} />}
                        {p.last_lead_at && <AdsFaint>Dernier : {new Date(p.last_lead_at).toLocaleString('fr-FR')}</AdsFaint>}
                      </div>
                    )}
                    {renderPageActions(p)}
                  </div>
                </AdsMobileRow>
              )
            })}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Page</CrmV2Th>
                <CrmV2Th>Statut</CrmV2Th>
                <CrmV2Th>Connectée par</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Formulaires</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Leads reçus</CrmV2Th>
                <CrmV2Th>Dernier lead</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Actions</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pages.map(p => {
                const count = forms.filter(f => f.page_id === p.page_id).length
                return (
                  <CrmV2Tr key={p.page_id}>
                    <CrmV2Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {fbTile}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: crmV2.text, whiteSpace: 'nowrap' }}>{p.page_name}</div>
                          <AdsFaint>{p.page_id}</AdsFaint>
                        </div>
                      </div>
                    </CrmV2Td>
                    <CrmV2Td>{renderPageStatus(p)}</CrmV2Td>
                    <CrmV2Td style={{ color: crmV2.textMuted }}>{p.user_name || '?'}</CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => showPageForms(p.page_id)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: crmV2.link, fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}
                      >
                        {count}
                      </button>
                    </CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right', fontWeight: 600 }}>{p.total_leads}</CrmV2Td>
                    <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                      {p.last_lead_at ? new Date(p.last_lead_at).toLocaleString('fr-FR') : '—'}
                    </CrmV2Td>
                    <CrmV2Td>{renderPageActions(p)}</CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>
    )
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Meta Lead Ads"
        subtitle="Formulaires Facebook / Instagram connectés au CRM"
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<Settings size={14} />} onClick={() => setView('pages')}>
              Comptes publicitaires
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={connect} title="Connecter une page Facebook">
              Connecter un formulaire
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs bordered={false} items={tabs} value={view} onChange={id => setView(id as View)} />
      </CrmV2Header>

      <CrmV2Body>
        {error && <AdsBanner kind="error">{error}</AdsBanner>}
        {success && <AdsBanner kind="success">{success}</AdsBanner>}

        {loading ? (
          <CrmV2Card><CrmV2Spinner /></CrmV2Card>
        ) : (
          <>
            {view === 'forms' && renderForms()}
            {view === 'leads' && renderLeads()}
            {view === 'mapping' && renderMapping()}
            {view === 'pages' && renderPages()}
          </>
        )}

        {/* Aide */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 18 }}>
          <CrmV2SectionLabel icon={<CheckCircle2 size={14} color={crmV2.gold} />}>Comment ça marche</CrmV2SectionLabel>
          <ol style={{ fontSize: 13, color: crmV2.textMuted, margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Clique « Connecter un formulaire » → tu autorises l&apos;app sur Facebook</li>
            <li>Clique « Actualiser les formulaires » sur la page (onglet Pages connectées) → on récupère tes formulaires Lead Ads</li>
            <li>Clique « Abonner webhook » → tu recevras les leads en temps réel</li>
            <li>Configure pour chaque formulaire : un libellé d&apos;origine + un owner par défaut</li>
          </ol>
        </CrmV2Card>
      </CrmV2Body>

      {/* Modal mapping */}
      {mappingForm && (
        <MappingModal
          form={mappingForm}
          crmProps={crmProps}
          onClose={() => setMappingForm(null)}
          onSave={async (mappings) => {
            await updateForm(mappingForm.form_id, { field_mappings: mappings })
            setMappingForm(null)
            setSuccess('Mapping enregistré')
          }}
        />
      )}
    </CrmV2Page>
  )
}

const mobileLabel: CSSProperties = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: crmV2.textMuted }

// ─── Helpers de mapping ─────────────────────────────────────────────────────

// Synonymes Meta → CRM. Priorité absolue sur le match littéral du nom CRM,
// car les noms HubSpot custom (ex: niveau_dtudes) ne sont pas ceux qu'on
// veut. Le matching est substring (cf. autoSuggest), donc `niveau` couvre
// `niveau_d_etudes`, `niveau_d_études`, etc. Pas besoin de tout lister.
const META_FIELD_MAP_HARDCODED: Record<string, string> = {
  email: 'email',
  full_name: 'firstname',
  first_name: 'firstname',
  last_name: 'lastname',
  phone_number: 'phone',
  phone: 'phone',
  city: 'zone_localite',
  zip: 'departement',
  postal_code: 'departement',
  state: 'zone_localite',
  // Particularité Diploma : niveau d'études → classe actuelle
  niveau: 'classe_actuelle',
  classe: 'classe_actuelle',
  classe_actuelle: 'classe_actuelle',
  formation: 'formation_souhaitee',
}

function autoSuggest(metaKey: string, crmProps: CrmProperty[]): string | null {
  const m = metaKey.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!m) return null
  const propExists = (name: string) => crmProps.some(p => p.name === name)

  // 1. Synonymes : match exact sur la clé lowercase brute (rapide, gère les cas standards)
  const direct = META_FIELD_MAP_HARDCODED[metaKey.toLowerCase()]
  if (direct && propExists(direct)) return direct

  // 2. Synonymes : match substring (priorité sur le match littéral CRM)
  // Plus longue clé d'abord pour préférer les synonymes spécifiques.
  const sortedKeys = Object.keys(META_FIELD_MAP_HARDCODED).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normKey.length >= 4 && (m.includes(normKey) || normKey.includes(m))) {
      const target = META_FIELD_MAP_HARDCODED[key]
      if (propExists(target)) return target
    }
  }

  // 3. Match exact sur le nom CRM normalisé
  for (const p of crmProps) {
    if (p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === m) return p.name
  }

  // 4. Match par préfixe sur le nom CRM
  for (const p of crmProps) {
    const pn = p.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (pn.length >= 4 && (m.startsWith(pn) || pn.startsWith(m))) return p.name
  }

  return null
}

function autoSuggestValue(metaValue: string, crmOptions: Array<{ value: string; label: string }>): string | null {
  if (!metaValue) return null
  const m = metaValue.toLowerCase().trim()
  for (const o of crmOptions) {
    if (o.value.toLowerCase() === m || o.label.toLowerCase() === m) return o.value
  }
  // Match partiel (ex: "troisième" → "Troisième")
  for (const o of crmOptions) {
    const ov = o.value.toLowerCase()
    const ol = o.label.toLowerCase()
    if (ov.includes(m) || m.includes(ov) || ol.includes(m) || m.includes(ol)) return o.value
  }
  return null
}

// ─── MappingModal ────────────────────────────────────────────────────────────

function MappingModal({
  form,
  crmProps,
  onClose,
  onSave,
}: {
  form: Form
  crmProps: CrmProperty[]
  onClose: () => void
  onSave: (mappings: Record<string, FieldMapping>) => Promise<void>
}) {
  const questions = (form.questions || []) as MetaQuestion[]
  const initial = form.field_mappings || {}

  // Init l'état : pour chaque question, soit le mapping existant, soit l'auto-suggestion
  const [mappings, setMappings] = useState<Record<string, FieldMapping>>(() => {
    const init: Record<string, FieldMapping> = {}
    for (const q of questions) {
      if (initial[q.key]) {
        init[q.key] = initial[q.key]
      } else {
        const suggested = autoSuggest(q.key, crmProps)
        if (suggested) init[q.key] = { crm_field: suggested }
      }
    }
    return init
  })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const isMobile = useIsMobile()

  function setField(key: string, crmField: string) {
    setMappings(prev => {
      const next = { ...prev }
      if (!crmField) {
        delete next[key]
      } else {
        // Si on change de prop CRM, on reset le value_map
        const existing = prev[key]
        if (existing?.crm_field !== crmField) {
          next[key] = { crm_field: crmField }
          // Auto-suggère le value_map si la nouvelle prop a des options
          const prop = crmProps.find(p => p.name === crmField)
          const q = questions.find(qq => qq.key === key)
          if (prop?.options?.length && q?.options?.length) {
            const vm: Record<string, string> = {}
            for (const opt of q.options) {
              const sugg = autoSuggestValue(opt.value, prop.options)
              if (sugg) vm[opt.value] = sugg
            }
            if (Object.keys(vm).length) next[key] = { crm_field: crmField, value_map: vm }
          }
        } else {
          next[key] = { ...existing, crm_field: crmField }
        }
      }
      return next
    })
  }

  function setValueMap(key: string, metaValue: string, crmValue: string) {
    setMappings(prev => {
      const next = { ...prev }
      const existing = next[key]
      if (!existing) return prev
      const vm = { ...(existing.value_map || {}) }
      if (!crmValue) delete vm[metaValue]
      else vm[metaValue] = crmValue
      next[key] = { ...existing, value_map: Object.keys(vm).length ? vm : undefined }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(mappings) } finally { setSaving(false) }
  }

  // Filtrage des props CRM par recherche
  const filteredProps = search.trim()
    ? crmProps.filter(p => {
        const s = search.toLowerCase()
        return p.name.toLowerCase().includes(s) || p.label.toLowerCase().includes(s)
      })
    : crmProps

  const pad = isMobile ? 12 : 18

  return (
    <CrmV2Drawer
      open
      onClose={onClose}
      width={760}
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: crmV2.text }}>Mappage de champs</div>
            <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2, wordBreak: 'break-word' }}>{form.name || form.form_id}</div>
          </div>
          <CrmV2CloseButton onClick={onClose} />
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <CrmV2Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </CrmV2Button>
          <CrmV2Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            icon={saving ? <Loader2 size={14} style={adsSpin} /> : <CheckCircle2 size={14} />}
          >
            Enregistrer
          </CrmV2Button>
        </div>
      }
    >
      {/* Recherche */}
      <div style={{ padding: `12px ${pad}px`, borderBottom: `1px solid ${crmV2.border}` }}>
        <CrmV2Search
          placeholder="Rechercher une propriété CRM…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      {/* Corps — table de mapping */}
      <div style={{ padding: `4px ${pad}px 12px` }}>
        {questions.length === 0 ? (
          <CrmV2Empty
            icon={<Layers size={22} />}
            title="Aucune question trouvée pour ce formulaire"
            description="Actualise les formulaires de la page d’abord."
          />
        ) : (
          // Mobile : largeur fixe des colonnes pour que les selects ne poussent pas le panneau
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'separate', borderSpacing: 0, ...(isMobile ? { tableLayout: 'fixed' as const } : {}) }}>
            <thead>
              <tr>
                <CrmV2Th style={{ width: '50%' }}>Champ Facebook</CrmV2Th>
                <CrmV2Th>Propriété CRM</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {questions.map(q => {
                const mapping = mappings[q.key]
                const crmProp = mapping ? crmProps.find(p => p.name === mapping.crm_field) : null
                const isEnum = crmProp?.options && crmProp.options.length > 0 && q.options && q.options.length > 0
                return (
                  <Fragment key={q.key}>
                    <tr>
                      <td style={{ ...mapTd, borderBottom: isEnum ? 'none' : mapTd.borderBottom }}>
                        <div style={{ fontWeight: 600, color: crmV2.text, wordBreak: 'break-word' }}>{q.label || q.key}</div>
                        <AdsFaint>{q.key}{q.type ? ` · ${q.type}` : ''}</AdsFaint>
                      </td>
                      <td style={{ ...mapTd, borderBottom: isEnum ? 'none' : mapTd.borderBottom }}>
                        <CrmV2Select
                          value={mapping?.crm_field || ''}
                          onChange={e => setField(q.key, e.target.value)}
                        >
                          <option value="">— Ne pas mapper —</option>
                          {filteredProps.map(p => (
                            <option key={p.name} value={p.name}>
                              {p.label} ({p.name})
                            </option>
                          ))}
                        </CrmV2Select>
                        {crmProp && (
                          <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 4 }}>
                            {crmProp.label} · {crmProp.field_type || crmProp.type}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isEnum && (
                      <tr>
                        <td colSpan={2} style={{ padding: '8px 12px 14px', background: crmV2.bgSoft, borderRadius: crmV2.radius, borderBottom: `1px solid ${crmV2.borderLight}` }}>
                          <CrmV2SectionLabel style={{ marginBottom: 6 }}>Mappage des valeurs</CrmV2SectionLabel>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', ...(isMobile ? { tableLayout: 'fixed' as const } : {}) }}>
                            <tbody>
                              {q.options!.map(opt => (
                                <tr key={opt.value}>
                                  <td style={{ padding: '4px 6px', width: '50%' }}>
                                    <span style={{ fontWeight: 600, color: crmV2.text }}>{opt.value}</span>
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <CrmV2Select
                                      value={mapping?.value_map?.[opt.value] || ''}
                                      onChange={e => setValueMap(q.key, opt.value, e.target.value)}
                                      style={{ height: 34 }}
                                    >
                                      <option value="">— Aucune —</option>
                                      {crmProp!.options!.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </CrmV2Select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </CrmV2Drawer>
  )
}

const mapTd: CSSProperties = { padding: '10px 12px', verticalAlign: 'top', borderBottom: `1px solid ${crmV2.borderLight}` }
