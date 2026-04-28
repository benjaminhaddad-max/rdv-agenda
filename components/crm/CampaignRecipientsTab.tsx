'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, RefreshCw, Plus, X, Filter as FilterIcon, ChevronDown } from 'lucide-react'

interface Segment {
  id: string
  name: string
  description?: string | null
  contact_count?: number | null
}

interface Owner {
  hubspot_owner_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filters = Record<string, any>

interface SampleContact {
  contact_id: string
  email: string
  first_name: string | null
  last_name: string | null
}

interface PreviewResult {
  total: number
  sample: SampleContact[]
}

interface Props {
  campaignId: string
  segmentIds: string[]
  extraFilters: Filters
  manualContactIds: string[]
  onChange: (patch: { segment_ids?: string[]; extra_filters?: Filters; manual_contact_ids?: string[] }) => void
  onSavedExternal?: () => void
}

const FILTER_FIELDS: Array<{
  key: keyof Filters
  label: string
  type: 'enum' | 'text' | 'date' | 'bool'
  optionsKey?: string  // appel /api/crm/property-options?property=
  options?: Array<{ label: string; value: string }>
  multiple?: boolean
}> = [
  { key: 'classe',        label: 'Classe actuelle',       type: 'enum', optionsKey: 'classe_actuelle', multiple: true },
  { key: 'zone',          label: 'Zone / Localité',       type: 'enum', optionsKey: 'zone___localite', multiple: true },
  { key: 'departement',   label: 'Département',           type: 'text' },
  { key: 'formation',     label: 'Formation souhaitée',   type: 'enum', optionsKey: 'formation_souhaitee', multiple: true },
  { key: 'lead_status',   label: 'Statut du lead',        type: 'enum', optionsKey: 'hs_lead_status', multiple: true },
  { key: 'origine',       label: 'Origine',               type: 'enum', optionsKey: 'origine', multiple: true },
  { key: 'contact_owner', label: 'Propriétaire',          type: 'enum', multiple: true },
  { key: 'no_owner',      label: 'Sans propriétaire',     type: 'bool' },
  { key: 'created_after', label: 'Créé après',            type: 'date' },
  { key: 'created_before',label: 'Créé avant',            type: 'date' },
  { key: 'recent_conversion_after',  label: 'Dernière soumission après',  type: 'date' },
  { key: 'recent_conversion_before', label: 'Dernière soumission avant', type: 'date' },
]

export default function CampaignRecipientsTab({
  campaignId, segmentIds, extraFilters, manualContactIds, onChange, onSavedExternal,
}: Props) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [propertyOptions, setPropertyOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({})
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)

