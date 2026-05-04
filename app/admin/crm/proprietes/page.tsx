'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Search, Plus, FileText, Hash, Calendar, ListChecks, ToggleLeft, Phone, X, AlertCircle, CheckCircle2 } from 'lucide-react'

type Property = {
  name: string
  label: string
  description: string | null
  group_name: string | null
  type: string
  field_type: string
  options: Array<{ label: string; value: string }> | null
  display_order: number | null
  archived: boolean
  object_type: string
  hubspot_defined: boolean
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  string: FileText,
  number: Hash,
  date: Calendar,
  datetime: Calendar,
  enumeration: ListChecks,
  bool: ToggleLeft,
  phone_number: Phone,
}

const FIELD_TYPES: Array<{ value: string; label: string; type: string }> = [
  { value: 'text',             label: 'Texte court',                 type: 'string' },
  { value: 'textarea',         label: 'Texte long',                  type: 'string' },
  { value: 'number',           label: 'Nombre',                      type: 'number' },
  { value: 'date',             label: 'Date',                        type: 'date' },
  { value: 'datetime',         label: 'Date + heure',                type: 'datetime' },
  { value: 'select',           label: 'Liste déroulante (1 choix)',  type: 'enumeration' },
  { value: 'radio',            label: 'Radio (1 choix)',             type: 'enumeration' },
  { value: 'checkbox',         label: 'Cases (multi-choix)',         type: 'enumeration' },
  { value: 'booleancheckbox',  label: 'Oui / Non',                   type: 'bool' },
  { value: 'phonenumber',      label: 'Téléphone',                   type: 'phone_number' },
]

