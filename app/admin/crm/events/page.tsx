'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileUp,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Users,
} from 'lucide-react'
import EventsAgendaCalendar, { EVENT_TYPE_COLORS } from '@/components/crm/EventsAgendaCalendar'
import {
  CrmV2Body,
  CrmV2Button,
  CrmV2Card,
  CrmV2Empty,
  CrmV2Field,
  CrmV2Header,
  CrmV2Input,
  CrmV2Page,
  CrmV2Pill,
  CrmV2PillTabs,
  CrmV2Select,
  CrmV2Spinner,
  CrmV2StatusPill,
  CrmV2Table,
  CrmV2TableCard,
  CrmV2Tabs,
  CrmV2Td,
  CrmV2Th,
  CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  EvBanner,
  EvFillBar,
  EvIconBox,
  EvIconButton,
  EvUrlBox,
} from '@/components/crm-v2/marketing2/events-list/EventsListParts'
import { crmV2 } from '@/lib/crm-v2-theme'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  BRAND_CONFIG,
  EVENT_TYPES,
  brandEventTypes,
  eventOffersStandForm,
  eventTypeOf,
  planningPublicUrl,
  staffPlanningSetPublicUrl,
  STAFF_PLANNING_SETS,
  type EventBrand,
  type EventTypeId,
} from '@/lib/events-studio/config'
import { eventDayCount, formatEventSchedule, multiDayLabel, staffPayForEvent } from '@/lib/events-studio/event-meta'

type EventRow = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  event_time_end: string | null
  location: string | null
  status: string
  zoom_join_url: string | null
  description?: string | null
  max_capacity?: number | null
  staff_needed?: number | null
  staff_count?: number
  staff_remaining?: number | null
  registered_count?: number
  public_form_url?: string | null
  form_slug?: string | null
}

const BRANDS: EventBrand[] = ['diploma', 'medibox', 'edumove']
const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/
const EDITABLE_TYPES: EventTypeId[] = ['salon', 'jpo', 'webinaire']

function currentTypeId(ev: EventRow): EventTypeId {
  const id = eventTypeOf(ev).id
  if (id === 'jpo' || id === 'salon' || id === 'webinaire') return id
  return 'salon'
}

function statusStyle(status: string): { bg: string; color: string; label: string } {
  if (status === 'published') return { bg: 'rgba(0,189,165,0.12)', color: crmV2.success, label: 'Publié' }
  if (status === 'cancelled') return { bg: crmV2.dangerSoft, color: crmV2.danger, label: 'Annulé' }
  return { bg: crmV2.bgMuted, color: crmV2.textMuted, label: 'Brouillon' }
}

/** Fin effective de l’événement (multi-jours via [date_end=…] ou jour de event_date). */
function eventEndsAtMs(ev: EventRow): number {
  const m = (ev.description || '').match(DATE_END_RE)
  if (m) {
    const endTime = ev.event_time_end && /^\d{1,2}:\d{2}$/.test(ev.event_time_end) ? ev.event_time_end : '23:59'
    return new Date(`${m[1]}T${endTime}:00`).getTime()
  }
  const start = new Date(ev.event_date)
  if (ev.event_time_end && /^\d{1,2}:\d{2}$/.test(ev.event_time_end)) {
    const day = start.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    return new Date(`${day}T${ev.event_time_end}:00`).getTime()
  }
  // Fin de journée Paris si pas d’heure de fin
  const day = start.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  return new Date(`${day}T23:59:59`).getTime()
}

function isEventPast(ev: EventRow, nowMs = Date.now()): boolean {
  return eventEndsAtMs(ev) < nowMs
}