  // Charge segments + owners + options properties
  useEffect(() => {
    fetch('/api/segments').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setSegments(d)
      else if (Array.isArray(d?.segments)) setSegments(d.segments)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    // owners pour le filtre "Propriétaire"
    fetch('/api/crm/owners').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setOwners(d)
      else if (Array.isArray(d?.owners)) setOwners(d.owners)
    }).catch(() => {})
  }, [])

  // Charge les options pour chaque champ enum à la demande
  const loadPropertyOptions = useCallback(async (propertyName: string) => {
    if (propertyOptions[propertyName]) return
    try {
      const res = await fetch(`/api/crm/property-options?property=${encodeURIComponent(propertyName)}`)
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data?.options)) {
        setPropertyOptions(prev => ({ ...prev, [propertyName]: data.options }))
      }
    } catch { /* ignore */ }
  }, [propertyOptions])

  // Précharge les options pour les filtres déjà actifs
  useEffect(() => {
    for (const field of FILTER_FIELDS) {
      if (field.optionsKey && extraFilters?.[field.key] !== undefined) {
        loadPropertyOptions(field.optionsKey)
      }
    }
  }, [extraFilters, loadPropertyOptions])

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          segment_ids: segmentIds,
          extra_filters: extraFilters,
          manual_contact_ids: manualContactIds,
          sample_size: 10,
        }),
      })
      const data = await res.json()
      if (res.ok) setPreview(data)
      else setPreview({ total: 0, sample: [] })
    } catch {
      setPreview({ total: 0, sample: [] })
    } finally {
      setLoadingPreview(false)
    }
  }, [campaignId, segmentIds, extraFilters, manualContactIds])

  const toggleSegment = (id: string) => {
    const next = segmentIds.includes(id)
      ? segmentIds.filter(s => s !== id)
      : [...segmentIds, id]
    onChange({ segment_ids: next })
  }

  const setFilter = (key: string, value: unknown) => {
    const next: Filters = { ...(extraFilters ?? {}) }
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }
    onChange({ extra_filters: next })
  }

  const removeFilter = (key: string) => {
    const next = { ...(extraFilters ?? {}) }
    delete next[key]
    onChange({ extra_filters: next })
  }

  const addFilter = (field: typeof FILTER_FIELDS[number]) => {
    setShowFilterMenu(false)
    if (field.optionsKey) loadPropertyOptions(field.optionsKey)
    setFilter(field.key as string, field.type === 'bool' ? true : (field.multiple ? [] : ''))
  }

  const activeFilterKeys = Object.keys(extraFilters ?? {})

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Segments enregistrés */}
        <Card title="Segments" icon={Users}>
          {segments.length === 0 ? (
            <div style={{ fontSize: 12, color: '#516f90', padding: '8px 0' }}>
              Aucun segment enregistré. Tu peux créer un segment depuis le CRM ou utiliser les filtres ad-hoc ci-dessous.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {segments.map(s => {
                const sel = segmentIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSegment(s.id)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${sel ? '#0038f0' : '#cbd6e2'}`,
                      background: sel ? 'rgba(46,163,242,0.08)' : '#fff',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#33475b' }}>{s.name}</div>
                      {s.description && (
                        <div style={{ fontSize: 11, color: '#516f90', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</div>
                      )}
                    </div>
                    {typeof s.contact_count === 'number' && (
                      <span style={{ fontSize: 11, color: '#516f90', flexShrink: 0 }}>~{s.contact_count.toLocaleString('fr-FR')}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Filtres ad-hoc */}
        <Card title="Filtres" icon={FilterIcon}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {activeFilterKeys.length === 0 && (
              <div style={{ fontSize: 12, color: '#516f90', padding: '4px 0' }}>
                Aucun filtre. Ajoute-en pour restreindre l&apos;audience.
              </div>
            )}
            {activeFilterKeys.map(k => {
              const field = FILTER_FIELDS.find(f => f.key === k)
              if (!field) return null
              return (
                <FilterPill
                  key={k}
                  field={field}
                  value={extraFilters[k]}
                  options={field.optionsKey ? propertyOptions[field.optionsKey] : (field.key === 'contact_owner' ? owners.map(o => ({ value: o.hubspot_owner_id, label: `${o.firstname || ''} ${o.lastname || ''}`.trim() || o.email || o.hubspot_owner_id })) : undefined)}
                  onChange={v => setFilter(k, v)}
                  onRemove={() => removeFilter(k)}
                />
              )
            })}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              style={{
                fontSize: 12,
                background: '#fff',
                border: '1px dashed #cbd6e2',
                color: '#0038f0',
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Plus size={11} /> Ajouter un filtre
            </button>
            {showFilterMenu && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #cbd6e2', borderRadius: 8, padding: 4, minWidth: 220, zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.08)' }}>
                {FILTER_FIELDS.filter(f => !activeFilterKeys.includes(f.key as string)).map(f => (
                  <button
                    key={f.key as string}
                    type="button"
                    onClick={() => addFilter(f)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: '#33475b',
                      borderRadius: 4,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Aperçu */}
      <div>
        <Card title="Aperçu de l'audience" icon={Users}>
          <button
            onClick={fetchPreview}
            disabled={loadingPreview}
            style={{
              width: '100%',
              background: '#0038f0',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px',
              cursor: loadingPreview ? 'wait' : 'pointer',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 12,
              opacity: loadingPreview ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} className={loadingPreview ? 'spin' : ''} />
            {loadingPreview ? 'Calcul…' : 'Calculer l\'audience'}
          </button>
          {preview ? (
            <>
              <div style={{ background: 'rgba(46,163,242,0.08)', border: '1px solid rgba(46,163,242,0.25)', borderRadius: 8, padding: 14, textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#0038f0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Destinataires</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#0038f0' }}>{preview.total.toLocaleString('fr-FR')}</div>
              </div>
              {preview.sample.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Échantillon</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {preview.sample.map(s => (
                      <li key={s.contact_id} style={{ fontSize: 11, color: '#33475b', padding: '6px 8px', background: '#f5f8fa', borderRadius: 4 }}>
                        <div style={{ fontWeight: 600 }}>{[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'}</div>
                        <div style={{ color: '#516f90' }}>{s.email}</div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#516f90', textAlign: 'center', padding: '12px 0' }}>
              Clique pour voir le nombre de destinataires.
            </div>
          )}
          {onSavedExternal && (
            <div style={{ fontSize: 10, color: '#888', marginTop: 12, lineHeight: 1.4 }}>
              💡 N&apos;oublie pas de <strong>sauvegarder</strong> la campagne après avoir modifié l&apos;audience.
            </div>
          )}
        </Card>
      </div>

      <style jsx>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── FilterPill ──────────────────────────────────────────────────────────
function FilterPill({
  field, value, options, onChange, onRemove,
}: {
  field: typeof FILTER_FIELDS[number]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  options?: Array<{ label: string; value: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (v: any) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  const display = (() => {
    if (field.type === 'bool') return value ? 'oui' : 'non'
    if (field.type === 'date') return value || '—'
    if (Array.isArray(value)) {
      if (value.length === 0) return '(rien)'
      if (value.length === 1) {
        const opt = options?.find(o => o.value === value[0])
        return opt?.label || value[0]
      }
      return `${value.length} sélectionnés`
    }
    if (typeof value === 'string') {
      const opt = options?.find(o => o.value === value)
      return opt?.label || value
    }
    return String(value || '')
  })()

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: 'rgba(204,172,113,0.12)',
          border: '1px solid rgba(204,172,113,0.4)',
          color: '#8a6e3a',
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ fontWeight: 600 }}>{field.label}</span>
        <span>:</span>
        <span style={{ fontWeight: 400 }}>{display}</span>
        <ChevronDown size={10} />
        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{ marginLeft: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          role="button"
          aria-label="Retirer le filtre"
        ><X size={11} /></span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #cbd6e2', borderRadius: 8, padding: 8, minWidth: 200, zIndex: 20, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 320, overflowY: 'auto' }}>
          {field.type === 'bool' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: 4 }}>
              <input
                type="checkbox"
                checked={!!value}
                onChange={e => onChange(e.target.checked)}
              />
              Activé
            </label>
          )}
          {field.type === 'text' && (
            <input
              type="text"
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              placeholder={field.label}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd6e2', borderRadius: 4, fontSize: 12, fontFamily: 'inherit' }}
            />
          )}
          {field.type === 'date' && (
            <input
              type="date"
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd6e2', borderRadius: 4, fontSize: 12, fontFamily: 'inherit' }}
            />
          )}
          {field.type === 'enum' && options && (
            <div>
              {options.length === 0 && <div style={{ fontSize: 11, color: '#888', padding: 6 }}>Aucune option</div>}
              {options.map(o => {
                const checked = field.multiple
                  ? Array.isArray(value) && value.includes(o.value)
                  : value === o.value
                return (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}>
                    <input
                      type={field.multiple ? 'checkbox' : 'radio'}
                      checked={checked}
                      onChange={e => {
                        if (field.multiple) {
                          const cur = Array.isArray(value) ? value : []
                          const next = e.target.checked ? [...cur, o.value] : cur.filter(v => v !== o.value)
                          onChange(next)
                        } else {
                          onChange(o.value)
                        }
                      }}
                    />
                    {o.label}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Card local (légère copie pour autonomie du composant) ──────────────
function Card({ title, icon: Icon, children }: { title: string; icon?: typeof Users; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#33475b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {Icon && <Icon size={13} style={{ color: '#ccac71' }} />}
        {title}
      </div>
      {children}
    </div>
  )
}
