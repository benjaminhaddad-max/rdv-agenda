'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Search, ChevronDown, Loader2, ExternalLink } from 'lucide-react'
import { isUserTypeProperty, buildUserNameIndex, type Owner } from '@/lib/crm-user-resolver'

type Property = {
  name: string
  label: string
  description: string | null
  group_name: string | null
  type: string
  field_type: string
  options: Array<{ label: string; value: string }> | null
}

type Contact = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  classe_actuelle: string | null
  formation_souhaitee: string | null
  recent_conversion_date: string | null
  matched_value: string | null
}

const OPERATORS_BY_TYPE: Record<string, Array<{ value: string; label: string }>> = {
  enumeration: [
    { value: 'is',           label: 'est' },
    { value: 'is_not',       label: "n'est pas" },
    { value: 'is_empty',     label: 'est vide' },
    { value: 'is_not_empty', label: "n'est pas vide" },
  ],
  string: [
    { value: 'contains',     label: 'contient' },
    { value: 'is',           label: 'est exactement' },
    { value: 'is_empty',     label: 'est vide' },
    { value: 'is_not_empty', label: "n'est pas vide" },
  ],
  number: [
    { value: 'is',           label: 'est' },
    { value: 'is_empty',     label: 'est vide' },
    { value: 'is_not_empty', label: "n'est pas vide" },
  ],
  bool: [
    { value: 'is',           label: 'est' },
  ],
  date: [
    { value: 'is_empty',     label: 'est vide' },
    { value: 'is_not_empty', label: "n'est pas vide" },
  ],
  datetime: [
    { value: 'is_empty',     label: 'est vide' },
    { value: 'is_not_empty', label: "n'est pas vide" },
  ],
}

const DEFAULT_OPS = OPERATORS_BY_TYPE.string