export default function EventsListPage() {
  const isMobile = useIsMobile()
  const [brand, setBrand] = useState<EventBrand>('diploma')
  const [allEvents, setAllEvents] = useState<EventRow[]>([])
  usePageTitle(`Événements ${BRAND_CONFIG[brand].name}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [staffDraft, setStaffDraft] = useState('')
  const [typeDraft, setTypeDraft] = useState<EventTypeId>('salon')
  const [savingId, setSavingId] = useState<string | null>(null)
  // Onglet affiché : événements à venir ou terminés
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const planningYear = new Date().getFullYear()
  const planningUrl = planningPublicUrl(planningYear)
  const firstPresentielsSet = STAFF_PLANNING_SETS['premiers-presentiels']
  const firstPresentielsUrl = staffPlanningSetPublicUrl('premiers-presentiels')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/events-studio/events', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur chargement')
      setAllEvents(data.events || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setAllEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const brandEvents = allEvents.filter((e) => (e.brand || 'diploma') === brand)
    const upcomingList = brandEvents
      .filter((e) => !isEventPast(e, now))
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    const pastList = brandEvents
      .filter((e) => isEventPast(e, now))
      .sort((a, b) => eventEndsAtMs(b) - eventEndsAtMs(a))
    return { upcoming: upcomingList, past: pastList }
  }, [allEvents, brand])

  const types = useMemo(() => brandEventTypes(brand), [brand])

  async function saveEventSettings(ev: EventRow) {
    setSavingId(ev.id)
    try {
      const draftType = EVENT_TYPES[typeDraft]
      const body: Record<string, unknown> = { event_type: typeDraft }
      if (draftType.staff) {
        body.staff_needed = staffDraft.trim() === '' ? null : parseInt(staffDraft, 10)
      }
      const res = await fetch(`/api/events-studio/events/${ev.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setToast('Événement mis à jour')
      setTimeout(() => setToast(null), 2000)
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  function toggleExpand(ev: EventRow) {
    if (expandedId === ev.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(ev.id)
    setStaffDraft(ev.staff_needed != null ? String(ev.staff_needed) : '')
    setTypeDraft(currentTypeId(ev))
  }

  /** Panneau déplié d'un événement : lien public, type / staff modifiables, raccourcis. */
  function renderEventPanel(ev: EventRow) {
    const typeId = currentTypeId(ev)
    const st = statusStyle(ev.status)
    const pay = staffPayForEvent(ev)
    const showStaffDraft = EVENT_TYPES[typeDraft].staff
    const showStaff = EVENT_TYPES[typeId].staff
    const multiLabel = multiDayLabel(eventDayCount(ev))

    return (
      <div
        style={{
          padding: isMobile ? 12 : '14px 16px 16px',
          background: crmV2.bgSoft,
          borderTop: `1px solid ${crmV2.borderLight}`,
          display: 'grid',
          gap: 12,
        }}
      >
        {isMobile && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <CrmV2StatusPill label={st.label} color={st.color} bg={st.bg} />
            {multiLabel && <CrmV2StatusPill label={multiLabel} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} />}
            {showStaff && ev.staff_needed != null && (
              <CrmV2Pill>
                <Users size={12} />
                {ev.staff_count || 0}/{ev.staff_needed} staff
                {ev.staff_remaining != null ? ` · ${ev.staff_remaining} rest.` : ''}
              </CrmV2Pill>
            )}
          </div>
        )}
        {isMobile && (
          <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45 }}>
            {formatEventSchedule(ev)}
            {ev.location ? <><br />{ev.location}</> : null}
          </div>
        )}
        {pay && (
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Rémunération staff : {pay.label}</div>
        )}

        {ev.public_form_url && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <EvUrlBox url={ev.public_form_url} />
            <CrmV2Button variant="secondary" icon={<Copy size={14} />} onClick={() => copyEventUrl(ev.public_form_url!)}>
              Copier
            </CrmV2Button>
            <CrmV2Button
              variant="secondary"
              icon={<ExternalLink size={14} />}
              onClick={() => window.open(ev.public_form_url!, '_blank', 'noopener,noreferrer')}
            >
              Ouvrir
            </CrmV2Button>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? '1fr'
              : showStaffDraft
                ? 'minmax(0, 1fr) minmax(0, 1fr) auto'
                : 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'end',
            maxWidth: 720,
          }}
        >
          <CrmV2Field label="Type d'événement">
            <CrmV2Select value={typeDraft} onChange={(e) => setTypeDraft(e.target.value as EventTypeId)}>
              {EDITABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPES[t].label}
                </option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
          {showStaffDraft && (
            <CrmV2Field label="Staff nécessaires">
              <CrmV2Input
                type="number"
                min={0}
                value={staffDraft}
                onChange={(e) => setStaffDraft(e.target.value)}
                placeholder="Ex: 4"
              />
            </CrmV2Field>
          )}
          <CrmV2Button
            variant="primary"
            icon={<Save size={14} />}
            disabled={savingId === ev.id}
            onClick={() => saveEventSettings(ev)}
            style={{ height: isMobile ? 40 : 38 }}
          >
            {savingId === ev.id ? '…' : 'Enregistrer'}
          </CrmV2Button>
        </div>
        {showStaffDraft && (
          <div style={{ fontSize: 12, color: crmV2.textFaint }}>
            Planning staff : places restantes
            {pay ? ` · tarif ${pay.label}` : ''}.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/admin/crm/events/${ev.id}`} style={{ textDecoration: 'none' }}>
            <CrmV2Button variant="primary">Ouvrir la fiche</CrmV2Button>
          </Link>
          {ev.public_form_url && (
            <CrmV2Button
              variant="secondary"
              icon={eventOffersStandForm(ev) ? <QrCode size={14} /> : <ExternalLink size={14} />}
              onClick={() => window.open(ev.public_form_url!, '_blank', 'noopener,noreferrer')}
            >
              {eventOffersStandForm(ev) ? 'Formulaire stand' : 'Page événement'}
            </CrmV2Button>
          )}
          {showStaff && (
            <a
              href={`/events-studio/?staff=${ev.id}`}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />}>
                Lien staff
              </CrmV2Button>
            </a>
          )}
        </div>
      </div>
    )
  }

  /** Ligne du tableau (ordinateur) ; un clic déplie le panneau de l'événement. */
  function renderEventRow(ev: EventRow) {
    const typeId = currentTypeId(ev)
    const typeColor = EVENT_TYPE_COLORS[typeId] || EVENT_TYPE_COLORS.autre
    const st = statusStyle(ev.status)
    const open = expandedId === ev.id
    const pay = staffPayForEvent(ev)
    const showStaff = EVENT_TYPES[typeId].staff
    const multiLabel = multiDayLabel(eventDayCount(ev))
    const registered = ev.registered_count ?? 0
    const stop = (e: MouseEvent) => e.stopPropagation()

    return (
      <Fragment key={ev.id}>
        <CrmV2Tr onClick={() => toggleExpand(ev)} style={open ? { background: crmV2.rowHover } : undefined}>
          <CrmV2Td style={open ? { borderBottomColor: crmV2.borderLight } : undefined}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <EvIconBox color={typeColor.solid}>
                <CalendarDays size={14} />
              </EvIconBox>
              <Link
                href={`/admin/crm/events/${ev.id}`}
                onClick={stop}
                title={ev.name}
                style={{
                  color: crmV2.link,
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 320,
                }}
              >
                {ev.name}
              </Link>
              {multiLabel && (
                <CrmV2StatusPill label={multiLabel} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} />
              )}
            </span>
          </CrmV2Td>
          <CrmV2Td>
            <CrmV2Pill>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeColor.solid }} />
              {typeColor.label}
            </CrmV2Pill>
          </CrmV2Td>
          <CrmV2Td style={{ whiteSpace: 'nowrap' }}>{formatEventSchedule(ev)}</CrmV2Td>
          <CrmV2Td style={{ color: crmV2.textMuted }}>
            <span
              title={ev.location || undefined}
              style={{ display: 'block', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {ev.location || '—'}
            </span>
          </CrmV2Td>
          <CrmV2Td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {registered.toLocaleString('fr-FR')}
          </CrmV2Td>
          <CrmV2Td>
            <EvFillBar registered={registered} capacity={ev.max_capacity} />
          </CrmV2Td>
          <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
            {showStaff && ev.staff_needed != null ? (
              <span title={pay ? `Rémunération staff : ${pay.label}` : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Users size={13} color={crmV2.textFaint} />
                <span style={{ fontWeight: 600 }}>
                  {ev.staff_count || 0}/{ev.staff_needed}
                </span>
                {ev.staff_remaining != null && (
                  <span style={{ fontSize: 12, color: crmV2.textMuted }}>· {ev.staff_remaining} rest.</span>
                )}
              </span>
            ) : (
              <span style={{ color: crmV2.textFaint }}>—</span>
            )}
          </CrmV2Td>
          <CrmV2Td>
            <CrmV2StatusPill label={st.label} color={st.color} bg={st.bg} />
          </CrmV2Td>
          <CrmV2Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {ev.public_form_url && (
                <>
                  <EvIconButton
                    title="Copier l'URL"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyEventUrl(ev.public_form_url!)
                    }}
                  >
                    <Copy size={14} />
                  </EvIconButton>
                  <EvIconButton
                    title="Ouvrir la page"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(ev.public_form_url!, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <ExternalLink size={14} />
                  </EvIconButton>
                </>
              )}
              <EvIconButton
                title={open ? 'Replier' : 'Déplier'}
                active={open}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpand(ev)
                }}
              >
                {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </EvIconButton>
            </span>
          </CrmV2Td>
        </CrmV2Tr>
        {open && (
          <tr>
            <td colSpan={9} style={{ padding: 0, borderBottom: `1px solid ${crmV2.border}` }}>
              {renderEventPanel(ev)}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  /** Ligne compacte (mobile) : une ligne par événement, un appui déplie le panneau. */
  function renderEventMobile(ev: EventRow) {
    const typeId = currentTypeId(ev)
    const typeColor = EVENT_TYPE_COLORS[typeId] || EVENT_TYPE_COLORS.autre
    const st = statusStyle(ev.status)
    const open = expandedId === ev.id
    const registered = ev.registered_count ?? 0

    return (
      <div key={ev.id} style={{ borderBottom: `1px solid ${crmV2.border}` }}>
        <button
          type="button"
          onClick={() => toggleExpand(ev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            minHeight: 60,
            background: open ? crmV2.rowHover : 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: crmV2.text,
          }}
        >
          <EvIconBox size={36} color={typeColor.solid}>
            <CalendarDays size={16} />
          </EvIconBox>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.name}
              </span>
              <span title={st.label} style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: crmV2.textMuted,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {typeColor.label} · {formatEventSchedule(ev)}
            </span>
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              color: crmV2.text,
              background: crmV2.chipBg,
              border: `1px solid ${crmV2.chipBorder}`,
              borderRadius: 999,
              padding: '2px 8px',
              flexShrink: 0,
            }}
          >
            <Users size={12} color={crmV2.textMuted} />
            {registered}
          </span>
          <span style={{ color: crmV2.textFaint, flexShrink: 0, display: 'inline-flex' }}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        {open && renderEventPanel(ev)}
      </div>
    )
  }

  function copyEventUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setToast('URL de l’événement copiée')
      setTimeout(() => setToast(null), 2000)
    })
  }

  function copyPlanningLink() {
    navigator.clipboard.writeText(planningUrl).then(() => {
      setToast('Lien planning copié')
      setTimeout(() => setToast(null), 2000)
    })
  }

  function copyFirstPresentielsLink() {
    navigator.clipboard.writeText(firstPresentielsUrl).then(() => {
      setToast('Lien 19 & 26 septembre copié')
      setTimeout(() => setToast(null), 2000)
    })
  }

  const brandName = BRAND_CONFIG[brand].name
  const list = tab === 'upcoming' ? upcoming : past

  /** Carte « lien public de planning staff » (Diploma). */
  function planningCard(opts: {
    icon: ReactNode
    title: string
    description: string
    url: string
    onCopy: () => void
    extra?: ReactNode
  }) {
    return (
      <CrmV2Card style={{ padding: isMobile ? 14 : 18, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <EvIconBox color={crmV2.gold} size={36}>
            {opts.icon}
          </EvIconBox>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: crmV2.text }}>{opts.title}</div>
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, lineHeight: 1.45 }}>{opts.description}</div>
          </div>
        </div>
        <EvUrlBox url={opts.url} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CrmV2Button variant="secondary" icon={<Copy size={14} />} onClick={opts.onCopy}>
            Copier le lien
          </CrmV2Button>
          <a href={opts.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />}>
              Ouvrir
            </CrmV2Button>
          </a>
          {opts.extra}
        </div>
      </CrmV2Card>
    )
  }

  return (
    <CrmV2Page style={{ paddingBottom: 32 }}>
      <CrmV2Header
        title="Événements"
        subtitle={`Salons, journées portes ouvertes et webinaires · ${brandName}`}
        actions={
          <>
            {isMobile ? (
              <EvIconButton title="Actualiser" onClick={() => load()}>
                <RefreshCw size={15} />
              </EvIconButton>
            ) : (
              <CrmV2Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>
                Actualiser
              </CrmV2Button>
            )}
            <Link href={`/admin/crm/events/import?brand=${brand}`} style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="secondary" icon={<FileUp size={14} />}>
                Importer
              </CrmV2Button>
            </Link>
            <Link href="/admin/crm/events/planning" style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="secondary" icon={<CalendarRange size={14} />}>
                Planning
              </CrmV2Button>
            </Link>
            <Link href={`/admin/crm/events/new?brand=${brand}`} style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="primary" icon={<Plus size={14} />}>
                Créer un événement
              </CrmV2Button>
            </Link>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={(id) => setTab(id as 'upcoming' | 'past')}
          items={[
            { id: 'upcoming', label: 'À venir', count: loading ? undefined : upcoming.length },
            { id: 'past', label: 'Passés', count: loading ? undefined : past.length },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {toast && <EvBanner>{toast}</EvBanner>}
        {error && <EvBanner tone="danger">{error}</EvBanner>}

        <CrmV2TableCard
          toolbar={
            <>
              <CrmV2PillTabs
                items={BRANDS.map((b) => ({ id: b, label: BRAND_CONFIG[b].name }))}
                value={brand}
                onChange={(id) => setBrand(id as EventBrand)}
              />
              <span style={{ fontSize: 12, color: crmV2.textFaint }}>
                Types : {types.map((t) => EVENT_TYPES[t].short).join(' · ')}
              </span>
            </>
          }
          footer={
            <span style={{ fontSize: 12, color: crmV2.textFaint, lineHeight: 1.45 }}>
              Chaque événement a son formulaire CRM type (Nom, Prénom, Téléphone, Email, Classe, Département). Les
              salons externes n’ont pas de page d’inscription publique : leur formulaire sert à la collecte sur le
              stand (tablette + QR code).
            </span>
          }
        >
          {loading ? (
            <CrmV2Spinner />
          ) : upcoming.length === 0 && past.length === 0 ? (
            <CrmV2Empty
              icon={<CalendarDays size={26} />}
              title={`Aucun événement pour ${brandName}.`}
              action={
                <Link href={`/admin/crm/events/new?brand=${brand}`} style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="primary" icon={<Plus size={14} />}>
                    Créer le premier
                  </CrmV2Button>
                </Link>
              }
            />
          ) : list.length === 0 ? (
            <div style={{ padding: '32px 16px', fontSize: 13, color: crmV2.textFaint, textAlign: 'center' }}>
              {tab === 'upcoming' ? 'Aucun événement à venir.' : 'Aucun événement terminé.'}
            </div>
          ) : isMobile ? (
            <div>{list.map((ev) => renderEventMobile(ev))}</div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Événement</CrmV2Th>
                  <CrmV2Th>Type</CrmV2Th>
                  <CrmV2Th>Date</CrmV2Th>
                  <CrmV2Th>Lieu</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Inscrits</CrmV2Th>
                  <CrmV2Th>Remplissage</CrmV2Th>
                  <CrmV2Th>Staff</CrmV2Th>
                  <CrmV2Th>Statut</CrmV2Th>
                  <CrmV2Th style={{ width: 120 }}>{''}</CrmV2Th>
                </tr>
              </thead>
              <tbody>{list.map((ev) => renderEventRow(ev))}</tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>

        <EventsAgendaCalendar events={allEvents} loading={loading} />

        {brand === 'diploma' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: isMobile ? 12 : 16,
            }}
          >
            {planningCard({
              icon: <CalendarRange size={16} />,
              title: `Planning staff ${planningYear}`,
              description: 'Lien public pour que les équipes s’inscrivent aux JPO et salons Diploma de l’année.',
              url: planningUrl,
              onCopy: copyPlanningLink,
              extra: (
                <Link href="/admin/crm/events/planning" style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="primary">Voir le planning</CrmV2Button>
                </Link>
              ),
            })}
            {firstPresentielsSet &&
              planningCard({
                icon: <Users size={16} />,
                title: 'Staff — 19 & 26 septembre',
                description:
                  'Lien public limité aux 2 premiers présentiels : Salon des études de médecine (120 € / jour) et Salon Accès aux Études MMOPK.',
                url: firstPresentielsUrl,
                onCopy: copyFirstPresentielsLink,
              })}
          </div>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}
