'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Plus, FileText, Hash, Calendar, ListChecks, ToggleLeft, Phone, RefreshCw, Database, Lock } from 'lucide-react'
import { isUserTypeProperty, buildUserNameIndex, type Owner } from '@/lib/crm-user-resolver'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2Button, CrmV2Search, CrmV2TableCard,
  CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Pill, CrmV2Empty, CrmV2Spinner, CrmV2Drawer, CrmV2CloseButton,
  CrmV2Field, CrmV2Input, CrmV2Select, CrmV2Textarea, CrmV2SectionLabel, CrmV2StatusPill,
} from '@/components/crm-v2/primitives'
import {
  AdminNotice, AdminModal, AdminIconCell, AdminPillSelect, AdminMobileList, AdminMobileRow, AdminEllipsis, AdminSpin,
} from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'

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
  const [syncing, setSyncing] = useState(false)
  const isMobile = useIsMobile()
  // Filtre d'affichage par groupe (barre d'outils)
  const [groupFilter, setGroupFilter] = useState('')

  async function resyncFromHubSpot() {
    if (!confirm(`Re-synchroniser toutes les propriétés ${object} ? Met à jour notamment les options (valeurs prédéfinies).`)) return
    setSyncing(true)
    try {
      const res = await fetch(`/api/crm/properties/sync?object=${object}`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDoneMessage(`Re-sync OK : ${j.total} propriétés (${j.with_options} avec options)`)
      load()
      setTimeout(() => setDoneMessage(null), 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

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
  const groupNames = useMemo(
    () => [...new Set(properties.map(p => p.group_name || 'Sans groupe'))].sort((a, b) => a.localeCompare(b)),
    [properties],
  )

  const grouped = useMemo(() => {
    const out: Record<string, Property[]> = {}
    for (const p of filtered) {
      if (groupFilter && (p.group_name || 'Sans groupe') !== groupFilter) continue
      const g = p.group_name || 'Sans groupe'
      if (!out[g]) out[g] = []
      out[g].push(p)
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered, groupFilter])

  // Changer d'objet remet le filtre de groupe à zéro
  useEffect(() => { setGroupFilter('') }, [object])
  const shownCount = grouped.reduce((n, [, props]) => n + props.length, 0)

  const optionsCell = (p: Property) => p.options && Array.isArray(p.options) && p.options.length > 0 ? (
    <span>
      {p.options.slice(0, 4).map(o => o.label).join(', ')}
      {p.options.length > 4 && <span style={{ color: crmV2.textFaint }}> +{p.options.length - 4}</span>}
    </span>
  ) : p.hubspot_defined ? (
    <span style={{ color: crmV2.textFaint }}>Propriété native</span>
  ) : (
    <span style={{ color: crmV2.textFaint }}>—</span>
  )

  const typeChip = (p: Property) => {
    const Icon = TYPE_ICONS[p.type] || FileText
    return <CrmV2Pill><Icon size={12} /> {p.field_type}</CrmV2Pill>
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Propriétés CRM"
        subtitle="Propriétés des contacts et des transactions — synchronisées ou créées en interne"
        actions={
          <>
            <CrmV2Button
              variant="secondary"
              icon={syncing ? <AdminSpin /> : <RefreshCw size={14} />}
              onClick={resyncFromHubSpot}
              disabled={syncing}
            >
              {syncing ? 'Synchronisation…' : 'Re-synchroniser'}
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              {isMobile ? 'Créer' : 'Créer une propriété'}
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={object}
          onChange={id => setObject(id as 'contacts' | 'deals')}
          items={[
            { id: 'contacts', label: 'Contacts', count: object === 'contacts' && !loading ? properties.length : undefined },
            { id: 'deals', label: 'Transactions', count: object === 'deals' && !loading ? properties.length : undefined },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        {doneMessage && <AdminNotice tone="success">{doneMessage}</AdminNotice>}

        {isMobile ? (
          <>
            <CrmV2Search
              placeholder="Rechercher une propriété…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: 40 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <AdminPillSelect value={groupFilter} onChange={e => setGroupFilter(e.target.value)} aria-label="Groupe" style={{ minHeight: 40, maxWidth: 220 }}>
                <option value="">Tous les groupes</option>
                {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </AdminPillSelect>
              <span style={{ fontSize: 12, color: crmV2.textMuted }}>{shownCount} / {properties.length}</span>
            </div>
            {loading ? (
              <CrmV2Spinner />
            ) : grouped.length === 0 ? (
              <AdminMobileList><CrmV2Empty icon={<Database size={26} />} title="Aucune propriété" description="Aucune propriété ne correspond à ta recherche." /></AdminMobileList>
            ) : grouped.map(([groupName, props]) => (
              <div key={groupName} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <CrmV2SectionLabel>{groupName} <span style={{ color: crmV2.textFaint }}>({props.length})</span></CrmV2SectionLabel>
                <AdminMobileList>
                  {props.map((p, i) => (
                    <AdminMobileRow key={p.name} last={i === props.length - 1} onClick={() => setDetail(p)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, color: crmV2.link }}>{p.label}</AdminEllipsis>
                        <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>{p.name}</AdminEllipsis>
                      </div>
                      <span style={{ flexShrink: 0 }}>{typeChip(p)}</span>
                    </AdminMobileRow>
                  ))}
                </AdminMobileList>
              </div>
            ))}
          </>
        ) : (
          <CrmV2TableCard
            toolbar={
              <>
                <CrmV2Search
                  placeholder="Rechercher une propriété…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <AdminPillSelect value={groupFilter} onChange={e => setGroupFilter(e.target.value)} aria-label="Groupe">
                  <option value="">Groupe : tous</option>
                  {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
                </AdminPillSelect>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: crmV2.textMuted }}>
                  {shownCount} / {properties.length} propriétés
                </span>
              </>
            }
            footer={!loading ? <span>{shownCount} propriété{shownCount > 1 ? 's' : ''} · {grouped.length} groupe{grouped.length > 1 ? 's' : ''}</span> : undefined}
          >
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><AdminSpin size={22} color={crmV2.gold} /></div>
                Chargement des propriétés…
              </div>
            ) : grouped.length === 0 ? (
              <CrmV2Empty icon={<Database size={26} />} title="Aucune propriété" description="Aucune propriété ne correspond à ta recherche." />
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th>Label</CrmV2Th>
                    <CrmV2Th>Nom technique</CrmV2Th>
                    <CrmV2Th>Type</CrmV2Th>
                    <CrmV2Th>Options / Source</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([groupName, props]) => (
                    <GroupRows key={groupName} name={groupName} count={props.length}>
                      {props.map(p => (
                        <CrmV2Tr key={p.name} onClick={() => setDetail(p)}>
                          <CrmV2Td style={{ maxWidth: 380 }}>
                            <AdminIconCell icon={<Database size={14} />} sub={p.description || undefined}>{p.label}</AdminIconCell>
                          </CrmV2Td>
                          <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{p.name}</CrmV2Td>
                          <CrmV2Td>{typeChip(p)}</CrmV2Td>
                          <CrmV2Td style={{ color: crmV2.textMuted, fontSize: 12, maxWidth: 360 }}>
                            <AdminEllipsis>{optionsCell(p)}</AdminEllipsis>
                          </CrmV2Td>
                        </CrmV2Tr>
                      ))}
                    </GroupRows>
                  ))}
                </tbody>
              </CrmV2Table>
            )}
          </CrmV2TableCard>
        )}
      </CrmV2Body>

      {/* Fenêtre de création */}
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
    </CrmV2Page>
  )
}

/** Ligne d'intitulé de groupe dans le tableau, suivie de ses propriétés. */
function GroupRows({ name, count, children }: { name: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={4} style={{
          padding: '14px 14px 6px', background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`,
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted,
        }}>
          {name} <span style={{ color: crmV2.textFaint }}>({count})</span>
        </td>
      </tr>
      {children}
    </>
  )
}

// ─── Fiche propriété (lecture seule) ───────────────────────────────────────
function PropertyDetailModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const [actualValues, setActualValues] = useState<Array<{ value: string; count: number }> | null>(null)
  const [valuesLoading, setValuesLoading] = useState(true)
  const [valuesSource, setValuesSource] = useState<string>('')
  const [owners, setOwners] = useState<Owner[]>([])

  const isUserProp = isUserTypeProperty(property.name)
  const userIndex = useMemo(() => buildUserNameIndex(owners), [owners])

  // Charge les owners si la prop est de type User (pour résoudre IDs → noms)
  useEffect(() => {
    if (!isUserProp) return
    fetch('/api/crm/owners')
      .then(r => r.json())
      .then(j => setOwners(j.owners || []))
      .catch(() => setOwners([]))
  }, [isUserProp])

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
  const isMobile = useIsMobile()

  const miniTh: React.CSSProperties = {
    textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: crmV2.textMuted, background: crmV2.thBg, borderBottom: `2px solid ${crmV2.thBorder}`,
    position: 'sticky', top: 0,
  }
  const miniTd: React.CSSProperties = { padding: '8px 12px', borderBottom: `1px solid ${crmV2.borderLight}`, fontSize: 13 }

  return (
    <CrmV2Drawer
      open
      onClose={onClose}
      width={600}
      header={
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 700, wordBreak: 'break-word' }}>{property.label}</span>
              {property.archived && <CrmV2StatusPill label="Archivée" color={crmV2.textMuted} />}
            </div>
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, wordBreak: 'break-all' }}>{property.name}</div>
          </div>
          <CrmV2CloseButton onClick={onClose} />
        </div>
      }
      footer={<CrmV2Button variant="secondary" onClick={onClose} style={{ marginLeft: 'auto', ...(isMobile ? { flex: 1, minHeight: 44 } : {}) }}>Fermer</CrmV2Button>}
    >
      <div style={{ padding: isMobile ? 16 : 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Métadonnées */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Meta label="Type technique">{property.type}</Meta>
          <Meta label="Type de champ">{property.field_type}</Meta>
          <Meta label="Groupe">{property.group_name || '—'}</Meta>
          <Meta label="Source">{property.hubspot_defined ? 'Native' : 'Locale Diploma'}</Meta>
          {property.display_order != null && <Meta label="Ordre d’affichage">{property.display_order}</Meta>}
          {property.archived && <Meta label="État">Archivée</Meta>}
        </div>

        {property.description && (
          <div style={{ padding: 12, background: crmV2.bgSoft, borderRadius: 12, fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
            {property.description}
          </div>
        )}

        {/* Options prédéfinies */}
        {property.options && property.options.length > 0 && (
          <div>
            <CrmV2SectionLabel style={{ marginBottom: 8 }}>Valeurs prédéfinies ({property.options.length})</CrmV2SectionLabel>
            <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ ...miniTh, width: '50%' }}>Label affiché</th>
                    <th style={miniTh}>Valeur stockée</th>
                  </tr>
                </thead>
                <tbody>
                  {property.options.map((opt, i) => (
                    <tr key={i}>
                      <td style={{ ...miniTd, fontWeight: 600 }}>{opt.label}</td>
                      <td style={{ ...miniTd, color: crmV2.textMuted, wordBreak: 'break-all' }}>{opt.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Valeurs réellement utilisées en base */}
        <div>
          <CrmV2SectionLabel style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            Valeurs utilisées dans la base
            {actualValues && actualValues.length > 0 && (
              <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: crmV2.textFaint }}>
                · {actualValues.length} distinctes · {totalCount.toLocaleString('fr-FR')} {property.object_type === 'deals' ? 'transactions' : 'contacts'}
                {valuesSource === 'hubspot_raw' && ' · depuis les données brutes'}
              </span>
            )}
          </CrmV2SectionLabel>
          {valuesLoading ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><AdminSpin size={18} color={crmV2.gold} /></div>
          ) : !actualValues || actualValues.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: crmV2.textFaint, fontSize: 13, background: crmV2.bgHover, border: `1px dashed ${crmV2.borderStrong}`, borderRadius: 12 }}>
              Aucune valeur trouvée. La propriété est peut-être vide partout, ou la migration v23
              (RPC d&apos;extraction) n&apos;a pas été appliquée.
            </div>
          ) : (
            <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={miniTh}>Valeur</th>
                    <th style={{ ...miniTh, textAlign: 'right', width: 110 }}>{property.object_type === 'deals' ? 'Transactions' : 'Contacts'}</th>
                    <th style={{ ...miniTh, textAlign: 'right', width: 60 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {actualValues.map((v, i) => {
                    const resolved = isUserProp && v.value ? userIndex.get(String(v.value)) : null
                    return (
                      <tr key={i}>
                        <td style={{ ...miniTd, wordBreak: 'break-all' }}>
                          {v.value ? (
                            resolved ? (
                              <>
                                <div style={{ fontWeight: 600 }}>{resolved}</div>
                                <div style={{ fontSize: 11, color: crmV2.textFaint }}>{v.value}</div>
                              </>
                            ) : (
                              <span>{v.value}</span>
                            )
                          ) : (
                            <span style={{ color: crmV2.textFaint, fontStyle: 'italic' }}>(vide)</span>
                          )}
                        </td>
                        <td style={{ ...miniTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {Number(v.count).toLocaleString('fr-FR')}
                        </td>
                        <td style={{ ...miniTd, textAlign: 'right', color: crmV2.textFaint, fontVariantNumeric: 'tabular-nums' }}>
                          {totalCount > 0 ? ((Number(v.count) / totalCount) * 100).toFixed(1) : '0'}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Note édition */}
        <AdminNotice tone="warning" icon={<Lock size={15} />}>
          <strong>Lecture seule pour l&apos;instant.</strong> L&apos;édition est désactivée tant que le miroir de synchronisation
          tourne (sinon la synchronisation écraserait tes modifs). Elle sera réactivée quand le miroir sera coupé.
        </AdminNotice>
      </div>
    </CrmV2Drawer>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: crmV2.text, fontWeight: 600, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

// ─── Fenêtre de création ───────────────────────────────────────────────────
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
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
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
    <AdminModal
      open
      onClose={onClose}
      closeDisabled={saving}
      width={600}
      title={`Nouvelle propriété (${objectType === 'deals' ? 'transactions' : 'contacts'})`}
      subtitle="Visible immédiatement dans les fiches contact, les formulaires et les workflows."
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={submit} disabled={saving} icon={saving ? <AdminSpin /> : undefined}>
            {saving ? 'Création…' : 'Créer'}
          </CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 16px' }}>
        <CrmV2Field label="Label *" hint="Ex : « Université préférée »">
          <CrmV2Input
            type="text" value={label}
            onChange={e => { setLabel(e.target.value); if (!name) setName(deriveName(e.target.value)) }}
            placeholder="Mon nouveau champ"
          />
        </CrmV2Field>

        <CrmV2Field label="Nom technique" hint="Auto-généré, modifiable. Lettres minuscules, chiffres, underscores.">
          <CrmV2Input
            type="text" value={name}
            onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="mon_champ_custom"
          />
        </CrmV2Field>

        <CrmV2Field label="Type">
          <CrmV2Select value={fieldType} onChange={e => setFieldType(e.target.value)}>
            {FIELD_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>

        <CrmV2Field label="Groupe" hint="Pour ranger la propriété dans la fiche contact (ex : custom, marketing…)">
          <CrmV2Input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} />
        </CrmV2Field>

        {needsOptions && (
          <CrmV2Field label="Options *" hint="Une ligne = une option. Format « label » ou « label|valeur »" style={{ gridColumn: '1 / -1' }}>
            <CrmV2Textarea
              value={optionsText}
              onChange={e => setOptionsText(e.target.value)}
              placeholder={'Option 1\nOption 2\nOption 3'}
              rows={5}
            />
          </CrmV2Field>
        )}

        <CrmV2Field label="Description (optionnelle)" style={{ gridColumn: '1 / -1' }}>
          <CrmV2Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Aide pour les utilisateurs"
            style={{ minHeight: 60 }}
          />
        </CrmV2Field>
      </div>

      {err && <AdminNotice tone="error" style={{ marginTop: 14 }}>{err}</AdminNotice>}
    </AdminModal>
  )
}
