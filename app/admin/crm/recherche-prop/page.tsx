'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Search, ChevronDown, ExternalLink, Database } from 'lucide-react'
import { isUserTypeProperty, buildUserNameIndex, type Owner } from '@/lib/crm-user-resolver'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Button, CrmV2Search, CrmV2TableCard, CrmV2Card,
  CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Avatar, CrmV2Pill, CrmV2Empty, CrmV2Input, CrmV2Select,
} from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin, AdminMobileList, AdminMobileRow, AdminEllipsis } from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'

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
  const isMobile = useIsMobile()
  // Filtre d'affichage sur les résultats déjà chargés
  const [resultFilter, setResultFilter] = useState('')

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
  const canSearch = !!pickedProp && !loading && !(opNeedsValue && !value)

  const shownResults = useMemo(() => {
    const q = resultFilter.trim().toLowerCase()
    if (!q) return results
    return results.filter(c =>
      [c.firstname, c.lastname, c.email, c.phone, c.classe_actuelle, c.formation_souhaitee, c.matched_value]
        .some(v => (v || '').toLowerCase().includes(q)),
    )
  }, [results, resultFilter])

  const matchedCell = (c: Contact) => c.matched_value ? (
    isUserProp && userIndex.get(c.matched_value) ? (
      <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{userIndex.get(c.matched_value)}</span>
        <span style={{ fontSize: 11, color: crmV2.textFaint }}>{c.matched_value}</span>
      </span>
    ) : (
      <CrmV2Pill style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.matched_value}</CrmV2Pill>
    )
  ) : (
    <span style={{ color: crmV2.textFaint, fontStyle: 'italic' }}>(vide)</span>
  )

  const fullName = (c: Contact) => [c.firstname, c.lastname].filter(Boolean).join(' ') || '—'
  const convDate = (c: Contact) => c.recent_conversion_date ? new Date(c.recent_conversion_date).toLocaleDateString('fr-FR') : '—'

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Recherche par propriété"
        subtitle={`Trouver les contacts selon la valeur d’une des ${properties.length || 829} propriétés — pour vérifier des données ou retrouver une valeur précise.`}
      />

      <CrmV2Body>
        {/* Constructeur du filtre */}
        <CrmV2Card style={{ padding: isMobile ? 12 : 16 }}>
          <div style={{
            display: isMobile ? 'grid' : 'flex',
            gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : undefined,
            alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ ...fieldWrap, minWidth: isMobile ? 0 : 260, flex: isMobile ? undefined : '1 1 260px' }}>
              <span style={labelStyle}>Propriété</span>
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

            <label style={{ ...fieldWrap, minWidth: isMobile ? 0 : 160 }}>
              <span style={labelStyle}>Opérateur</span>
              <CrmV2Select value={operator} onChange={e => setOperator(e.target.value)} disabled={!pickedProp} style={isMobile ? { height: 42 } : undefined}>
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </CrmV2Select>
            </label>

            <label style={{ ...fieldWrap, minWidth: isMobile ? 0 : 220, flex: isMobile ? undefined : '2 1 220px' }}>
              <span style={labelStyle}>Valeur</span>
              {!opNeedsValue ? (
                <CrmV2Input value="(pas de valeur requise)" disabled style={{ color: crmV2.textFaint, background: crmV2.bgHover }} />
              ) : isUserProp && owners.length > 0 ? (
                <CrmV2Select value={value} onChange={e => setValue(e.target.value)} style={isMobile ? { height: 42 } : undefined}>
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
                </CrmV2Select>
              ) : isEnum ? (
                <CrmV2Select value={value} onChange={e => setValue(e.target.value)} style={isMobile ? { height: 42 } : undefined}>
                  <option value="">— Choisir —</option>
                  {pickedProp!.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </CrmV2Select>
              ) : (
                <CrmV2Input
                  type={pickedProp?.type === 'number' ? 'number' : pickedProp?.type === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="Valeur à chercher…"
                  onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
                  style={isMobile ? { height: 42 } : undefined}
                />
              )}
            </label>

            <CrmV2Button
              variant="primary"
              icon={loading ? <AdminSpin /> : <Search size={14} />}
              onClick={runSearch}
              disabled={!canSearch}
              style={{ height: isMobile ? 44 : 38, ...(isMobile ? { width: '100%' } : {}) }}
            >
              Rechercher
            </CrmV2Button>
          </div>

          {pickedProp && (
            <div style={{ marginTop: 10, fontSize: 12, color: crmV2.textFaint, wordBreak: 'break-word' }}>
              <strong style={{ color: crmV2.textMuted }}>{pickedProp.label}</strong> · {pickedProp.name} · type {pickedProp.type}
              {pickedProp.group_name && <> · groupe {pickedProp.group_name}</>}
            </div>
          )}
        </CrmV2Card>

        {error && <AdminNotice tone="error">{error}</AdminNotice>}

        {/* Résultats */}
        {!pickedProp ? null : isMobile ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              Résultats
              {total > 0 && <span style={{ color: crmV2.textMuted, fontWeight: 400 }}>· {total.toLocaleString('fr-FR')} contacts</span>}
              {storage === 'hubspot_raw' && <span style={{ fontSize: 11, color: crmV2.textFaint, fontWeight: 400 }}>(via données brutes)</span>}
            </div>
            {loading && results.length === 0 ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><AdminSpin size={20} color={crmV2.gold} /></div>
            ) : results.length === 0 ? (
              <AdminMobileList>
                <CrmV2Empty icon={<Database size={26} />} title="Aucun contact" description="Aucun contact ne correspond. Essaye un autre opérateur ou une autre valeur." />
              </AdminMobileList>
            ) : (
              <AdminMobileList>
                {results.map((c, i) => (
                  <AdminMobileRow
                    key={c.hubspot_contact_id}
                    last={i === results.length - 1}
                    href={`/admin/crm/contacts/${c.hubspot_contact_id}`}
                  >
                    <CrmV2Avatar name={fullName(c)} size={36} radius="36%" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, color: crmV2.link }}>{fullName(c)}</AdminEllipsis>
                      <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>
                        {c.matched_value
                          ? (isUserProp && userIndex.get(c.matched_value)) || c.matched_value
                          : '(vide)'}
                        {' · '}{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                      </AdminEllipsis>
                    </div>
                    <span style={{ fontSize: 11, color: crmV2.textFaint, flexShrink: 0 }}>{convDate(c)}</span>
                  </AdminMobileRow>
                ))}
              </AdminMobileList>
            )}
          </>
        ) : (
          <CrmV2TableCard
            toolbar={
              <>
                <CrmV2Search placeholder="Filtrer les résultats…" value={resultFilter} onChange={e => setResultFilter(e.target.value)} />
                <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text }}>
                  Résultats {total > 0 && <span style={{ color: crmV2.textMuted, fontWeight: 400 }}>· {total.toLocaleString('fr-FR')} contacts</span>}
                  {storage === 'hubspot_raw' && <span style={{ marginLeft: 8, fontSize: 11, color: crmV2.textFaint, fontWeight: 400 }}>(via données brutes)</span>}
                </span>
              </>
            }
            footer={results.length > 0 ? (
              <>
                <span>{total.toLocaleString('fr-FR')} contact{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}</span>
                <span style={{ fontSize: 12, color: crmV2.textFaint }}>50 premiers résultats triés par dernière conversion</span>
              </>
            ) : undefined}
          >
            {loading && results.length === 0 ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><AdminSpin size={20} color={crmV2.gold} /></div>
            ) : results.length === 0 ? (
              <CrmV2Empty icon={<Database size={26} />} title="Aucun contact" description="Aucun contact ne correspond. Essaye un autre opérateur ou une autre valeur." />
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th>Nom</CrmV2Th>
                    <CrmV2Th>Email / Téléphone</CrmV2Th>
                    <CrmV2Th>Classe / Formation</CrmV2Th>
                    <CrmV2Th>Valeur trouvée</CrmV2Th>
                    <CrmV2Th>Dern. conversion</CrmV2Th>
                    <CrmV2Th>{''}</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {shownResults.map(c => (
                    <CrmV2Tr key={c.hubspot_contact_id}>
                      <CrmV2Td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                          <CrmV2Avatar name={fullName(c)} size={24} radius="36%" ring />
                          <span style={{ display: 'flex', flexDirection: 'column' }}>
                            <a href={`/admin/crm/contacts/${c.hubspot_contact_id}`} target="_blank" rel="noopener noreferrer" style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>
                              {fullName(c)}
                            </a>
                            <span style={{ fontSize: 11, color: crmV2.textFaint }}>{c.hubspot_contact_id}</span>
                          </span>
                        </span>
                      </CrmV2Td>
                      <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                        {c.email || '—'}
                        {c.phone && <span style={{ color: crmV2.textMuted }}> · {c.phone}</span>}
                      </CrmV2Td>
                      <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>
                        {[c.classe_actuelle, c.formation_souhaitee].filter(Boolean).join(' · ') || '—'}
                      </CrmV2Td>
                      <CrmV2Td style={{ maxWidth: 260 }}>{matchedCell(c)}</CrmV2Td>
                      <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>{convDate(c)}</CrmV2Td>
                      <CrmV2Td>
                        <a href={`/admin/crm/contacts/${c.hubspot_contact_id}`} target="_blank" rel="noopener noreferrer" style={{ color: crmV2.link, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                          Ouvrir <ExternalLink size={12} />
                        </a>
                      </CrmV2Td>
                    </CrmV2Tr>
                  ))}
                </tbody>
              </CrmV2Table>
            )}
          </CrmV2TableCard>
        )}
      </CrmV2Body>
    </CrmV2Page>
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
  const isMobile = useIsMobile()

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
        type="button"
        onClick={e => { e.preventDefault(); setOpen(o => !o) }}
        style={{
          width: '100%', height: isMobile ? 42 : 38, boxSizing: 'border-box',
          border: `1px solid ${open ? crmV2.link : crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 12px',
          background: crmV2.bg, fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: picked ? 600 : 400,
          color: picked ? crmV2.text : crmV2.textFaint,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading ? 'Chargement…' : picked ? picked.label : 'Choisir une propriété…'}
        </span>
        <ChevronDown size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, minWidth: isMobile ? 0 : 320,
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
            zIndex: 100, maxHeight: 400, overflowY: 'auto', boxShadow: crmV2.shadowPanel,
          }}>
            <div style={{ padding: 8, borderBottom: `1px solid ${crmV2.border}`, position: 'sticky', top: 0, background: crmV2.bg, zIndex: 1 }}>
              <CrmV2Search
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={`Rechercher parmi ${allCount} propriétés…`}
                autoFocus
                style={{ minWidth: 0 }}
              />
            </div>
            {grouped.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: crmV2.textFaint, fontSize: 13 }}>
                Aucune propriété trouvée.
              </div>
            ) : grouped.map(([group, items]) => (
              <div key={group}>
                <div style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', color: crmV2.textMuted,
                  textTransform: 'uppercase', background: crmV2.thBg,
                }}>
                  {group} ({items.length})
                </div>
                {items.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => { onPick(p); setOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', minHeight: 40,
                      padding: '7px 12px', background: 'transparent', border: 'none',
                      cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      borderTop: `1px solid ${crmV2.borderLight}`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = crmV2.rowHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ fontWeight: 600, color: crmV2.text }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                      {p.name} · {p.type}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {properties.length > 200 && (
              <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: crmV2.textFaint, borderTop: `1px solid ${crmV2.border}` }}>
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

const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: crmV2.textMuted }