export default function RecherchePropPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [propLoading, setPropLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pickedProp, setPickedProp] = useState<Property | null>(null)
  const [operator, setOperator] = useState<string>('is')
  const [value, setValue] = useState<string>('')
  const [results, setResults] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [storage, setStorage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owners, setOwners] = useState<Owner[]>([])

  const isUserProp = pickedProp ? isUserTypeProperty(pickedProp.name) : false
  const userIndex = useMemo(() => buildUserNameIndex(owners), [owners])

  // Charge les owners (pour résoudre les props User)
  useEffect(() => {
    fetch('/api/crm/owners')
      .then(r => r.json())
      .then(j => setOwners(j.owners || []))
      .catch(() => setOwners([]))
  }, [])

  // Charge les 829 propriétés une fois
  useEffect(() => {
    fetch('/api/crm/properties?object=contacts&limit=2000')
      .then(r => r.json())
      .then(j => setProperties(j.properties || []))
      .catch(() => setProperties([]))
      .finally(() => setPropLoading(false))
  }, [])

  // Filtre les props selon la recherche
  const filteredProps = useMemo(() => {
    if (!search.trim()) return properties
    const q = search.toLowerCase()
    return properties.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      (p.group_name || '').toLowerCase().includes(q)
    )
  }, [properties, search])

  // Quand on change de prop, reset operator (selon type) + value
  useEffect(() => {
    if (!pickedProp) return
    const ops = OPERATORS_BY_TYPE[pickedProp.type] || DEFAULT_OPS
    setOperator(ops[0].value)
    setValue('')
  }, [pickedProp])

  // Recherche les contacts
  const runSearch = useCallback(async () => {
    if (!pickedProp) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        prop: pickedProp.name,
        op: operator,
        value,
        limit: '50',
        page: '0',
      })
      const res = await fetch(`/api/crm/contacts/by-property?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResults(j.data || [])
      setTotal(j.total || 0)
      setStorage(j.storage || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [pickedProp, operator, value])

  const opNeedsValue = !['is_empty', 'is_not_empty'].includes(operator)
  const isEnum = pickedProp?.type === 'enumeration' && pickedProp.options && pickedProp.options.length > 0
  const ops = pickedProp ? (OPERATORS_BY_TYPE[pickedProp.type] || DEFAULT_OPS) : DEFAULT_OPS

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>Recherche par propriété</h1>
          <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
            Filtre tes contacts sur n&apos;importe laquelle des {properties.length || 829} propriétés. Utile pour vérifier des données
            ou trouver des contacts avec une valeur précise.
          </p>
        </div>

        {/* Builder filtre */}
        <div style={card({ padding: 16, marginBottom: 16 })}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Picker de propriété */}
            <div>
              <label style={labelStyle}>Propriété</label>
              <PropertyPicker
                properties={filteredProps}
                allCount={properties.length}
                search={search}
                onSearchChange={setSearch}
                picked={pickedProp}
                onPick={setPickedProp}
                loading={propLoading}
              />
            </div>

            {/* Opérateur */}
            <div>
              <label style={labelStyle}>Opérateur</label>
              <select value={operator} onChange={e => setOperator(e.target.value)} style={input} disabled={!pickedProp}>
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Valeur */}
            <div>
              <label style={labelStyle}>Valeur</label>
              {!opNeedsValue ? (
                <input value="(pas de valeur requise)" disabled style={{ ...input, color: '#94a3b8' }} />
              ) : isUserProp && owners.length > 0 ? (
                <select value={value} onChange={e => setValue(e.target.value)} style={input}>
                  <option value="">— Choisir un utilisateur —</option>
                  {owners
                    .slice()
                    .sort((a, b) => (a.firstname || '').localeCompare(b.firstname || ''))
                    .map(o => {
                      const name = [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
                      // Pour teleprospecteur on filtre par user_id, sinon par hubspot_owner_id
                      const id = pickedProp?.name === 'teleprospecteur' ? (o.user_id || o.hubspot_owner_id) : o.hubspot_owner_id
                      return <option key={String(id)} value={String(id)}>{name}</option>
                    })}
                </select>
              ) : isEnum ? (
                <select value={value} onChange={e => setValue(e.target.value)} style={input}>
                  <option value="">— Choisir —</option>
                  {pickedProp!.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={pickedProp?.type === 'number' ? 'number' : pickedProp?.type === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="Valeur à chercher…"
                  style={input}
                  onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
                />
              )}
            </div>

            <button
              onClick={runSearch}
              disabled={!pickedProp || loading || (opNeedsValue && !value)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: (!pickedProp || (opNeedsValue && !value)) ? '#cbd6e2' : 'linear-gradient(135deg, #2ea3f2, #0038f0)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: (!pickedProp || (opNeedsValue && !value)) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, height: 36,
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Rechercher
            </button>
          </div>

          {pickedProp && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
              <strong>{pickedProp.label}</strong> · <code>{pickedProp.name}</code> · type {pickedProp.type}
              {pickedProp.group_name && <> · groupe {pickedProp.group_name}</>}
            </div>
          )}
        </div>

        {error && <div style={{ ...card({ padding: 12, marginBottom: 12 }), background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626', fontSize: 13 }}>{error}</div>}

        {/* Résultats */}
        {!pickedProp ? null : (
          <div style={card({ padding: 0, overflow: 'hidden' })}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Résultats {total > 0 && <span style={{ color: '#64748b', fontWeight: 400 }}>· {total.toLocaleString('fr-FR')} contacts</span>}
                {storage === 'hubspot_raw' && <span style={{ marginLeft: 8, fontSize: 10, color: '#94a3b8' }}>(via hubspot_raw)</span>}
              </div>
              {results.length > 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>50 premiers résultats triés par dernière conversion</div>
              )}
            </div>

            {loading && results.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                {pickedProp ? 'Aucun contact ne correspond. Essaye un autre opérateur ou une autre valeur.' : 'Choisis une propriété ci-dessus.'}
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={th}>Nom</th>
                    <th style={th}>Email / Téléphone</th>
                    <th style={th}>Classe / Formation</th>
                    <th style={th}>Valeur trouvée</th>
                    <th style={th}>Dern. conversion</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(c => (
                    <tr key={c.hubspot_contact_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{[c.firstname, c.lastname].filter(Boolean).join(' ') || '—'}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.hubspot_contact_id}</div>
                      </td>
                      <td style={td}>
                        <div>{c.email || '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{c.phone || ''}</div>
                      </td>
                      <td style={td}>
                        <div>{c.classe_actuelle || '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{c.formation_souhaitee || ''}</div>
                      </td>
                      <td style={{ ...td, maxWidth: 240, overflow: 'hidden' }}>
                        {c.matched_value ? (
                          isUserProp && userIndex.get(c.matched_value) ? (
                            <>
                              <div style={{ fontWeight: 500 }}>{userIndex.get(c.matched_value)}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{c.matched_value}</div>
                            </>
                          ) : (
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#516f90' }}>{c.matched_value}</span>
                          )
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(vide)</span>
                        )}
                      </td>
                      <td style={td}>{c.recent_conversion_date ? new Date(c.recent_conversion_date).toLocaleDateString('fr-FR') : '—'}</td>
                      <td style={td}>
                        <a href={`/admin/crm/contacts/${c.hubspot_contact_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2ea3f2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          Ouvrir <ExternalLink size={10} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

// ─── Property Picker ───────────────────────────────────────────────────────

function PropertyPicker({
  properties, allCount, search, onSearchChange, picked, onPick, loading,
}: {
  properties: Property[]
  allCount: number
  search: string
  onSearchChange: (v: string) => void
  picked: Property | null
  onPick: (p: Property) => void
  loading: boolean
}) {
  const [open, setOpen] = useState(false)

  // Groupe par group_name
  const grouped = useMemo(() => {
    const out: Record<string, Property[]> = {}
    for (const p of properties.slice(0, 200)) {  // limite à 200 affichées
      const g = p.group_name || 'Autre'
      if (!out[g]) out[g] = []
      out[g].push(p)
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
  }, [properties])

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...input,
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: picked ? 600 : 400,
          color: picked ? '#1a2f4b' : '#94a3b8',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading ? 'Chargement…' : picked ? picked.label : 'Choisir une propriété…'}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#fff', border: '1px solid #cbd6e2', borderRadius: 8,
            zIndex: 100, maxHeight: 400, overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}>
            <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff' }}>
              <input
                type="text"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={`Rechercher parmi ${allCount} propriétés…`}
                autoFocus
                style={{ ...input, fontSize: 12 }}
              />
            </div>
            {grouped.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                Aucune propriété trouvée.
              </div>
            ) : grouped.map(([group, items]) => (
              <div key={group}>
                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', background: '#fafbfc' }}>
                  {group} ({items.length})
                </div>
                {items.map(p => (
                  <button
                    key={p.name}
                    onClick={() => { onPick(p); setOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 12px', background: 'transparent', border: 'none',
                      cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                      borderTop: '1px solid #f8fafc',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f8fa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ fontWeight: 500, color: '#1a2f4b' }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      <code>{p.name}</code> · {p.type}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {properties.length > 200 && (
              <div style={{ padding: 10, textAlign: 'center', fontSize: 10, color: '#94a3b8', borderTop: '1px solid #e2e8f0' }}>
                {properties.length - 200} autres propriétés masquées. Affine ta recherche.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, ...extra }
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
  textTransform: 'uppercase', marginBottom: 4,
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 13,
  width: '100%', boxSizing: 'border-box', background: '#fff', height: 36,
}
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