export default function ProprietesPage() {
  const [object, setObject] = useState<'contacts' | 'deals'>('contacts')
  const [properties, setProperties] = useState<Property[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [detail, setDetail] = useState<Property | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/crm/properties?object=${object}&limit=2000`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setProperties(j.properties || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [object])

  useEffect(() => { load() }, [load])

  // Filtrage côté client
  const filtered = useMemo(() => {
    if (!search.trim()) return properties
    const q = search.toLowerCase()
    return properties.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.group_name || '').toLowerCase().includes(q)
    )
  }, [properties, search])

  // Groupage par group_name
  const grouped = useMemo(() => {
    const out: Record<string, Property[]> = {}
    for (const p of filtered) {
      const g = p.group_name || 'Sans groupe'
      if (!out[g]) out[g] = []
      out[g].push(p)
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>Propriétés CRM</h1>
            <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
              Toutes les propriétés (contacts / deals) — synchronisées depuis HubSpot ou créées en interne.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #2ea3f2, #0038f0)',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Nouvelle propriété
          </button>
        </div>

        {/* Tabs object_type + search */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['contacts', 'deals'] as const).map(o => (
              <button
                key={o}
                onClick={() => setObject(o)}
                style={{
                  padding: '7px 14px', borderRadius: 8,
                  border: '1px solid ' + (o === object ? '#2ea3f2' : '#cbd6e2'),
                  background: o === object ? '#2ea3f2' : '#fff',
                  color: o === object ? '#fff' : '#516f90',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (nom, label, groupe…)"
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                border: '1px solid #cbd6e2', borderRadius: 8,
                fontSize: 13, outline: 'none', background: '#fff',
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {filtered.length} / {properties.length} propriétés
          </span>
        </div>

        {error && (
          <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {doneMessage && (
          <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 13, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={16} /> {doneMessage}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Chargement des propriétés…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {grouped.map(([groupName, props]) => (
              <div key={groupName}>
                <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 8, marginTop: 0 }}>
                  {groupName} <span style={{ color: '#cbd6e2' }}>({props.length})</span>
                </h2>
                <div style={{ background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Label</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Nom technique</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Options / Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {props.map(p => {
                        const Icon = TYPE_ICONS[p.type] || FileText
                        return (
                          <tr
                            key={p.name}
                            onClick={() => setDetail(p)}
                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background .12s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 600 }}>{p.label}</div>
                              {p.description && (
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{p.description}</div>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: '#516f90' }}>
                              {p.name}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#eef2f7', fontSize: 11, fontWeight: 600 }}>
                                <Icon size={11} /> {p.field_type}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748b' }}>
                              {p.options && Array.isArray(p.options) && p.options.length > 0 ? (
                                <span>
                                  {p.options.slice(0, 4).map(o => o.label).join(', ')}
                                  {p.options.length > 4 && <span style={{ color: '#94a3b8' }}> +{p.options.length - 4}</span>}
                                </span>
                              ) : p.hubspot_defined ? (
                                <span style={{ fontSize: 11, color: '#cbd6e2' }}>— HubSpot natif —</span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#cbd6e2' }}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {grouped.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12 }}>
                Aucune propriété ne correspond à ta recherche.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal création */}
      {showCreate && (
        <CreateModal
          objectType={object}
          onClose={() => setShowCreate(false)}
          onCreated={(prop) => {
            setShowCreate(false)
            setDoneMessage(`Propriété "${prop.label}" créée`)
            load()
            setTimeout(() => setDoneMessage(null), 4000)
          }}
        />
      )}

      {detail && <PropertyDetailModal property={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ─── Modal détail propriété (read-only) ────────────────────────────────────
function PropertyDetailModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const [actualValues, setActualValues] = useState<Array<{ value: string; count: number }> | null>(null)
  const [valuesLoading, setValuesLoading] = useState(true)
  const [valuesSource, setValuesSource] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/crm/properties/${encodeURIComponent(property.name)}/values?object=${property.object_type}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        setActualValues(j.values || [])
        setValuesSource(j.source || '')
        setValuesLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setActualValues([])
        setValuesLoading(false)
      })
    return () => { cancelled = true }
  }, [property.name, property.object_type])

  const totalCount = actualValues?.reduce((sum, v) => sum + Number(v.count), 0) || 0

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #2ea3f2, #0038f0)',
          color: '#fff', borderRadius: '12px 12px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{property.label}</div>
            <div style={{ fontSize: 11, opacity: 0.9, fontFamily: 'monospace' }}>{property.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {/* Métadonnées */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Meta label="Type technique">{property.type}</Meta>
            <Meta label="Field type">{property.field_type}</Meta>
            <Meta label="Groupe">{property.group_name || '—'}</Meta>
            <Meta label="Source">{property.hubspot_defined ? 'HubSpot natif' : 'Locale Diploma'}</Meta>
            {property.display_order != null && <Meta label="Display order">{property.display_order}</Meta>}
            {property.archived && <Meta label="État">Archivée</Meta>}
          </div>

          {property.description && (
            <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#516f90', marginBottom: 16 }}>
              {property.description}
            </div>
          )}

          {/* Options prédéfinies (si enumeration et synchro HubSpot a chargé les options) */}
          {property.options && property.options.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                Valeurs prédéfinies ({property.options.length})
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', width: '50%' }}>Label affiché</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Valeur stockée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {property.options.map((opt, i) => (
                      <tr key={i} style={{ borderBottom: i < property.options!.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{opt.label}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#516f90' }}>{opt.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valeurs réellement utilisées en base */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
              Valeurs utilisées dans la base
              {actualValues && actualValues.length > 0 && (
                <span style={{ marginLeft: 6, fontWeight: 500, textTransform: 'none', color: '#94a3b8' }}>
                  · {actualValues.length} distinctes · {totalCount.toLocaleString('fr-FR')} {property.object_type === 'deals' ? 'deals' : 'contacts'}
                  {valuesSource === 'hubspot_raw' && ' · depuis hubspot_raw'}
                </span>
              )}
            </div>
            {valuesLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Chargement…</div>
            ) : !actualValues || actualValues.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12, background: '#fafbfc', border: '1px dashed #cbd6e2', borderRadius: 8 }}>
                Aucune valeur trouvée. La propriété est peut-être vide partout, ou la migration v23
                (RPC d&apos;extraction) n&apos;a pas été appliquée.
              </div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#fafbfc' }}>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Valeur</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', width: 110 }}>Nb {property.object_type === 'deals' ? 'deals' : 'contacts'}</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', width: 60 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actualValues.map((v, i) => (
                      <tr key={i} style={{ borderBottom: i < actualValues.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '8px 12px', fontFamily: v.value && v.value.length < 40 ? 'inherit' : 'monospace', wordBreak: 'break-all' }}>
                          {v.value || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(vide)</span>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {Number(v.count).toLocaleString('fr-FR')}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                          {totalCount > 0 ? ((Number(v.count) / totalCount) * 100).toFixed(1) : '0'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Note édition */}
          <div style={{
            marginTop: 16, padding: 12, borderRadius: 8,
            background: '#fef9e7', border: '1px solid #fde68a',
            fontSize: 12, color: '#92400e', display: 'flex', gap: 8,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Lecture seule pour l&apos;instant.</strong> L&apos;édition est désactivée tant que le mirror HubSpot
              tourne (sinon le sync écraserait tes modifs). Ça sera réactivé le jour où on coupe HubSpot
              (<code style={{ background: '#fbbf24', padding: '0 4px', borderRadius: 3 }}>HUBSPOT_MIRROR_ENABLED=0</code>).
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd6e2',
            background: '#fff', color: '#516f90', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#1a2f4b', fontWeight: 500 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Modal de création ──────────────────────────────────────────────────────
function CreateModal({ objectType, onClose, onCreated }: {
  objectType: 'contacts' | 'deals'
  onClose: () => void
  onCreated: (p: Property) => void
}) {
  const [label, setLabel] = useState('')
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState('text')
  const [groupName, setGroupName] = useState('custom')
  const [description, setDescription] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Auto-snake-case du label vers name
  function deriveName(label: string): string {
    return label.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50)
  }

  const ftMeta = FIELD_TYPES.find(f => f.value === fieldType)
  const needsOptions = ftMeta && ['select', 'radio', 'checkbox'].includes(fieldType)

  async function submit() {
    setErr(null)
    if (!label.trim()) { setErr('Label requis'); return }
    const finalName = name.trim() || deriveName(label)
    if (!finalName) { setErr('Nom technique invalide'); return }

    let options: Array<{ label: string; value: string }> | null = null
    if (needsOptions) {
      const lines = optionsText.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length === 0) { setErr('Ajoute au moins une option'); return }
      options = lines.map(l => {
        // "label|value" ou juste "label"
        const parts = l.split('|')
        const lab = parts[0].trim()
        const val = (parts[1] || lab).trim()
        return { label: lab, value: val }
      })
    }

    setSaving(true)
    try {
      const res = await fetch('/api/crm/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object_type: objectType,
          name: finalName,
          label: label.trim(),
          type: ftMeta?.type || 'string',
          field_type: fieldType,
          group_name: groupName.trim() || 'custom',
          description: description.trim() || null,
          options,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      onCreated(j.property)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
        zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: '60px 16px', overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, padding: 24, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 6 }}>
          <X size={18} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 4 }}>
          Nouvelle propriété ({objectType})
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', margin: 0, marginBottom: 20 }}>
          Visible immédiatement dans les fiches contact, les forms et les workflows.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Label *" hint="Ex : « Université préférée »">
            <input
              type="text" value={label}
              onChange={e => { setLabel(e.target.value); if (!name) setName(deriveName(e.target.value)) }}
              placeholder="Mon nouveau champ"
              style={inputStyle}
            />
          </Field>

          <Field label="Nom technique" hint="Auto-généré, modifiable. Lettres minuscules, chiffres, underscores.">
            <input
              type="text" value={name}
              onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="mon_champ_custom"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </Field>

          <Field label="Type">
            <select value={fieldType} onChange={e => setFieldType(e.target.value)} style={inputStyle}>
              {FIELD_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>

          {needsOptions && (
            <Field label="Options *" hint="Une ligne = une option. Format « label » ou « label|valeur »">
              <textarea
                value={optionsText}
                onChange={e => setOptionsText(e.target.value)}
                placeholder={'Option 1\nOption 2\nOption 3'}
                rows={5}
                style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
              />
            </Field>
          )}

          <Field label="Groupe" hint="Pour ranger la propriété dans la fiche contact (ex : custom, marketing, etc.)">
            <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Description (optionnelle)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Aide pour les utilisateurs"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>

        {err && (
          <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={14} /> {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd6e2', background: '#fff', color: '#516f90', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#1a2f4b' }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</span>}
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', border: '1px solid #cbd6e2', borderRadius: 8,
  fontSize: 13, outline: 'none', background: '#fff', color: '#1a2f4b',
}
