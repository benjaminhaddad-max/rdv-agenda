'use client'

import { useEffect, useState, useCallback, use, type ReactNode } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  StickyNote, Mail, Phone, CheckSquare, Calendar, Plus, User, Briefcase, MapPin,
  Check, X, ExternalLink, SlidersHorizontal, Clock, ChevronDown,
} from 'lucide-react'
import QuickActionModal, { type QuickActionType } from '@/components/crm/QuickActionModal'
import { resolveActivityAuthorLabel } from '@/lib/activity-author'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2, crmV2ActivityColors } from '@/lib/crm-v2-theme'
import { getStageMeta, PIPELINES } from '@/lib/crm-stages'
import {
  CrmV2Page, CrmV2Button, CrmV2Spinner, CrmV2Empty, CrmV2Section, CrmV2StatusPill, CrmV2Pill,
  CrmV2Avatar, CrmV2Drawer, CrmV2CloseButton, CrmV2Search, CrmV2Input, CrmV2Select, hexA,
} from '@/components/crm-v2/primitives'
import {
  RecordHeader, RecordMeta, RecordBody, RecordCard, RecordSideStack, PropRow, RoundIconButton, EmptyBlock,
} from '@/components/crm-v2/deal/RecordParts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface CRMProperty {
  name: string
  label: string
  group_name: string
  type: string
  field_type: string
  options?: Array<{ label: string; value: string }>
  display_order?: number
}

interface Activity {
  id: number
  activity_type: string
  subject?: string
  body?: string
  direction?: string
  status?: string
  owner_id?: string | null
  metadata?: Record<string, unknown> | null
  hubspot_engagement_id?: string | null
  occurred_at: string
}

interface Owner {
  hubspot_owner_id: string
  email?: string
  firstname?: string
  lastname?: string
}

interface DealDetails {
  deal: Record<string, Any>
  contact: Record<string, Any> | null
  appointment: Record<string, Any> | null
  properties: CRMProperty[]
  groups: Record<string, CRMProperty[]>
  activities: Activity[]
  tasks?: Array<Record<string, Any>>
  owners?: Owner[]
}

type TimelineTab = 'all' | 'note' | 'email' | 'call' | 'task' | 'meeting'

