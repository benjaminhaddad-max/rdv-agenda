'use client'

import { useEffect, useState, useCallback, Suspense, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { Facebook, RefreshCw, AlertCircle, CheckCircle2, Power, Trash2, ExternalLink, Loader2, ChevronDown, ChevronRight, Search, Link2, X } from 'lucide-react'

export default function MetaAdsPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>}>
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
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [formSearch, setFormSearch] = useState<Record<string, string>>({})

  function toggleExpanded(pageId: string) {
    setExpandedPages(prev => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }
  function toggleAllExpanded() {
    if (expandedPages.size === pages.length) setExpandedPages(new Set())
    else setExpandedPages(new Set(pages.map(p => p.page_id)))
  }

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

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>Meta Lead Ads</h1>
            <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
              Connecte tes pages Facebook / Instagram pour recevoir les leads de tes pubs en temps réel.
            </p>
          </div>
          <a
            href="/api/meta/oauth/start"
            style={{
              padding: '10px 18px', borderRadius: 8, background: '#1877F2', color: '#fff',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <Facebook size={16} /> Connecter une page Facebook
          </a>
        </div>

        {error && (
          <div style={banner('error')}><AlertCircle size={16} /> {error}</div>
        )}
        {success && (
          <div style={banner('success')}><CheckCircle2 size={16} /> {success}</div>
        )}

        {loading && (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <Loader2 size={28} className="animate-spin" />
            <div style={{ marginTop: 8, fontSize: 13 }}>Chargement…</div>
          </div>
        )}

        {!loading && pages.length === 0 && (
          <div style={card({ padding: 40, textAlign: 'center' })}>
            <Facebook size={36} style={{ color: '#1877F2', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Aucune page connectée</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Clique sur « Connecter une page Facebook » pour démarrer.
            </div>
          </div>
        )}

        {/* Pages */}
        {!loading && pages.length > 0 && (
          <section style={{ marginBottom: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Pages connectées ({pages.length})</h2>
              <button onClick={toggleAllExpanded} style={btn('secondary')}>
                {expandedPages.size === pages.length ? 'Tout replier' : 'Tout déplier'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pages.map(p => {
                const isExpanded = expandedPages.has(p.page_id)
                const pageFormCount = forms.filter(f => f.page_id === p.page_id).length
                return (
                <div key={p.page_id} style={card({ padding: 16 })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div
                        onClick={() => toggleExpanded(p.page_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer', userSelect: 'none' }}
                      >
                        {isExpanded ? <ChevronDown size={14} style={{ color: '#64748b' }} /> : <ChevronRight size={14} style={{ color: '#64748b' }} />}
                        <Facebook size={14} style={{ color: '#1877F2' }} />
                        <strong>{p.page_name}</strong>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>· {p.page_id}</span>
                        {pageFormCount > 0 && (
                          <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 999 }}>
                            {pageFormCount} form{pageFormCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Connectée par {p.user_name || '?'}</span>
                        <span>{p.total_leads} lead{p.total_leads > 1 ? 's' : ''} reçus</span>
                        {p.last_lead_at && <span>Dernier : {new Date(p.last_lead_at).toLocaleString('fr-FR')}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {p.subscribed
                          ? <span style={badge('#22c55e')}>Webhook actif</span>
                          : <span style={badge('#f59e0b')}>Webhook non abonné</span>}
                        {!p.active && <span style={badge('#dc2626')}>Désactivée</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!p.subscribed && (
                        <button onClick={() => subscribe(p.page_id)} disabled={busy === p.page_id} style={btn('primary')}>
                          <Power size={12} /> Abonner webhook
                        </button>
                      )}
                      <button onClick={() => refreshForms(p.page_id)} disabled={busy === p.page_id} style={btn('secondary')}>
                        <RefreshCw size={12} className={busy === p.page_id ? 'animate-spin' : ''} /> Refresh forms
                      </button>
                      <button onClick={() => toggleActive(p)} disabled={busy === p.page_id} style={btn('secondary')}>
                        {p.active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button onClick={() => disconnect(p.page_id)} disabled={busy === p.page_id} style={btn('danger')}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Forms de cette page */}
                  {isExpanded && (() => {
                    const pageForms = forms.filter(f => f.page_id === p.page_id)
                    if (pageForms.length === 0) return (
                      <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                        Aucun formulaire trouvé. Clique sur « Refresh forms » pour les charger.
                      </div>
                    )
                    const search = (formSearch[p.page_id] || '').toLowerCase().trim()
                    const filteredForms = search
                      ? pageForms.filter(f =>
                          (f.name || '').toLowerCase().includes(search) ||
                          f.form_id.includes(search) ||
                          (f.origine_label || '').toLowerCase().includes(search)
                        )
                      : pageForms
                    return (
                      <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                            Formulaires ({filteredForms.length}{search && filteredForms.length !== pageForms.length ? ` / ${pageForms.length}` : ''})
                          </div>
                          <div style={{ position: 'relative', flex: '0 1 280px' }}>
                            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                              type="text"
                              placeholder="Rechercher un formulaire…"
                              value={formSearch[p.page_id] || ''}
                              onChange={e => setFormSearch(prev => ({ ...prev, [p.page_id]: e.target.value }))}
                              style={{ ...input, paddingLeft: 26, maxWidth: 'none', width: '100%' }}
                            />
                          </div>
                        </div>
                        {filteredForms.length === 0 ? (
                          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                            Aucun formulaire ne correspond à « {search} »
                          </div>
                        ) : (
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#fafbfc' }}>
                              <th style={th}>Nom</th>
                              <th style={th}>Statut</th>
                              <th style={th}>Origine (CRM)</th>
                              <th style={th}>Owner par défaut</th>
                              <th style={th}>Mapping</th>
                              <th style={th}>Leads</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredForms.map(f => (
                              <tr key={f.form_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={td}>
                                  <div style={{ fontWeight: 600 }}>{f.name || '(sans nom)'}</div>
                                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{f.form_id}</div>
                                </td>
                                <td style={td}>
                                  <span style={badge(f.status === 'ACTIVE' ? '#22c55e' : '#94a3b8')}>{f.status || '?'}</span>
                                </td>
                                <td style={td}>
                                  <input
                                    type="text"
                                    defaultValue={f.origine_label || ''}
                                    placeholder={f.name || 'Meta Lead Ads'}
                                    onBlur={e => {
                                      if (e.target.value !== (f.origine_label || '')) {
                                        updateForm(f.form_id, { origine_label: e.target.value })
                                      }
                                    }}
                                    style={input}
                                  />
                                </td>
                                <td style={td}>
                                  <select
                                    defaultValue={f.default_owner_id || ''}
                                    onChange={e => updateForm(f.form_id, { default_owner_id: e.target.value })}
                                    style={input}
                                  >
                                    <option value="">— Aucun —</option>
                                    {owners.map(o => {
                                      const name = [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
                                      return <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>{name}</option>
                                    })}
                                  </select>
                                </td>
                                <td style={td}>
                                  {(() => {
                                    const count = f.field_mappings ? Object.keys(f.field_mappings).length : 0
                                    return (
                                      <button onClick={() => setMappingForm(f)} style={btn('secondary')}>
                                        <Link2 size={11} />
                                        {count > 0 ? `${count} mappé${count > 1 ? 's' : ''}` : 'Mapper'}
                                      </button>
                                    )
                                  })()}
                                </td>
                                <td style={td}>{f.leads_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )})}
            </div>
          </section>
        )}

        {/* Derniers leads */}
        {!loading && events.length > 0 && (
          <section>
            <h2 style={sectionTitle}>Derniers leads reçus ({events.length})</h2>
            <div style={card({ padding: 0, overflow: 'hidden' })}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={th}>Reçu</th>
                    <th style={th}>Form</th>
                    <th style={th}>Statut</th>
                    <th style={th}>Contact</th>
                    <th style={th}>Données</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(e => {
                    const form = forms.find(f => f.form_id === e.form_id)
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={td}>{new Date(e.received_at).toLocaleString('fr-FR')}</td>
                        <td style={td}>{form?.name || e.form_id || '?'}</td>
                        <td style={td}>
                          {e.status === 'processed' && <span style={badge('#22c55e')}>OK {e.contact_created ? '(créé)' : '(màj)'}</span>}
                          {e.status === 'error' && <span style={badge('#dc2626')} title={e.error || ''}>Erreur</span>}
                          {e.status === 'pending' && <span style={badge('#f59e0b')}>En attente</span>}
                        </td>
                        <td style={td}>
                          {e.contact_id
                            ? <a href={`/admin/crm/contacts/${e.contact_id}`} style={{ color: '#2ea3f2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>Voir <ExternalLink size={10} /></a>
                            : '—'}
                        </td>
                        <td style={td}>
                          {(e.field_data || []).slice(0, 4).map((f: { name: string; values: string[] }) => (
                            <span key={f.name} style={{ marginRight: 8 }}>
                              <strong>{f.name}</strong>: {f.values?.[0] || ''}
                            </span>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

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

        {/* Help box */}
        <div style={card({ padding: 16, marginTop: 24, background: '#eff6ff', borderColor: '#bfdbfe' })}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1e40af' }}>Comment ça marche</div>
          <ol style={{ fontSize: 12, color: '#1e40af', margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Clique « Connecter une page Facebook » → tu autorises l&apos;app sur Facebook</li>
            <li>Clique « Refresh forms » sur la page → on récupère tes formulaires Lead Ads</li>
            <li>Clique « Abonner webhook » → tu recevras les leads en temps réel</li>
            <li>Configure pour chaque form : un libellé d&apos;origine + un owner par défaut</li>
          </ol>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginTop: 0, marginBottom: 10,
}
function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, ...extra }
}
function banner(kind: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '10px 14px',
    background: kind === 'error' ? '#fef2f2' : '#f0fdf4',
    border: `1px solid ${kind === 'error' ? '#fecaca' : '#bbf7d0'}`,
    borderRadius: 8,
    color: kind === 'error' ? '#dc2626' : '#166534',
    fontSize: 13, marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
  }
}
function badge(color: string): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
    background: color + '22', color, fontSize: 10, fontWeight: 600,
  }
}
function btn(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4, border: 'none',
  }
  if (variant === 'primary') return { ...base, background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }
  if (variant === 'danger') return { ...base, background: '#fee2e2', color: '#dc2626' }
  return { ...base, background: '#f1f5f9', color: '#516f90', border: '1px solid #cbd6e2' }
}
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' }
const input: React.CSSProperties = { padding: '4px 8px', border: '1px solid #cbd6e2', borderRadius: 6, fontSize: 12, width: '100%', maxWidth: 200 }

// ─── Helpers de mapping ─────────────────────────────────────────────────────

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
  classe: 'classe_actuelle',
  classe_actuelle: 'classe_actuelle',
  niveau: 'classe_actuelle',
  formation: 'formation_souhaitee',
}

function autoSuggest(metaKey: string, crmProps: CrmProperty[]): string | null {
  const m = metaKey.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!m) return null
  const direct = META_FIELD_MAP_HARDCODED[metaKey.toLowerCase()]
  if (direct && crmProps.some(p => p.name === direct)) return direct
  for (const p of crmProps) {
    if (p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === m) return p.name
  }
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 800,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #2ea3f2, #0038f0)',
          color: '#fff', borderRadius: '12px 12px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Mappage de champs</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>{form.name || form.form_id}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Rechercher une propriété CRM…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...input, paddingLeft: 26, maxWidth: 'none', width: '100%' }}
            />
          </div>
        </div>

        {/* Body — table de mapping */}
        <div style={{ overflowY: 'auto', padding: '12px 20px', flex: 1 }}>
          {questions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Aucune question trouvée pour ce form. Refresh forms d&apos;abord.
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Champ Facebook</th>
                  <th style={th}>Propriété CRM</th>
                </tr>
              </thead>
              <tbody>
                {questions.map(q => {
                  const mapping = mappings[q.key]
                  const crmProp = mapping ? crmProps.find(p => p.name === mapping.crm_field) : null
                  const isEnum = crmProp?.options && crmProp.options.length > 0 && q.options && q.options.length > 0
                  return (
                    <Fragment key={q.key}>
                      <tr style={{ borderBottom: isEnum ? 'none' : '1px solid #f1f5f9' }}>
                        <td style={{ ...td, width: '50%' }}>
                          <div style={{ fontWeight: 600 }}>{q.label || q.key}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{q.key}{q.type ? ` · ${q.type}` : ''}</div>
                        </td>
                        <td style={td}>
                          <select
                            value={mapping?.crm_field || ''}
                            onChange={e => setField(q.key, e.target.value)}
                            style={{ ...input, maxWidth: 'none', width: '100%' }}
                          >
                            <option value="">— Ne pas mapper —</option>
                            {filteredProps.map(p => (
                              <option key={p.name} value={p.name}>
                                {p.label} ({p.name})
                              </option>
                            ))}
                          </select>
                          {crmProp && (
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                              {crmProp.label} · {crmProp.field_type || crmProp.type}
                            </div>
                          )}
                        </td>
                      </tr>
                      {isEnum && (
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td colSpan={2} style={{ padding: '8px 10px 14px', background: '#fafbfc' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                              Mappage des valeurs
                            </div>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <tbody>
                                {q.options!.map(opt => (
                                  <tr key={opt.value}>
                                    <td style={{ padding: '4px 6px', width: '50%' }}>
                                      <span style={{ fontWeight: 500 }}>{opt.value}</span>
                                    </td>
                                    <td style={{ padding: '4px 6px' }}>
                                      <select
                                        value={mapping?.value_map?.[opt.value] || ''}
                                        onChange={e => setValueMap(q.key, opt.value, e.target.value)}
                                        style={{ ...input, maxWidth: 'none', width: '100%' }}
                                      >
                                        <option value="">— Aucune —</option>
                                        {crmProp!.options!.map(o => (
                                          <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                      </select>
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

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={btn('secondary')} disabled={saving}>
            Annuler
          </button>
          <button onClick={handleSave} style={btn('primary')} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
