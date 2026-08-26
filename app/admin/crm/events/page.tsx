'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
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
  RefreshCw,
  Save,
  Users,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import EventsAgendaCalendar, { EVENT_TYPE_COLORS } from '@/components/crm/EventsAgendaCalendar'
import { CrmV2Button, CrmV2Card, CrmV2Page, CrmV2PillTabs } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  BRAND_CONFIG,
  EVENT_TYPES,
  brandEventTypes,
  eventTypeOf,
  planningPublicUrl,
  type EventBrand,
  type EventTypeId,
} from '@/lib/events-studio/config'
import { staffPayForEvent } from '@/lib/events-studio/event-meta'

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
}

const BRANDS: EventBrand[] = ['diploma', 'medibox', 'edumove']
const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/
const EDITABLE_TYPES: EventTypeId[] = ['salon', 'jpo', 'webinaire']

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.border}`,
  fontSize: 14,
  background: crmV2.bg,
}

function currentTypeId(ev: EventRow): EventTypeId {
  const id = eventTypeOf(ev).id
  if (id === 'jpo' || id === 'salon' || id === 'webinaire') return id
  return 'salon'
}

function formatWhen(iso: string, end?: string | null) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
  const start = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
  return end ? `${date} · ${start}–${end}` : `${date} · ${start}`
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
  const [brand, setBrand] = useState<EventBrand>('diploma')
  const [allEvents, setAllEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [staffDraft, setStaffDraft] = useState('')
  const [typeDraft, setTypeDraft] = useState<EventTypeId>('salon')
  const [savingId, setSavingId] = useState<string | null>(null)
  const planningYear = new Date().getFullYear()
  const planningUrl = planningPublicUrl(planningYear)

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

  function renderEventCard(ev: EventRow, muted = false) {
    const typeId = currentTypeId(ev)
    const typeColor = EVENT_TYPE_COLORS[typeId] || EVENT_TYPE_COLORS.autre
    const st = statusStyle(ev.status)
    const open = expandedId === ev.id
    const pay = staffPayForEvent(ev)
    const showStaffDraft = EVENT_TYPES[typeDraft].staff
    const showStaff = EVENT_TYPES[typeId].staff

    return (
      <CrmV2Card
        key={ev.id}
        style={{
          padding: 0,
          overflow: 'hidden',
          borderLeft: `4px solid ${typeColor.solid}`,
          opacity: muted ? 0.75 : 1,
        }}
      >
        <button
          type="button"
          onClick={() => toggleExpand(ev)}
          style={{
            width: '100%',
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            padding: '18px 18px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 17, color: crmV2.text }}>{ev.name}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: crmV2.radiusPill,
                  background: typeColor.soft,
                  color: typeColor.text,
                }}
              >
                {typeColor.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: crmV2.radiusPill,
                  background: st.bg,
                  color: st.color,
                }}
              >
                {st.label}
              </span>
              {showStaff && ev.staff_needed != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: crmV2.radiusPill,
                    background: 'rgba(56,189,248,0.15)',
                    color: '#0369a1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Users size={11} />
                  {ev.staff_count || 0}/{ev.staff_needed} staff
                  {ev.staff_remaining != null ? ` · ${ev.staff_remaining} rest.` : ''}
                </span>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45 }}>
              {formatWhen(ev.event_date, ev.event_time_end)}
              {ev.location ? (
                <>
                  <br />
                  {ev.location}
                </>
              ) : null}
              {pay ? (
                <>
                  <br />
                  <span style={{ color: crmV2.textFaint }}>Rémunération staff : {pay.label}</span>
                </>
              ) : null}
            </div>
          </div>
          <span style={{ color: crmV2.textMuted, flexShrink: 0, marginTop: 2 }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </button>

        {open && (
          <div
            style={{
              padding: '0 18px 18px',
              borderTop: `1px solid ${crmV2.border}`,
              background: crmV2.bgSoft,
            }}
          >
            <div style={{ paddingTop: 14, display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: showStaffDraft ? '1fr 1fr auto' : '1fr auto',
                  gap: 10,
                  alignItems: 'end',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: crmV2.textMuted,
                      marginBottom: 6,
                    }}
                  >
                    Type d&apos;événement
                  </label>
                  <select
                    value={typeDraft}
                    onChange={(e) => setTypeDraft(e.target.value as EventTypeId)}
                    style={inputStyle}
                  >
                    {(EDITABLE_TYPES).map(
                      (t) => (
                        <option key={t} value={t}>
                          {EVENT_TYPES[t].label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                {showStaffDraft && (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: crmV2.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      Staff nécessaires
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={staffDraft}
                      onChange={(e) => setStaffDraft(e.target.value)}
                      placeholder="Ex: 4"
                      style={inputStyle}
                    />
                  </div>
                )}
                <CrmV2Button
                  variant="gold"
                  disabled={savingId === ev.id}
                  onClick={() => saveEventSettings(ev)}
                >
                  <Save size={14} /> {savingId === ev.id ? '…' : 'Enregistrer'}
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
                {showStaff && (
                  <a
                    href={`/events-studio/?staff=${ev.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <CrmV2Button variant="secondary">
                      <ExternalLink size={14} /> Lien staff
                    </CrmV2Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </CrmV2Card>
    )
  }

  function copyPlanningLink() {
    navigator.clipboard.writeText(planningUrl).then(() => {
      setToast('Lien planning copié')
      setTimeout(() => setToast(null), 2000)
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft }}>
      <MarketingNav title="Événements" />
      <CrmV2Page style={{ paddingBottom: 48 }}>
        <div style={{ padding: '20px 28px 0', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalendarDays size={20} color={crmV2.gold} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: crmV2.text }}>Événements</h1>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: crmV2.textMuted }}>
              Créez un événement et son formulaire CRM type (Nom, Prénom, Téléphone, Email, Classe, Département).
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: crmV2.textFaint }}>
              Lien public salons (choix du lieu + places) :{' '}
              <a href="/inscription-salons" target="_blank" rel="noreferrer" style={{ color: crmV2.link }}>
                /inscription-salons
              </a>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Actualiser
            </CrmV2Button>
            <Link href={`/admin/crm/events/import?brand=${brand}`} style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="secondary">
                <FileUp size={14} /> Importer CSV
              </CrmV2Button>
            </Link>
            <Link href={`/admin/crm/events/new?brand=${brand}`} style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="gold">
                <Plus size={14} /> Nouvel événement
              </CrmV2Button>
            </Link>
          </div>
        </div>

        <div style={{ padding: '16px 28px' }}>
          <CrmV2PillTabs
            items={BRANDS.map((b) => ({ id: b, label: BRAND_CONFIG[b].name }))}
            value={brand}
            onChange={(id) => setBrand(id as EventBrand)}
          />
          <div style={{ marginTop: 10, fontSize: 12, color: crmV2.textFaint }}>
            Types : {types.map((t) => EVENT_TYPES[t].short).join(' · ')}
          </div>
        </div>

        {toast && (
          <div style={{ padding: '0 28px 12px' }}>
            <div
              style={{
                padding: '8px 12px',
                borderRadius: crmV2.radius,
                background: crmV2.goldSoft,
                fontSize: 13,
                color: crmV2.text,
              }}
            >
              {toast}
            </div>
          </div>
        )}

        <div style={{ padding: '0 28px 16px' }}>
          <EventsAgendaCalendar events={allEvents} loading={loading} />
        </div>

        {brand === 'diploma' && (
          <div style={{ padding: '0 28px 16px' }}>
            <CrmV2Card style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <CalendarRange size={16} color={crmV2.gold} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Planning staff {planningYear}</span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: crmV2.textMuted }}>
                    Lien public pour que les équipes s’inscrivent aux JPO et salons Diploma de l’année.
                  </p>
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      color: crmV2.link,
                      wordBreak: 'break-all',
                      padding: '8px 10px',
                      background: crmV2.bgSoft,
                      borderRadius: crmV2.radius,
                      border: `1px solid ${crmV2.border}`,
                    }}
                  >
                    {planningUrl}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <CrmV2Button variant="gold" onClick={copyPlanningLink}>
                    <Copy size={14} /> Copier le lien
                  </CrmV2Button>
                  <a href={planningUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <CrmV2Button variant="secondary">
                      <ExternalLink size={14} /> Ouvrir
                    </CrmV2Button>
                  </a>
                  <Link href="/admin/crm/events/planning" style={{ textDecoration: 'none' }}>
                    <CrmV2Button variant="primary">Voir le planning</CrmV2Button>
                  </Link>
                </div>
              </div>
            </CrmV2Card>
          </div>
        )}

        <div style={{ padding: '0 28px' }}>
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: crmV2.radius, background: crmV2.dangerSoft, color: crmV2.danger, fontSize: 13 }}>
              {error}
            </div>
          )}
          {loading ? (
            <div style={{ color: crmV2.textMuted, fontSize: 13, padding: 24 }}>Chargement…</div>
          ) : upcoming.length === 0 && past.length === 0 ? (
            <CrmV2Card style={{ padding: 28, textAlign: 'center' }}>
              <p style={{ margin: 0, color: crmV2.textMuted, fontSize: 14 }}>Aucun événement pour {BRAND_CONFIG[brand].name}.</p>
              <div style={{ marginTop: 14 }}>
                <Link href={`/admin/crm/events/new?brand=${brand}`} style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="gold">
                    <Plus size={14} /> Créer le premier
                  </CrmV2Button>
                </Link>
              </div>
            </CrmV2Card>
          ) : (
            <div style={{ display: 'grid', gap: 24 }}>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: crmV2.textMuted,
                    marginBottom: 10,
                  }}
                >
                  À venir ({upcoming.length})
                </div>
                {upcoming.length === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textFaint, padding: '8px 0' }}>
                    Aucun événement à venir.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>{upcoming.map((ev) => renderEventCard(ev))}</div>
                )}
              </div>

              {past.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: crmV2.textMuted,
                      marginBottom: 10,
                      paddingTop: 8,
                      borderTop: `1px solid ${crmV2.border}`,
                    }}
                  >
                    Événements terminés ({past.length})
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {past.map((ev) => renderEventCard(ev, true))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CrmV2Page>
    </div>
  )
}