const ABOUT_FIELDS: Array<{ name: string; label: string }> = [
  { name: 'dealname',                     label: 'Nom de la transaction' },
  { name: 'dealstage',                    label: 'Étape' },
  { name: 'pipeline',                     label: 'Pipeline' },
  { name: 'diploma_sante___formation',    label: 'Formation' },
  { name: 'closedate',                    label: 'Date de clôture' },
  { name: 'createdate',                   label: 'Date de création' },
  { name: 'hubspot_owner_id',             label: 'Propriétaire' },
  { name: 'teleprospecteur',              label: 'Téléprospecteur' },
  { name: 'description',                  label: 'Description' },
]

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<DealDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  usePageTitle(data?.deal?.dealname)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [timelineTab, setTimelineTab] = useState<TimelineTab>('all')
  const [timelineSearch, setTimelineSearch] = useState('')
  const [showAllProps, setShowAllProps] = useState(false)
  const [propSearch, setPropSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [quickAction, setQuickAction] = useState<QuickActionType | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; hubspot_owner_id?: string | null } | null>(null)
  const [crmUsers, setCrmUsers] = useState<Array<{ id: string; name: string; email?: string | null; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }>>([])
  const isMobile = useIsMobile()

  useEffect(() => {
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.id) setCurrentUser(d) })
      .catch(() => {})
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCrmUsers(d) })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/deals/${id}/details`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <CrmV2Page><CrmV2Spinner /></CrmV2Page>
  if (err) return <CrmV2Page><CrmV2Empty icon={<Briefcase size={26} />} title="Erreur de chargement" description={`Erreur : ${err}`} /></CrmV2Page>
  if (!data) return <CrmV2Page><CrmV2Empty icon={<Briefcase size={26} />} title="Aucune donnée." /></CrmV2Page>

  const { deal, contact, appointment, properties, groups, activities, tasks = [], owners = [] } = data

  // Options pour les dropdowns "Propriétaire" / "Téléprospecteur"
  const ownerOptions = owners.map(o => ({
    value: o.hubspot_owner_id,
    label: [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id,
  }))

  const allValues: Record<string, Any> = {
    ...(deal.hubspot_raw ?? {}),
    dealname:                   deal.dealname,
    dealstage:                  deal.dealstage,
    pipeline:                   deal.pipeline,
    hubspot_owner_id:           deal.hubspot_owner_id,
    teleprospecteur:            deal.teleprospecteur,
    closedate:                  deal.closedate,
    createdate:                 deal.createdate,
    description:                deal.description,
    diploma_sante___formation:  deal.formation,
  }

  const propMeta: Record<string, CRMProperty> = {}
  for (const p of properties) propMeta[p.name] = p

  const saveProp = async (propName: string, value: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/deals/${id}/prop`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property: propName, value }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
      setEditing(null)
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const ownerLabelMap: Record<string, string> = {}
  for (const u of crmUsers) {
    const label = u.name || u.email || u.id
    if (u.hubspot_owner_id) ownerLabelMap[u.hubspot_owner_id] = label
    if (u.hubspot_user_id) ownerLabelMap[u.hubspot_user_id] = label
    ownerLabelMap[u.id] = label
  }
  for (const o of owners) {
    if (!ownerLabelMap[o.hubspot_owner_id]) {
      ownerLabelMap[o.hubspot_owner_id] =
        [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
    }
  }
  const ownerLabel = (id?: string | null) => {
    if (!id) return '—'
    return ownerLabelMap[id] || id
  }
  const actorOwnerId = currentUser?.hubspot_owner_id ?? currentUser?.id ?? null

  type TimelineItem = {
    id: string
    type: 'note' | 'call' | 'email' | 'meeting' | 'task'
    timestamp: number
    title: string
    body?: string
    subtitle?: string
    ownerId?: string
    authorLabel?: string | null
  }
  const timeline: TimelineItem[] = activities.map(a => {
    const t = a.activity_type.toLowerCase()
    const valid: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task']
    const type = (valid.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
    return {
      id: `act-${a.id}`,
      type,
      timestamp: new Date(a.occurred_at).getTime(),
      title: a.subject || labelForType(type),
      body: a.body ?? undefined,
      subtitle: a.direction ? `Direction : ${a.direction}` : undefined,
      ownerId: a.owner_id ?? undefined,
      authorLabel: resolveActivityAuthorLabel(
        { owner_id: a.owner_id, metadata: a.metadata as Record<string, unknown> | null, hubspot_engagement_id: null },
        ownerLabelMap,
      ),
    }
  })
  timeline.sort((a, b) => b.timestamp - a.timestamp)

  const timelineFiltered = timeline.filter(t => {
    if (timelineTab === 'all') return true
    return t.type === timelineTab
  }).filter(t => {
    if (!timelineSearch) return true
    const s = timelineSearch.toLowerCase()
    return t.title.toLowerCase().includes(s) || (t.body ?? '').toLowerCase().includes(s)
  })

  const grouped: Record<string, TimelineItem[]> = {}
  for (const it of timelineFiltered) {
    const key = format(new Date(it.timestamp), 'MMMM yyyy', { locale: fr })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(it)
  }

  const counts = {
    all: timeline.length,
    note: timeline.filter(t => t.type === 'note').length,
    email: timeline.filter(t => t.type === 'email').length,
    call: timeline.filter(t => t.type === 'call').length,
    task: timeline.filter(t => t.type === 'task').length,
    meeting: timeline.filter(t => t.type === 'meeting').length,
  }

  const lc = propSearch.toLowerCase()
  const filteredGroups: Record<string, CRMProperty[]> = {}
  for (const [g, props] of Object.entries(groups)) {
    const f = props.filter(p => !lc || (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc))
    if (f.length > 0) filteredGroups[g] = f
  }

  const toggleGroup = (g: string) => setCollapsed(s => ({ ...s, [g]: !s[g] }))

  // ── Rendu (gabarit B) ──────────────────────────────────────────────────────

  const contactName = contact ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') : ''
  const stageMeta = deal.dealstage ? getStageMeta(String(deal.dealstage)) : undefined
  const pipelineLabel = deal.pipeline ? PIPELINES[String(deal.pipeline)]?.label : undefined
  const ownerName = deal.hubspot_owner_id ? ownerLabel(String(deal.hubspot_owner_id)) : null
  const titleText = (deal.dealname as string) || '(sans nom)'
  const initials = titleText.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  const classe = contact?.classe_actuelle as string | undefined
  const zone = (contact?.zone_localite || contact?.departement) as string | undefined

  const tlTabs: { id: TimelineTab; label: string }[] = [
    { id: 'all', label: 'Toutes' },
    { id: 'note', label: 'Notes' },
    { id: 'email', label: 'E-mails' },
    { id: 'call', label: 'Appels' },
    { id: 'task', label: 'Tâches' },
    { id: 'meeting', label: 'Réunions' },
  ]

  // Éditeur en ligne d'une propriété (liste ou texte)
  const renderEditor = (propName: string, opts: Array<{ value: string; label: string }> | null | undefined) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }} onClick={e => e.stopPropagation()}>
      {opts ? (
        <CrmV2Select value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus style={{ height: 32, flex: 1, minWidth: 0 }}>
          <option value="">—</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </CrmV2Select>
      ) : (
        <CrmV2Input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus style={{ height: 32, flex: 1, minWidth: 0 }} />
      )}
      <RoundIconButton icon={<Check size={14} />} variant="primary" title="Enregistrer" onClick={() => saveProp(propName, editValue)} disabled={saving} />
      <RoundIconButton icon={<X size={14} />} title="Annuler" onClick={() => setEditing(null)} />
    </div>
  )

  const empty = <span style={{ color: crmV2.textFaint }}>—</span>

  return (
    <CrmV2Page style={isMobile ? undefined : { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <RecordHeader
        back={{ href: '/admin/crm/transactions', label: 'Transactions' }}
        avatar={initials || <Briefcase size={22} />}
        title={titleText}
        meta={contact ? (
          <>
            {contact.email && <RecordMeta icon={<Mail size={13} />} href={`mailto:${contact.email}`}>{contact.email as string}</RecordMeta>}
            {contact.phone && <RecordMeta icon={<Phone size={13} />} href={`tel:${contact.phone}`}>{contact.phone as string}</RecordMeta>}
            {zone && <RecordMeta icon={<MapPin size={13} />}>{zone}</RecordMeta>}
          </>
        ) : undefined}
        actions={
          <>
            <CrmV2Button size={isMobile ? 'sm' : 'md'} icon={<StickyNote size={14} />} onClick={() => setQuickAction('note')}>Note</CrmV2Button>
            <CrmV2Button size={isMobile ? 'sm' : 'md'} icon={<Mail size={14} />} onClick={() => setQuickAction('email')}>Email</CrmV2Button>
            <CrmV2Button size={isMobile ? 'sm' : 'md'} icon={<Phone size={14} />} onClick={() => setQuickAction('call')}>Appeler</CrmV2Button>
            <CrmV2Button size={isMobile ? 'sm' : 'md'} icon={<CheckSquare size={14} />} onClick={() => setQuickAction('task')}>Tâche</CrmV2Button>
            <CrmV2Button size={isMobile ? 'sm' : 'md'} variant="accent" icon={<Calendar size={14} />} onClick={() => setQuickAction('meeting')}>Réunion</CrmV2Button>
          </>
        }
        pills={
          <>
            {stageMeta && <CrmV2StatusPill label={stageMeta.label} color={stageMeta.color} bg={stageMeta.bg} size="md" />}
            {pipelineLabel && <CrmV2Pill>{pipelineLabel}</CrmV2Pill>}
            {(deal.formation || classe) && (
              <CrmV2Pill style={{ background: crmV2.goldSoft, borderColor: crmV2.goldBorder, color: crmV2.goldDark, fontWeight: 700 }}>
                {[deal.formation as string | undefined, classe].filter(Boolean).join(' · ')}
              </CrmV2Pill>
            )}
            {ownerName && ownerName !== '—' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted, marginLeft: 4 }}>
                <CrmV2Avatar name={ownerName} size={20} />
                Propriétaire : {ownerName}
              </span>
            )}
          </>
        }
      />

      <RecordBody>
        {/* ══ Gauche : à propos ══ */}
        <RecordCard
          title="À propos de la transaction"
          collapsible
          action={
            <button
              type="button"
              onClick={() => setShowAllProps(true)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: crmV2.link, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              Tout voir
            </button>
          }
          bodyStyle={{ padding: '8px 8px 16px', display: 'flex', flexDirection: 'column' }}
        >
          {ABOUT_FIELDS.map(f => {
            const val = allValues[f.name]
            const meta = propMeta[f.name]
            const isEditing = editing === f.name
            const isOwnerField = f.name === 'hubspot_owner_id' || f.name === 'teleprospecteur'
            const opts = isOwnerField ? ownerOptions : (meta?.field_type === 'select' || meta?.field_type === 'radio' ? meta.options : null)
            return (
              <PropRow
                key={f.name}
                label={f.label}
                onClick={isEditing ? undefined : () => { setEditing(f.name); setEditValue(String(val ?? '')) }}
              >
                {isEditing ? renderEditor(f.name, opts) : (
                  isOwnerField
                    ? (ownerOptions.find(o => o.value === String(val))?.label ?? (formatPropValue(val, meta) || empty))
                    : f.name === 'dealstage' && stageMeta
                      ? <CrmV2StatusPill label={stageMeta.label} color={stageMeta.color} bg={stageMeta.bg} />
                      : (formatPropValue(val, meta) || empty)
                )}
              </PropRow>
            )
          })}
          <button
            type="button"
            onClick={() => setShowAllProps(true)}
            style={{
              margin: '8px 8px 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRadius: 999, padding: '9px 14px', fontSize: 13, fontWeight: 600, background: crmV2.bg,
              border: `1px dashed ${crmV2.borderStrong}`, color: crmV2.link, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            <SlidersHorizontal size={14} /> Voir toutes les propriétés ({properties.length})
          </button>
        </RecordCard>

        {/* ══ Centre : activité ══ */}
        <RecordCard style={isMobile ? undefined : { minHeight: 0 }} bodyStyle={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', padding: '0 6px', overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0 }}>
              {tlTabs.map(t => {
                const active = timelineTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTimelineTab(t.id)}
                    style={{
                      appearance: 'none', background: 'none', border: 'none', marginBottom: -1,
                      borderBottom: `3px solid ${active ? crmV2.text : 'transparent'}`,
                      padding: '12px 10px', whiteSpace: 'nowrap', flexShrink: 0, fontSize: 13,
                      fontWeight: active ? 700 : 500, color: active ? crmV2.text : crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {t.label}
                    <span style={{ marginLeft: 5, fontSize: 11, color: crmV2.textFaint, fontWeight: 600 }}>{counts[t.id]}</span>
                  </button>
                )
              })}
            </div>
            <span style={{ marginRight: 8, flexShrink: 0, display: 'inline-flex' }}>
              <RoundIconButton icon={<Plus size={15} />} title="Ajouter une note" onClick={() => setQuickAction('note')} />
            </span>
          </div>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
            <CrmV2Search
              value={timelineSearch}
              onChange={e => setTimelineSearch(e.target.value)}
              placeholder="Rechercher dans la timeline…"
              style={{ background: crmV2.bgHover, borderColor: crmV2.border, minWidth: 0 }}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: isMobile ? 'visible' : 'auto', padding: '12px 16px 20px' }}>
            {timelineFiltered.length === 0 ? (
              <div style={{ padding: '40px 12px', textAlign: 'center', fontSize: 13, color: crmV2.textFaint }}>
                Aucune activité enregistrée sur cette transaction.
              </div>
            ) : (
              Object.entries(grouped).map(([month, items]) => (
                <div key={month} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: crmV2.textFaint, padding: '4px 0 10px' }}>
                    {month}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map(t => (
                      <div key={t.id} style={{ display: 'flex', gap: 12, border: `1px solid ${crmV2.border}`, borderRadius: 14, padding: '12px 14px', background: crmV2.bg }}>
                        <TypeIcon type={t.type} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{t.title}</span>
                            <span style={{ fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {format(new Date(t.timestamp), "d MMM 'à' HH:mm", { locale: fr })}
                            </span>
                          </div>
                          {(t.subtitle || (t.authorLabel && ['note', 'call', 'email', 'meeting'].includes(t.type))) && (
                            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {t.authorLabel && ['note', 'call', 'email', 'meeting'].includes(t.type) && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <User size={11} />{t.authorLabel}
                                </span>
                              )}
                              {t.subtitle && <span>{t.subtitle}</span>}
                            </div>
                          )}
                          {t.body && (
                            <div
                              style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: crmV2.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                              dangerouslySetInnerHTML={{ __html: sanitize(t.body) }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </RecordCard>

        {/* ══ Droite : associations ══ */}
        <RecordSideStack>
          <CrmV2Section title="Contact" icon={<User size={14} />} count={contact ? 1 : 0} storageKey="crm-deal-section-contact" style={{ flexShrink: 0 }}>
            {!contact ? (
              <EmptyBlock text="Aucun contact associé." />
            ) : (
              <Link
                href={`/admin/crm/contacts/${contact.hubspot_contact_id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, border: `1px solid ${crmV2.border}`, textDecoration: 'none', color: crmV2.text }}
              >
                <CrmV2Avatar name={contactName || '?'} size={32} radius="36%" />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: crmV2.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {contactName || '—'}
                  </span>
                  {contact.email && <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email as string}</span>}
                  {contact.phone && <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted }}>{contact.phone as string}</span>}
                </span>
                <ExternalLink size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
              </Link>
            )}
          </CrmV2Section>

          <CrmV2Section title="Rendez-vous" icon={<Calendar size={14} />} count={appointment ? 1 : 0} storageKey="crm-deal-section-rdv" style={{ flexShrink: 0 }}>
            {!appointment ? (
              <EmptyBlock text="Aucun RDV associé." />
            ) : (
              <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700 }}>
                    {appointment.start_at ? format(new Date(appointment.start_at as string), 'PPp', { locale: fr }) : '—'}
                  </span>
                  {appointment.status && <CrmV2Pill>{appointment.status as string}</CrmV2Pill>}
                </div>
                {appointment.notes !== undefined && appointment.notes !== null && appointment.notes !== '' && (
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: crmV2.textMuted, fontSize: 12, lineHeight: 1.5 }}>{appointment.notes as string}</div>
                )}
              </div>
            )}
          </CrmV2Section>

          <CrmV2Section
            title="Tâches"
            icon={<CheckSquare size={14} />}
            count={tasks.length}
            storageKey="crm-deal-section-tasks"
            style={{ flexShrink: 0 }}
            actions={<RoundIconButton icon={<Plus size={14} />} title="Nouvelle tâche" onClick={() => setQuickAction('task')} />}
          >
            {tasks.length === 0 ? (
              <EmptyBlock text="Aucune tâche." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map(task => {
                  const done = task.status === 'completed' || !!task.completed_at
                  return (
                    <div key={String(task.id)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        border: `1.5px solid ${done ? crmV2.successStrong : crmV2.borderStrong}`,
                        background: done ? crmV2.successStrong : 'transparent',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {done && <Check size={10} color="#fff" strokeWidth={3} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? crmV2.textMuted : crmV2.text, overflowWrap: 'anywhere' }}>
                          {(task.title as string) || 'Tâche'}
                        </div>
                        {task.due_at && (
                          <div style={{ fontSize: 11, color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} />
                            {format(new Date(task.due_at as string), "d MMM 'à' HH:mm", { locale: fr })}
                            {task.owner_id ? ` · ${ownerLabel(String(task.owner_id))}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CrmV2Section>
        </RecordSideStack>
      </RecordBody>

      {/* Modale d'action rapide */}
      {quickAction && (
        <QuickActionModal
          type={quickAction}
          dealId={id}
          contactId={contact?.hubspot_contact_id as string | undefined}
          defaultOwnerId={deal.hubspot_owner_id as string | undefined}
          actorOwnerId={actorOwnerId}
          onClose={() => setQuickAction(null)}
          onSaved={() => load()}
        />
      )}

      {/* Toutes les propriétés */}
      <CrmV2Drawer
        open={showAllProps}
        onClose={() => setShowAllProps(false)}
        width={560}
        header={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Toutes les propriétés ({properties.length})</div>
              <CrmV2CloseButton onClick={() => setShowAllProps(false)} />
            </div>
            <CrmV2Search
              value={propSearch}
              onChange={e => setPropSearch(e.target.value)}
              placeholder="Rechercher une propriété…"
              style={{ minWidth: 0 }}
            />
          </div>
        }
      >
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!properties.length && (
            <p style={{ margin: 0, fontSize: 13, color: '#8a6d22', background: crmV2.goldSoft, padding: 12, borderRadius: 10 }}>
              Métadonnées des propriétés absentes — lancez une synchronisation complète.
            </p>
          )}
          {Object.entries(filteredGroups).map(([group, props]) => (
            <div key={group} style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '10px 12px', background: crmV2.thBg, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted,
                }}
              >
                <span>{formatGroup(group)} ({props.length})</span>
                <span style={{ display: 'inline-flex', transform: collapsed[group] ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>
                  <ChevronDown size={14} />
                </span>
              </button>
              {!collapsed[group] && (
                <div style={{ padding: '4px 4px 6px' }}>
                  {props.map(p => {
                    const val = allValues[p.name] ?? ''
                    const isEditing = editing === p.name
                    return (
                      <PropRow
                        key={p.name}
                        label={p.label || p.name}
                        onClick={isEditing ? undefined : () => { setEditing(p.name); setEditValue(String(val ?? '')) }}
                      >
                        {isEditing
                          ? renderEditor(p.name, p.field_type === 'select' && p.options ? p.options : null)
                          : (formatPropValue(val, p) || empty)}
                      </PropRow>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </CrmV2Drawer>
    </CrmV2Page>
  )
}

/** Icône ronde colorée d'une activité (couleurs du brief V2). */
function TypeIcon({ type }: { type: string }) {
  const map: Record<string, { icon: ReactNode; color: string }> = {
    note:    { icon: <StickyNote size={15} />,  color: crmV2ActivityColors.note },
    email:   { icon: <Mail size={15} />,        color: crmV2ActivityColors.email },
    call:    { icon: <Phone size={15} />,       color: crmV2ActivityColors.call },
    task:    { icon: <CheckSquare size={15} />, color: crmV2ActivityColors.task },
    meeting: { icon: <Calendar size={15} />,    color: crmV2ActivityColors.meeting },
  }
  const m = map[type] ?? map.note
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', background: hexA(m.color, 0.12), color: m.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {m.icon}
    </div>
  )
}

function labelForType(t: string) {
  const labels: Record<string, string> = { note: 'Note', call: 'Appel', email: 'E-mail', meeting: 'Réunion', task: 'Tâche' }
  return labels[t] ?? t
}

function formatGroup(g: string) {
  const map: Record<string, string> = {
    dealinformation: 'Informations transaction',
    contactinformation: 'Contact',
    conversioninformation: 'Conversion',
    other: 'Autres',
  }
  return map[g] || g.replace(/_/g, ' ')
}

function formatPropValue(v: Any, p?: CRMProperty) {
  if (v === null || v === undefined || v === '') return ''
  const str = String(v)
  if (!p) return str
  if (p.type === 'datetime' || p.type === 'date') {
    const ts = parseInt(str, 10)
    if (!isNaN(ts) && ts > 1e12) return format(new Date(ts), 'PPp', { locale: fr })
    const d = new Date(str)
    if (!isNaN(d.getTime())) return format(d, 'PPp', { locale: fr })
  }
  if (p.field_type === 'select' && p.options) {
    const o = p.options.find(o => o.value === str)
    if (o) return o.label
  }
  if (p.field_type === 'checkbox' || p.type === 'bool') {
    return str === 'true' || str === '1' ? 'Oui' : 'Non'
  }
  return str
}

function sanitize(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}
