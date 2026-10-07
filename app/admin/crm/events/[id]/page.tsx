'use client'

import { use, useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  QrCode,
  Rocket,
  Save,
  Settings2,
  Trash2,
  Users,
  Video,
} from 'lucide-react'
import EventTimeslotSurveyCard from '@/components/crm/EventTimeslotSurveyCard'
import {
  CrmV2Button,
  CrmV2Empty,
  CrmV2Page,
  CrmV2Pill,
  CrmV2Section,
  CrmV2Segmented,
  CrmV2Spinner,
  CrmV2StatusPill,
  CrmV2Table,
  CrmV2Tabs,
  CrmV2Td,
  CrmV2Th,
  CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  EvCard,
  EvChoicePills,
  EvLabel,
  EvNotice,
  EvSourcePill,
  EvStat,
  EvSubBlock,
  EvTabPanel,
  EventAvatar,
  evFieldStyle,
} from '@/components/crm-v2/marketing2/event-detail/EventDetailUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { defaultEmailBody, defaultEmailSubject, defaultSmsBody, mergeCommsWithDefaults } from '@/lib/events-studio/comms-defaults'
import {
  attachCommsSchedule,
  extractCommsSchedule,
  formatScheduleAbsolute,
  formatScheduleLabel,
  resolveSchedule,
  type CommsScheduleEntry,
  type CommsScheduleMap,
} from '@/lib/events-studio/comms-schedule'
import { emailStepsFor, smsStepsFor } from '@/lib/events-studio/comms-steps'
import { BRAND_CONFIG, EVENT_TYPES, eventTypeOf, type EventBrand, type EventTypeId } from '@/lib/events-studio/config'
import { brandSender, buildEmailHtmlPreview } from '@/lib/events-studio/email-html-preview'
import { formatEventSchedule, parisDateFromIso, parisTimeFromIso } from '@/lib/events-studio/event-meta'
import { isSalonEtudesMedecineTimeslotEvent } from '@/lib/event-timeslot-survey'
import { useIsMobile } from '@/lib/useIsMobile'

const EDITABLE_TYPES: EventTypeId[] = ['salon', 'jpo', 'webinaire']

type StaffRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  role?: string | null
  note?: string | null
  source?: string | null
  created_at?: string | null
}

const STAFF_DISPO_ALL = '__all__'
const STAFF_DISPO_NONE = '__none__'

// Note staff générée par la page publique : « Dispo : sam. 10 oct. » ou « Dispo : les deux jours (…) »
function staffDispoKey(note: string | null | undefined): string {
  if (!note?.startsWith('Dispo')) return STAFF_DISPO_NONE
  const label = note.replace(/^Dispo\s*:\s*/, '').trim()
  if (/^(les deux jours|tous les jours)/i.test(label)) return STAFF_DISPO_ALL
  return label || STAFF_DISPO_NONE
}

function formatParisDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function csvCell(value: string | null | undefined): string {
  return `"${String(value || '').replace(/"/g, '""')}"`
}

function downloadStaffCsv(eventName: string, staff: StaffRow[]) {
  const header = 'Prenom,Nom,Email,Telephone,Role,Note,Date inscription'
  const rows = staff.map((s) =>
    [
      csvCell(s.first_name),
      csvCell(s.last_name),
      csvCell(s.email),
      csvCell(s.phone),
      csvCell(s.role),
      csvCell(s.note),
      csvCell(formatParisDateTime(s.created_at)),
    ].join(','),
  )
  const blob = new Blob([`\ufeff${[header, ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `staff_${eventName.replace(/[^a-zA-Z0-9À-ÿ]/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ScheduleRowControls({
  entry,
  stepId,
  onChange,
  inputStyle,
}: {
  entry: CommsScheduleEntry
  stepId: string
  onChange: (stepId: string, entry: CommsScheduleEntry) => void
  inputStyle: CSSProperties
}) {
  const fieldStyle: CSSProperties = {
    ...inputStyle,
    marginTop: 0,
    padding: '7px 10px',
    fontSize: 13,
    fontWeight: 600,
    background: crmV2.bg,
    border: `1px solid ${crmV2.borderStrong}`,
  }

  if (entry.mode === 'immediate') {
    return <span style={{ fontSize: 12, color: crmV2.textMuted }}>À l’inscription / publication</span>
  }

  if (entry.mode === 'days_before') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: crmV2.textMuted }}>J−</span>
        <input
          type="number"
          min={0}
          max={30}
          aria-label="Jours avant"
          style={{ ...fieldStyle, width: 64 }}
          value={entry.days}
          onChange={(e) => {
            const days = Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0))
            onChange(stepId, { mode: 'days_before', days, time: entry.time })
          }}
        />
        <span style={{ fontSize: 12, color: crmV2.textMuted }}>à</span>
        <input
          type="time"
          aria-label="Heure Paris"
          style={{ ...fieldStyle, width: 118 }}
          value={entry.time}
          onChange={(e) =>
            onChange(stepId, { mode: 'days_before', days: entry.days, time: e.target.value || '08:00' })
          }
        />
      </div>
    )
  }

  if (entry.mode === 'day_of') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: crmV2.textMuted }}>Jour J à</span>
        <input
          type="time"
          aria-label="Heure Paris"
          style={{ ...fieldStyle, width: 118 }}
          value={entry.time}
          onChange={(e) => onChange(stepId, { mode: 'day_of', time: e.target.value || '08:00' })}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        type="number"
        min={1}
        max={180}
        aria-label="Minutes avant"
        style={{ ...fieldStyle, width: 72 }}
        value={entry.minutes}
        onChange={(e) => {
          const minutes = Math.max(1, Math.min(180, parseInt(e.target.value, 10) || 1))
          onChange(stepId, { mode: 'minutes_before', minutes })
        }}
      />
      <span style={{ fontSize: 12, color: crmV2.textMuted }}>min avant le début</span>
    </div>
  )
}

function CommsScheduleTable({
  steps,
  eventDate,
  schedule,
  onChange,
  inputStyle,
}: {
  steps: Array<{ id: string; label: string }>
  eventDate: string
  schedule: CommsScheduleMap
  onChange: (stepId: string, entry: CommsScheduleEntry) => void
  inputStyle: CSSProperties
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        borderRadius: 12,
        border: `1px solid ${crmV2.border}`,
        background: crmV2.bg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: crmV2.thBg,
          borderBottom: `2px solid ${crmV2.thBorder}`,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: crmV2.textMuted,
        }}
      >
        <CalendarDays size={14} color={crmV2.gold} />
        Horaires d’envoi — modifiez ici, puis enregistrez
      </div>
      <div style={{ background: crmV2.bg }}>
        {steps.map((s, idx) => {
          const entry = resolveSchedule(schedule, s.id)
          const absolute = formatScheduleAbsolute(eventDate, entry)
          return (
            <div
              key={s.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(110px, 0.9fr) minmax(180px, 1.2fr) minmax(0, 1.4fr)',
                gap: 12,
                alignItems: 'center',
                padding: '8px 14px',
                minHeight: 40,
                borderTop: idx === 0 ? 'none' : `1px solid ${crmV2.borderLight}`,
              }}
              className="event-schedule-row"
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{s.label}</div>
              <ScheduleRowControls
                entry={entry}
                stepId={s.id}
                onChange={onChange}
                inputStyle={inputStyle}
              />
              <div style={{ fontSize: 11, color: crmV2.textMuted, lineHeight: 1.35 }}>
                {absolute || formatScheduleLabel(entry)}
              </div>
            </div>
          )
        })}
      </div>
      <style>{`
        @media (max-width: 720px) {
          .event-schedule-row {
            grid-template-columns: 1fr !important;
            gap: 6px !important;
          }
        }
      `}</style>
    </div>
  )
}

/** Champ non contrôlé : React ne réécrit pas la valeur à chaque frappe (sinon les espaces disparaissent). */
function CommsTextField({
  fieldKey,
  value,
  onChange,
  style,
  placeholder,
  multiline,
}: {
  fieldKey: string
  value: string
  onChange: (value: string) => void
  style: CSSProperties
  placeholder?: string
  multiline?: boolean
}) {
  const stopKeys = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.stopPropagation()
  }
  if (multiline) {
    return (
      <textarea
        id={fieldKey}
        name={fieldKey}
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopKeys}
        placeholder={placeholder}
        style={{ ...style, whiteSpace: 'pre-wrap' }}
      />
    )
  }
  return (
    <input
      id={fieldKey}
      name={fieldKey}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={stopKeys}
      placeholder={placeholder}
      style={style}
    />
  )
}

function currentTypeId(ev: { event_type?: string | null; brand?: string | null; zoom_join_url?: string | null }): EventTypeId {
  const id = eventTypeOf(ev).id
  if (id === 'jpo' || id === 'salon' || id === 'webinaire') return id
  return 'salon'
}

const PERF_COLORS = ['#C9A84C', '#2d3e50', '#0DBDA5', '#3B82F6', '#A855F7', '#F59E0B', '#EF4444', '#14B8A6', '#EC4899', '#64748B']

function PerfBarList({
  items,
  emptyLabel,
}: {
  items: Array<{ label: string; count: number; pct: number }>
  emptyLabel: string
}) {
  if (!items.length) {
    return <div style={{ fontSize: 13, color: crmV2.textMuted }}>{emptyLabel}</div>
  }
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 12).map((b, idx) => (
        <div key={b.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
            <span style={{ color: crmV2.textMuted, flexShrink: 0, fontWeight: 600 }}>
              {b.count} · {b.pct}%
            </span>
          </div>
          <div style={{ height: 9, background: crmV2.bgMuted, borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(b.count / max) * 100}%`,
                height: '100%',
                background: PERF_COLORS[idx % PERF_COLORS.length],
                borderRadius: 999,
                transition: 'width .35s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function PerfNoveltyDonut({
  newCount,
  existingCount,
  newPct,
  existingPct,
}: {
  newCount: number
  existingCount: number
  newPct: number
  existingPct: number
}) {
  const total = newCount + existingCount
  if (total === 0) {
    return <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas assez de données contacts.</div>
  }
  const R = 42
  const C = 2 * Math.PI * R
  const existingLen = (existingCount / total) * C
  const newLen = (newCount / total) * C
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={R} fill="none" stroke={crmV2.bgMuted} strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={crmV2.text}
          strokeWidth="14"
          strokeDasharray={`${existingLen} ${C - existingLen}`}
          strokeDashoffset={C * 0.25}
          strokeLinecap="butt"
        />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={crmV2.gold}
          strokeWidth="14"
          strokeDasharray={`${newLen} ${C - newLen}`}
          strokeDashoffset={C * 0.25 - existingLen}
          strokeLinecap="butt"
        />
        <text x="60" y="56" textAnchor="middle" fontSize="18" fontWeight="700" fill={crmV2.text}>
          {total}
        </text>
        <text x="60" y="72" textAnchor="middle" fontSize="10" fill={crmV2.textMuted}>
          classés
        </text>
      </svg>
      <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: crmV2.gold }} />
          <span style={{ color: crmV2.text }}>
            Nouveaux CRM <strong>{newPct}%</strong>
          </span>
          <span style={{ color: crmV2.textMuted }}>({newCount})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: crmV2.text }} />
          <span style={{ color: crmV2.text }}>
            Déjà en CRM <strong>{existingPct}%</strong>
          </span>
          <span style={{ color: crmV2.textMuted }}>({existingCount})</span>
        </div>
      </div>
    </div>
  )
}

type EmailValue = { subject?: string; body?: string }
type FormRow = {
  id?: string
  hubspot_form_id: string
  form_name: string
  form_type: string
  slug?: string | null
  public_url?: string | null
}

type Detail = {
  event: {
    id: string
    name: string
    brand: string | null
    event_type: string | null
    event_date: string
    event_time_end: string | null
    location: string | null
    status: string
    description: string | null
    zoom_join_url: string | null
    max_capacity: number | null
    brief?: string | null
    article?: string | null
    custom_sms?: Record<string, string> | null
    custom_emails?: Record<string, EmailValue> | null
    sms_factor_enabled?: boolean | null
  }
  forms: FormRow[]
  registrations: Array<{
    id: string
    first_name: string
    last_name: string
    email: string
    created_at: string | null
    checked_in?: boolean | null
    qr_code?: string | null
    source?: 'crm' | 'meta' | 'events'
  }>
  attendee_counts?: { total: number; crm: number; meta: number; events: number }
  staff: StaffRow[]
  type: { short: string; label: string; staff: boolean; comms: boolean; checkin: boolean }
  staff_url: string | null
  studio_url?: string | null
  /** Salon externe : formulaire de collecte sur stand (tablette) + QR code à imprimer. */
  stand_form_url?: string | null
  stand_form_qr_url?: string | null
  scanner_url?: string | null
  checkin_stats?: {
    registered: number
    present: number
    absent: number
    rate: number
  } | null
  capacity?: {
    registered_count: number
    max_capacity: number | null
    remaining: number | null
    is_full: boolean
  } | null
  staff_needed?: number | null
  staff_remaining?: number | null
  staff_full?: boolean
  perf_stats?: {
    total: number
    matched_contacts: number
    by_zone: Array<{ key: string; label: string; count: number; pct: number }>
    by_classe: Array<{ key: string; label: string; count: number; pct: number }>
    novelty: {
      new_count: number
      existing_count: number
      unknown_count: number
      new_pct: number
      existing_pct: number
    }
  } | null
}

type FormOption = {
  id: string
  name: string
  formType: 'crm' | 'meta'
  slug?: string
  status?: string | null
  leads_count?: number
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [locationEdit, setLocationEdit] = useState('')
  const [capacityEdit, setCapacityEdit] = useState('')
  const [staffNeededEdit, setStaffNeededEdit] = useState('')
  const [staffDispoFilter, setStaffDispoFilter] = useState<string | null>(null)
  const staffDispoCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of data?.staff ?? []) {
      const k = staffDispoKey(s.note)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const days = [...counts.keys()].filter((k) => k !== STAFF_DISPO_ALL && k !== STAFF_DISPO_NONE)
    const allCount = counts.get(STAFF_DISPO_ALL) ?? 0
    const chips = days.map((k) => ({
      key: k,
      label: k,
      count: counts.get(k) ?? 0,
      onSite: (counts.get(k) ?? 0) + allCount,
    }))
    if (allCount) chips.push({ key: STAFF_DISPO_ALL, label: 'Les deux jours', count: allCount, onSite: allCount })
    const noneCount = counts.get(STAFF_DISPO_NONE) ?? 0
    if (noneCount && chips.length) chips.push({ key: STAFF_DISPO_NONE, label: 'Non précisé', count: noneCount, onSite: noneCount })
    return chips
  }, [data?.staff])
  const visibleStaff = useMemo(
    () => (data?.staff ?? []).filter((s) => !staffDispoFilter || staffDispoKey(s.note) === staffDispoFilter),
    [data?.staff, staffDispoFilter],
  )
  const [dateEdit, setDateEdit] = useState('')
  const [timeStartEdit, setTimeStartEdit] = useState('')
  const [timeEndEdit, setTimeEndEdit] = useState('')
  const [zoomEdit, setZoomEdit] = useState('')
  const [typeEdit, setTypeEdit] = useState<EventTypeId>('salon')

  const [smsDraft, setSmsDraft] = useState<Record<string, string>>({})
  const [emailDraft, setEmailDraft] = useState<Record<string, EmailValue>>({})
  const [scheduleDraft, setScheduleDraft] = useState<CommsScheduleMap>({})
  const [commsTab, setCommsTab] = useState<'sms' | 'email'>('email')
  const [emailStep, setEmailStep] = useState('confirmation')
  const [smsStep, setSmsStep] = useState('confirmation')
  const [editorEpoch, setEditorEpoch] = useState(0)

  const [formsPickerOpen, setFormsPickerOpen] = useState(false)
  const [formOptions, setFormOptions] = useState<FormOption[]>([])
  const [formSearch, setFormSearch] = useState('')
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set())
  const [metaFormNames, setMetaFormNames] = useState<Map<string, string>>(new Map())
  const [metaInput, setMetaInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events-studio/events/${id}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setData(json)
      setLocationEdit(json.event?.location || '')
      setCapacityEdit(json.event?.max_capacity != null ? String(json.event.max_capacity) : '')
      setStaffNeededEdit(json.staff_needed != null ? String(json.staff_needed) : '')
      const evDate = json.event?.event_date ? String(json.event.event_date) : ''
      setDateEdit(evDate ? parisDateFromIso(evDate) : '')
      setTimeStartEdit(evDate ? parisTimeFromIso(evDate) : '')
      setTimeEndEdit(json.event?.event_time_end || '')
      setZoomEdit(json.event?.zoom_join_url || '')
      const typeId = currentTypeId(json.event || {})
      setTypeEdit(typeId)

      // Toujours fusionner avec les templates Studio (jamais de champs vides)
      const typeCfgLoad = EVENT_TYPES[typeId]
      const merged = mergeCommsWithDefaults(
        {
          name: json.event?.name,
          article: json.event?.article,
          event_date: json.event?.event_date,
          event_time_end: json.event?.event_time_end,
          location: json.event?.location,
          zoom_join_url: json.event?.zoom_join_url,
          event_type: typeId,
          brand: json.event?.brand,
        },
        json.event?.custom_emails,
        json.event?.custom_sms,
      )
      setScheduleDraft(extractCommsSchedule(json.event?.custom_emails))
      if (typeCfgLoad.comms) {
        setEmailDraft(merged.emails)
        setSmsDraft(merged.sms)
      } else {
        setSmsDraft({ ...(json.event?.custom_sms || {}) })
        setEmailDraft({ ...(json.event?.custom_emails || {}) })
      }

      const selected = new Set<string>()
      const metas = new Map<string, string>()
      for (const f of json.forms || []) {
        selected.add(f.hubspot_form_id)
        if (f.form_type === 'meta' || String(f.hubspot_form_id).startsWith('meta:')) {
          metas.set(f.hubspot_form_id, f.form_name || f.hubspot_form_id.replace(/^meta:/, ''))
        }
      }
      setSelectedFormIds(selected)
      setMetaFormNames(metas)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const emailSteps = useMemo(() => emailStepsFor({ ...evLike(data), event_type: typeEdit }), [data, typeEdit])
  const smsSteps = useMemo(() => smsStepsFor({ ...evLike(data), event_type: typeEdit }), [data, typeEdit])

  useEffect(() => {
    if (!emailSteps.find((s) => s.id === emailStep)) setEmailStep(emailSteps[0]?.id || 'confirmation')
  }, [emailSteps, emailStep])
  useEffect(() => {
    if (!smsSteps.find((s) => s.id === smsStep)) setSmsStep(smsSteps[0]?.id || 'confirmation')
  }, [smsSteps, smsStep])

  const evForDefaults = data?.event
    ? {
        name: data.event.name,
        article: data.event.article,
        event_date: data.event.event_date,
        event_time_end: data.event.event_time_end,
        location: data.event.location,
        zoom_join_url: data.event.zoom_join_url,
        event_type: typeEdit,
        brand: data.event.brand,
      }
    : null

  const emailSubjectValue =
    emailDraft[emailStep]?.subject ??
    (evForDefaults ? defaultEmailSubject(evForDefaults, emailStep) : '')
  const emailBodyValue =
    emailDraft[emailStep]?.body ??
    (evForDefaults ? defaultEmailBody(evForDefaults, emailStep) : '')
  const smsValue =
    smsDraft[smsStep] ?? (evForDefaults ? defaultSmsBody(evForDefaults, smsStep) : '')

  const emailHtmlPreview = useMemo(() => {
    if (!evForDefaults) return ''
    const brand = (data?.event?.brand || 'diploma') as EventBrand
    const zoom =
      data?.event?.zoom_join_url ||
      (typeEdit === 'webinaire' ? BRAND_CONFIG[brand]?.defaultZoom || null : null)
    return buildEmailHtmlPreview(
      {
        ...evForDefaults,
        zoom_join_url: zoom || evForDefaults.zoom_join_url,
        brief: data?.event?.brief,
        brand,
      },
      emailStep,
      emailBodyValue,
    )
  }, [evForDefaults, data?.event?.brief, data?.event?.brand, data?.event?.zoom_join_url, emailStep, emailBodyValue, typeEdit])

  async function setStatus(status: 'published' | 'draft') {
    if (status === 'published' && typeEdit === 'webinaire' && !(zoomEdit.trim() || data?.event?.zoom_join_url)) {
      setToast('Impossible de publier un webinaire sans lien Zoom. Ajoutez le lien Zoom d’abord.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      if (status === 'published') {
        const sent = json.send?.sent
        const synced = json.sync?.inserted
        const total = json.sync?.total
        const parts = ['Événement publié']
        if (typeof synced === 'number' && synced > 0) {
          parts.push(`${synced} inscrit(s) synchronisé(s)`)
        }
        if (typeof total === 'number') parts.push(`${total} au total`)
        if (typeof sent === 'number') {
          parts.push(sent > 0 ? `${sent} confirmation(s) envoyée(s)` : 'aucune confirmation à envoyer')
        } else if (json.send?.message) {
          parts.push(String(json.send.message))
        }
        setToast(parts.join(' · '))
      } else {
        setToast('Repassé en brouillon')
      }
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function savePlaces() {
    if (!dateEdit.trim() || !timeStartEdit.trim()) {
      setToast('Date et heure de début obligatoires')
      return
    }
    if (!timeEndEdit.trim()) {
      setToast('Heure de fin obligatoire')
      return
    }
    setBusy(true)
    try {
      const typeCfg = EVENT_TYPES[typeEdit]
      const body: Record<string, unknown> = {
        event_type: typeEdit,
        location: locationEdit,
        date: dateEdit.trim(),
        time_start: timeStartEdit.trim(),
        time_end: timeEndEdit.trim(),
        max_capacity: capacityEdit.trim() === '' ? null : parseInt(capacityEdit, 10),
      }
      if (typeCfg.staff) {
        body.staff_needed = staffNeededEdit.trim() === '' ? null : parseInt(staffNeededEdit, 10)
      }
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setToast('Type, date, horaires, lieu, places et staff enregistrés')
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  function setStepSchedule(stepId: string, entry: CommsScheduleEntry) {
    setScheduleDraft((prev) => ({ ...prev, [stepId]: entry }))
  }

  function scheduleForSave(): CommsScheduleMap {
    const out: CommsScheduleMap = { ...scheduleDraft }
    for (const s of [...emailSteps, ...smsSteps]) {
      out[s.id] = resolveSchedule(scheduleDraft, s.id)
    }
    return out
  }

  async function saveComms() {
    setBusy(true)
    try {
      const base = evForDefaults || { event_type: typeEdit }
      // Sauvegarde les textes tels que modifiés (sans écraser les edits)
      const merged = mergeCommsWithDefaults(base, emailDraft, smsDraft, { applyFixes: false })
      const schedule = scheduleForSave()
      const emailsWithSchedule = attachCommsSchedule(merged.emails, schedule)
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_sms: merged.sms, custom_emails: emailsWithSchedule }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setEmailDraft(merged.emails)
      setSmsDraft(merged.sms)
      setScheduleDraft(schedule)
      setToast('Communications enregistrées — textes et horaires sauvegardés')
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function openFormsPicker() {
    setFormsPickerOpen(true)
    setFormSearch('')
    try {
      const [crmFormsRes, metaPagesRes] = await Promise.all([
        fetch(`/api/events-studio/crm-forms?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/meta/pages', { credentials: 'include', cache: 'no-store' }).catch(() => null),
      ])
      const json = await crmFormsRes.json()
      const byId = new Map<string, FormOption>()

      if (crmFormsRes.ok) {
        for (const f of (json.forms || []) as FormOption[]) {
          const formType = f.formType === 'meta' || String(f.id).startsWith('meta:') ? 'meta' : 'crm'
          byId.set(f.id, {
            id: f.id,
            name: f.name,
            formType,
            slug: f.slug,
            status: f.status,
            leads_count: f.leads_count,
          })
        }
      }

      // Filet de sécurité : aussi charger depuis /api/meta/pages (même source que Meta Lead Ads)
      if (metaPagesRes?.ok) {
        const metaJson = await metaPagesRes.json()
        for (const f of metaJson.forms || []) {
          const name = String(f.name || '').trim()
          if (!name) continue
          const id = `meta:${name}`
          if (byId.has(id)) continue
          byId.set(id, {
            id,
            name,
            formType: 'meta',
            status: f.status,
            leads_count: f.leads_count ?? 0,
          })
        }
      }

      const forms = [...byId.values()].sort((a, b) => {
        if (a.formType !== b.formType) return a.formType === 'meta' ? -1 : 1
        return a.name.localeCompare(b.name, 'fr')
      })
      setFormOptions(forms)
      const metaN = forms.filter((f) => f.formType === 'meta').length
      if (metaN === 0) {
        setToast('Aucun formulaire Meta trouvé — vérifie Meta Lead Ads ou ajoute un nom manuellement')
      }
    } catch {
      setToast('Erreur chargement des formulaires')
    }
  }

  function toggleForm(formId: string, formType: 'crm' | 'meta', formName: string) {
    setSelectedFormIds((prev) => {
      const next = new Set(prev)
      if (next.has(formId)) {
        next.delete(formId)
        if (formType === 'meta') {
          setMetaFormNames((m) => {
            const n = new Map(m)
            n.delete(formId)
            return n
          })
        }
      } else {
        next.add(formId)
        if (formType === 'meta') {
          setMetaFormNames((m) => new Map(m).set(formId, formName))
        }
      }
      return next
    })
  }

  function addMetaForm() {
    const name = metaInput.trim()
    if (!name) return
    const key = `meta:${name}`
    setMetaFormNames((prev) => new Map(prev).set(key, name))
    setSelectedFormIds((prev) => new Set(prev).add(key))
    setMetaInput('')
  }

  async function saveForms() {
    setBusy(true)
    try {
      const forms: Array<{ hubspot_form_id: string; form_name: string; form_type: string }> = []
      for (const formId of selectedFormIds) {
        if (formId.startsWith('meta:') || metaFormNames.has(formId)) {
          forms.push({
            hubspot_form_id: formId.startsWith('meta:') ? formId : `meta:${formId}`,
            form_name: metaFormNames.get(formId) || formId.replace(/^meta:/, ''),
            form_type: 'meta',
          })
          continue
        }
        const opt = formOptions.find((f) => f.id === formId)
        const existing = data?.forms.find((f) => f.hubspot_form_id === formId)
        forms.push({
          hubspot_form_id: formId,
          form_name: opt?.name || existing?.form_name || formId,
          form_type: opt?.formType === 'meta' ? 'meta' : 'crm',
        })
      }
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forms }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setToast(`${forms.length} formulaire(s) enregistré(s)`)
      setFormsPickerOpen(false)
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  function regenerateComms() {
    if (!data?.event) return
    const merged = mergeCommsWithDefaults(
      {
        name: data.event.name,
        article: data.event.article,
        event_date: data.event.event_date,
        event_time_end: data.event.event_time_end,
        location: data.event.location,
        zoom_join_url: data.event.zoom_join_url,
        event_type: typeEdit,
        brand: data.event.brand,
      },
      null,
      null,
    )
    setEmailDraft(merged.emails)
    setSmsDraft(merged.sms)
    setEditorEpoch((n) => n + 1)
    setToast('Communications régénérées (enregistrez pour sauvegarder)')
  }

  async function remove() {
    if (!confirm('Supprimer cet événement et ses inscriptions ?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Erreur')
      }
      router.push('/admin/crm/events')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
      setBusy(false)
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => setToast('Lien copié'))
  }

  const ev = data?.event
  const brand = (ev?.brand || 'diploma') as EventBrand
  const typeCfg = EVENT_TYPES[typeEdit]
  const showStaffEdit = typeCfg.staff
  const showComms = typeCfg.comms
  const showCheckin = typeCfg.physical
  const cap = data?.capacity
  const hasZoom = Boolean((zoomEdit || ev?.zoom_join_url || '').trim())
  const zoomBlockPublish = typeEdit === 'webinaire' && !hasZoom
  const attendeeCounts = data?.attendee_counts
  const inscriptionTotal = attendeeCounts?.total ?? cap?.registered_count ?? data?.registrations.length ?? 0
  const inputStyle: CSSProperties = evFieldStyle

  // ——— Présentation V2 (onglets, mobile) : aucun effet sur la logique ———
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('apercu')
  const timeslotEligible = ev
    ? isSalonEtudesMedecineTimeslotEvent({ id: ev.id, name: ev.name, event_date: ev.event_date })
    : false
  const showStaffPanel = Boolean(data?.type.staff && data?.staff_url)
  const tabItems: Array<{ id: string; label: string; count?: number }> = [
    { id: 'apercu', label: 'Vue d’ensemble' },
    ...(showComms ? [{ id: 'communications', label: 'Communications' }] : []),
    ...(timeslotEligible ? [{ id: 'creneaux', label: 'Créneaux & SMS' }] : []),
    { id: 'inscrits', label: 'Inscrits', count: inscriptionTotal },
    ...(showStaffPanel ? [{ id: 'staff', label: 'Staff', count: data?.staff.length ?? 0 }] : []),
    { id: 'formulaires', label: 'Formulaires', count: data?.forms.length ?? 0 },
  ]
  const activeTab = tabItems.some((t) => t.id === tab) ? tab : 'apercu'
  const pagePad = isMobile ? 12 : 28
  const fieldLabel = (text: string) => <EvLabel>{text}</EvLabel>
  const registrationDate = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  const capacityLine = cap
    ? `Inscrits : ${inscriptionTotal}${
        cap.max_capacity != null
          ? ` / ${cap.max_capacity} · ${
              cap.max_capacity != null
                ? Math.max(0, cap.max_capacity - inscriptionTotal)
                : 0
            } restante(s)`
          : ' · illimité'
      }${
        attendeeCounts
          ? ` (CRM ${attendeeCounts.crm} · Meta ${attendeeCounts.meta})`
          : ''
      }`
    : attendeeCounts
      ? `Inscrits : ${attendeeCounts.total} (CRM ${attendeeCounts.crm} · Meta ${attendeeCounts.meta})`
      : 'Places leads optionnelles.'

  async function saveZoom() {
    setBusy(true)
    try {
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoom_join_url: zoomEdit.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setToast('Lien Zoom enregistré')
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const metaCheckRow = (key: string, name: string, kind: 'meta' | 'crm') => (
    <label
      key={key}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        fontSize: 13,
        cursor: 'pointer',
        minHeight: 40,
        padding: '0 10px',
        borderRadius: 10,
        background: selectedFormIds.has(key) ? (kind === 'meta' ? 'rgba(24,119,242,0.06)' : crmV2.goldSoft) : crmV2.bg,
        border: `1px solid ${crmV2.border}`,
      }}
    >
      <input
        type="checkbox"
        checked={selectedFormIds.has(key)}
        onChange={() => toggleForm(key, kind, name)}
        style={{ width: 16, height: 16, accentColor: crmV2.gold, flexShrink: 0 }}
      />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <EvSourcePill source={kind} />
    </label>
  )

  return (
    <CrmV2Page>
      {/* ——— En-tête de fiche (gabarit B) ——— */}
      <div
        style={{
          background: crmV2.bg,
          borderBottom: `1px solid ${crmV2.border}`,
          padding: isMobile ? '14px 12px 0' : '16px 28px 0',
        }}
      >
        <Link
          href="/admin/crm/events"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: isMobile ? 40 : undefined,
            fontSize: 13,
            fontWeight: 600,
            color: crmV2.textMuted,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> Événements
        </Link>

        {!ev && (
          <h1 style={{ margin: '10px 0 16px', fontSize: isMobile ? 20 : 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Événement
          </h1>
        )}

        {ev && data && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: isMobile ? 'flex-start' : 'center',
                gap: isMobile ? 12 : 16,
                marginTop: isMobile ? 6 : 14,
                flexWrap: 'wrap',
              }}
            >
              <EventAvatar typeId={typeEdit} size={isMobile ? 48 : 56} />
              <div style={{ flex: isMobile ? '1 1 0' : '1 1 320px', minWidth: isMobile ? 0 : 260 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 20 : 24,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {ev.name}
                </h1>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px 14px',
                    marginTop: 4,
                    fontSize: 13,
                    color: crmV2.textMuted,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{BRAND_CONFIG[brand]?.name || brand}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CalendarDays size={13} /> {formatEventSchedule(ev)}
                  </span>
                  {ev.location ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <MapPin size={13} style={{ flexShrink: 0 }} /> {ev.location}
                    </span>
                  ) : null}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  width: isMobile ? '100%' : undefined,
                }}
              >
                {typeEdit !== currentTypeId(ev) && (
                  <CrmV2Button variant="gold" disabled={busy} onClick={savePlaces} icon={<Save size={14} />}>
                    Enregistrer le type
                  </CrmV2Button>
                )}
                {showCheckin && data.scanner_url && (
                  <a href={data.scanner_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <CrmV2Button variant="secondary" icon={<QrCode size={14} />}>
                      Scanner QR
                    </CrmV2Button>
                  </a>
                )}
                {ev.status !== 'published' ? (
                  <CrmV2Button
                    variant="accent"
                    disabled={busy || zoomBlockPublish}
                    onClick={() => setStatus('published')}
                    title={
                      zoomBlockPublish
                        ? 'Ajoutez un lien Zoom avant de publier ce webinaire'
                        : undefined
                    }
                    icon={<Rocket size={14} />}
                  >
                    Publier
                  </CrmV2Button>
                ) : (
                  <CrmV2Button variant="secondary" disabled={busy} onClick={() => setStatus('draft')} icon={<EyeOff size={14} />}>
                    Dépublier
                  </CrmV2Button>
                )}
                <CrmV2Button variant="danger" disabled={busy} onClick={remove} icon={<Trash2 size={14} />}>
                  Supprimer
                </CrmV2Button>
              </div>
            </div>

            {/* Pastilles : statut, type, compteur d’inscriptions / leads */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <CrmV2StatusPill
                size="md"
                label={ev.status === 'published' ? 'Publié' : 'Brouillon'}
                color={ev.status === 'published' ? '#00866f' : crmV2.textFaint}
                bg={ev.status === 'published' ? 'rgba(0,189,165,0.12)' : crmV2.chipBg}
              />
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: crmV2.goldSoft,
                  border: `1px solid ${crmV2.goldBorder}`,
                  borderRadius: crmV2.radiusPill,
                  padding: '0 4px 0 12px',
                  height: isMobile ? 36 : 28,
                }}
              >
                <span style={{ fontSize: 12, color: crmV2.goldDark, fontWeight: 700 }}>Type</span>
                <select
                  value={typeEdit}
                  disabled={busy}
                  onChange={(e) => setTypeEdit(e.target.value as EventTypeId)}
                  style={{
                    appearance: 'auto',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: 700,
                    color: crmV2.goldDark,
                    cursor: 'pointer',
                    outline: 'none',
                    paddingRight: 4,
                  }}
                >
                  {EDITABLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_TYPES[t].label}
                    </option>
                  ))}
                </select>
              </label>
              <span
                title={
                  attendeeCounts
                    ? `CRM ${attendeeCounts.crm} · Meta ${attendeeCounts.meta} · Events ${attendeeCounts.events}`
                    : undefined
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 12px',
                  borderRadius: crmV2.radiusPill,
                  background: crmV2.chipBg,
                  border: `1px solid ${crmV2.chipBorder}`,
                  color: crmV2.text,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Users size={13} color={crmV2.gold} />
                <strong style={{ fontSize: 13, fontWeight: 700 }}>{inscriptionTotal}</strong>
                <span>
                  {typeCfg.standForm
                    ? `lead${inscriptionTotal > 1 ? 's' : ''} collecté${inscriptionTotal > 1 ? 's' : ''}`
                    : `inscrit${inscriptionTotal > 1 ? 's' : ''}`}
                </span>
                {cap?.max_capacity != null && (
                  <span style={{ color: crmV2.textMuted, fontWeight: 500 }}>/ {cap.max_capacity} places</span>
                )}
              </span>
              {attendeeCounts && attendeeCounts.meta > 0 && (
                <span style={{ fontSize: 12, color: crmV2.textMuted }}>
                  dont {attendeeCounts.crm} formulaire{attendeeCounts.crm > 1 ? 's' : ''} CRM · {attendeeCounts.meta} Meta
                </span>
              )}
            </div>
          </>
        )}

        <div style={{ marginTop: ev && data ? 10 : 0 }}>
          {ev && data ? (
            <CrmV2Tabs items={tabItems} value={activeTab} onChange={setTab} bordered={false} />
          ) : (
            <div style={{ height: 1 }} />
          )}
        </div>
      </div>

      {/* ——— Corps ——— */}
      <div style={{ padding: isMobile ? 12 : `16px ${pagePad}px 28px`, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
        {toast && <EvNotice tone="gold">{toast}</EvNotice>}

        {loading && !data && <CrmV2Spinner />}
        {loading && data && <div style={{ color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>}
        {error && <EvNotice tone="danger">{error}</EvNotice>}

        {ev && data && (
          <>
            {!showComms && (
              <EvNotice tone="gold">
                {typeCfg.label} — collecte CRM uniquement, aucune communication email/SMS à la publication.
              </EvNotice>
            )}

            {zoomBlockPublish && (
              <EvNotice tone="danger">
                Webinaire : ajoutez un lien Zoom ci-dessous avant de pouvoir publier. Sans Zoom, les inscrits
                ne pourraient pas rejoindre la session ni recevoir le bon lien dans les emails/SMS.
              </EvNotice>
            )}

            {/* ═════════ Vue d’ensemble ═════════ */}
            <EvTabPanel active={activeTab === 'apercu'}>
              <div
                className="ev-detail-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(280px, 340px)',
                  gap: isMobile ? 12 : 16,
                  alignItems: 'start',
                }}
              >
                {/* Colonne principale */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minWidth: 0 }}>
                  <EvCard title="Type, date, horaires, lieu, places & staff" icon={<Settings2 size={16} />}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
                        gap: '14px 12px',
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
                        {fieldLabel('Type')}
                        <select style={{ ...inputStyle, cursor: 'pointer' }} value={typeEdit} onChange={(e) => setTypeEdit(e.target.value as EventTypeId)}>
                          {EDITABLE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {EVENT_TYPES[t].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
                        {fieldLabel('Date')}
                        <input
                          type="date"
                          style={inputStyle}
                          value={dateEdit}
                          onChange={(e) => setDateEdit(e.target.value)}
                        />
                      </div>
                      <div>
                        {fieldLabel('Début')}
                        <input
                          type="time"
                          style={inputStyle}
                          value={timeStartEdit}
                          onChange={(e) => setTimeStartEdit(e.target.value)}
                        />
                      </div>
                      <div>
                        {fieldLabel('Fin')}
                        <input
                          type="time"
                          style={inputStyle}
                          value={timeEndEdit}
                          onChange={(e) => setTimeEndEdit(e.target.value)}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile
                          ? 'repeat(2, minmax(0, 1fr))'
                          : showStaffEdit
                            ? 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)'
                            : 'minmax(0, 3fr) minmax(0, 1fr)',
                        gap: '14px 12px',
                      }}
                    >
                      <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
                        {fieldLabel('Adresse / lieu')}
                        <input
                          style={inputStyle}
                          value={locationEdit}
                          onChange={(e) => setLocationEdit(e.target.value)}
                          placeholder="Ex: Paris Expo Porte de Versailles"
                        />
                      </div>
                      <div>
                        {fieldLabel('Places leads')}
                        <input
                          type="number"
                          min={0}
                          style={inputStyle}
                          value={capacityEdit}
                          onChange={(e) => setCapacityEdit(e.target.value)}
                          placeholder="Illimité"
                        />
                      </div>
                      {showStaffEdit && (
                        <div>
                          {fieldLabel('Staff nécessaires')}
                          <input
                            type="number"
                            min={0}
                            style={inputStyle}
                            value={staffNeededEdit}
                            onChange={(e) => setStaffNeededEdit(e.target.value)}
                            placeholder="Ex: 4"
                          />
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: `1px solid ${crmV2.borderLight}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ fontSize: 12, color: crmV2.textMuted, minWidth: 0 }}>{capacityLine}</div>
                      <CrmV2Button variant="primary" disabled={busy} onClick={savePlaces} icon={<Save size={14} />}>
                        Enregistrer
                      </CrmV2Button>
                    </div>
                  </EvCard>

                  {!showStaffPanel && (
                    <EvCard
                      title={`Zoom / visio${typeEdit === 'webinaire' ? ' (obligatoire)' : ''}`}
                      icon={<Video size={16} />}
                    >
                      {typeEdit === 'webinaire' && !hasZoom && (
                        <EvNotice tone="danger" style={{ marginBottom: 10, fontSize: 12 }}>
                          Publication bloquée tant qu’aucun lien Zoom n’est enregistré.
                        </EvNotice>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          style={{ ...inputStyle, flex: '1 1 260px', width: 'auto', minWidth: 0 }}
                          value={zoomEdit}
                          onChange={(e) => setZoomEdit(e.target.value)}
                          placeholder="https://zoom.us/j/…"
                        />
                        <CrmV2Button variant="primary" disabled={busy} onClick={saveZoom} icon={<Save size={14} />}>
                          Enregistrer le lien Zoom
                        </CrmV2Button>
                      </div>
                    </EvCard>
                  )}

                  {/* ——— Performances leads ——— */}
                  {data.perf_stats && data.perf_stats.total > 0 && (
                    <EvCard
                      title="Performances leads"
                      icon={<BarChart3 size={16} />}
                      subtitle={`${data.perf_stats.total} inscrits · ${data.perf_stats.matched_contacts} matchés CRM`}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                          gap: 12,
                        }}
                        className="event-perf-grid"
                      >
                        <EvSubBlock title="Par zone">
                          <PerfBarList items={data.perf_stats.by_zone} emptyLabel="Aucune zone renseignée." />
                        </EvSubBlock>
                        <EvSubBlock title="Par classe actuelle">
                          <PerfBarList items={data.perf_stats.by_classe} emptyLabel="Aucune classe renseignée." />
                        </EvSubBlock>
                        <EvSubBlock title="Nouveaux vs déjà en CRM">
                          <PerfNoveltyDonut
                            newCount={data.perf_stats.novelty.new_count}
                            existingCount={data.perf_stats.novelty.existing_count}
                            newPct={data.perf_stats.novelty.new_pct}
                            existingPct={data.perf_stats.novelty.existing_pct}
                          />
                          {data.perf_stats.novelty.unknown_count > 0 && (
                            <div style={{ marginTop: 10, fontSize: 11, color: crmV2.textFaint }}>
                              {data.perf_stats.novelty.unknown_count} non classés (contact CRM introuvable ou dates
                              manquantes)
                            </div>
                          )}
                        </EvSubBlock>
                      </div>
                    </EvCard>
                  )}

                  {ev.description && (
                    <EvCard title="Description" icon={<FileText size={16} />}>
                      <p style={{ margin: 0, fontSize: 13, color: crmV2.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                        {ev.description}
                      </p>
                    </EvCard>
                  )}
                </div>

                {/* Colonne droite — sections repliables */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  <CrmV2Section
                    title="Inscriptions"
                    icon={<Users size={15} />}
                    count={inscriptionTotal}
                    storageKey="crm-event-fiche-inscriptions"
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      <EvStat
                        label={typeCfg.standForm ? 'Leads' : 'Inscrits'}
                        value={inscriptionTotal}
                        color={crmV2.goldDark}
                      />
                      <EvStat
                        label="Places"
                        value={cap?.max_capacity != null ? cap.max_capacity : '∞'}
                      />
                    </div>
                    {attendeeCounts && inscriptionTotal > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: crmV2.textMuted }}>
                        CRM {attendeeCounts.crm} · Meta {attendeeCounts.meta}
                        {attendeeCounts.events > 0 ? ` · Events ${attendeeCounts.events}` : ''}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <CrmV2Button variant="ghost" size="sm" onClick={() => setTab('inscrits')} style={{ paddingLeft: 0 }}>
                        Voir les inscrits
                      </CrmV2Button>
                    </div>
                  </CrmV2Section>

                  {/* ——— Salon : formulaire de collecte sur stand (tablette + QR code) ——— */}
                  {typeCfg.standForm && (
                    <CrmV2Section
                      title="Formulaire stand — tablette & QR code"
                      icon={<QrCode size={15} />}
                      storageKey="crm-event-fiche-stand"
                    >
                      {data.stand_form_url ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            {data.stand_form_qr_url && (
                              <a
                                href={data.stand_form_qr_url}
                                target="_blank"
                                rel="noreferrer"
                                title="Ouvrir le QR code en grand (clic droit → enregistrer l’image)"
                                style={{
                                  flex: 'none',
                                  display: 'block',
                                  padding: 8,
                                  borderRadius: 12,
                                  border: `1px solid ${crmV2.border}`,
                                  background: '#fff',
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={data.stand_form_qr_url}
                                  alt="QR code du formulaire stand"
                                  width={150}
                                  height={150}
                                  style={{ display: 'block', width: 150, height: 150 }}
                                />
                              </a>
                            )}
                            <div style={{ minWidth: 0, flex: '1 1 140px' }}>
                              <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                                Lien à ouvrir sur la tablette du stand (le QR code y renvoie)
                              </div>
                              <div style={{ fontSize: 13, color: crmV2.link, wordBreak: 'break-all' }}>
                                {data.stand_form_url}
                              </div>
                              {data.stand_form_qr_url && (
                                <a
                                  href={data.stand_form_qr_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    marginTop: 10,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: crmV2.link,
                                    textDecoration: 'none',
                                  }}
                                >
                                  <Download size={13} /> QR code en grand (PNG)
                                </a>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <CrmV2Button variant="secondary" size="sm" onClick={() => copy(data.stand_form_url!)} icon={<Copy size={14} />}>
                              Copier le lien
                            </CrmV2Button>
                            <a href={data.stand_form_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                              <CrmV2Button variant="gold" size="sm" icon={<ExternalLink size={14} />}>
                                Ouvrir le formulaire
                              </CrmV2Button>
                            </a>
                          </div>
                          <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.55 }}>
                            Formulaire aux couleurs Diploma Santé (en-tête bleu nuit, date du salon, bouton doré) : il se
                            réinitialise 8 s après chaque envoi pour le visiteur suivant. Imprimez le QR code pour que les
                            visiteurs le remplissent sur leur téléphone. Les leads arrivent dans le CRM avec l’origine
                            « Salons » et le formulaire de ce salon comme événement de conversion.
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
                          Aucun formulaire CRM lié à ce salon : liez-en un via « Gérer les formulaires » (onglet
                          Formulaires){typeEdit !== currentTypeId(ev) ? ', puis enregistrez le type' : ''}.
                        </div>
                      )}
                    </CrmV2Section>
                  )}

                  {/* ——— Scan QR / check-in ——— */}
                  {showCheckin && (
                    <CrmV2Section
                      title="Scan QR & présence"
                      icon={<QrCode size={15} />}
                      storageKey="crm-event-fiche-checkin"
                    >
                      {data.scanner_url && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 6 }}>
                            Lien public — à donner au staff sur place, sans connexion
                          </div>
                          <div style={{ fontSize: 12, color: crmV2.link, wordBreak: 'break-all', marginBottom: 10 }}>
                            {data.scanner_url}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <CrmV2Button variant="secondary" size="sm" onClick={() => copy(data.scanner_url!)} icon={<Copy size={14} />}>
                              Copier le lien
                            </CrmV2Button>
                            <a href={data.scanner_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                              <CrmV2Button variant="gold" size="sm" icon={<QrCode size={14} />}>
                                Ouvrir le scanner
                              </CrmV2Button>
                            </a>
                          </div>
                        </div>
                      )}
                      {data.checkin_stats ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                          {[
                            ['Inscrits', data.checkin_stats.registered, crmV2.text],
                            ['Présents', data.checkin_stats.present, '#00866f'],
                            ['Absents', data.checkin_stats.absent, crmV2.textMuted],
                            ['Taux', `${data.checkin_stats.rate}%`, crmV2.goldDark],
                          ].map(([label, value, color]) => (
                            <EvStat key={String(label)} label={label} value={value} color={String(color)} />
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas encore de données de présence.</div>
                      )}
                    </CrmV2Section>
                  )}

                  <CrmV2Section
                    title="Formulaires associés"
                    icon={<FileText size={15} />}
                    count={data.forms.length}
                    storageKey="crm-event-fiche-forms"
                  >
                    {data.forms.length === 0 ? (
                      <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun formulaire lié (CRM ou Meta).</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.forms.map((f) => {
                          const isMeta = f.form_type === 'meta' || String(f.hubspot_form_id).startsWith('meta:')
                          return (
                            <div key={f.hubspot_form_id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13 }}>
                              <EvSourcePill source={isMeta ? 'meta' : 'crm'} label={isMeta ? 'Meta Ads' : 'CRM'} />
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                {f.form_name}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <CrmV2Button variant="ghost" size="sm" onClick={() => setTab('formulaires')} style={{ paddingLeft: 0 }}>
                        Gérer les formulaires
                      </CrmV2Button>
                    </div>
                  </CrmV2Section>

                  {showStaffPanel && (
                    <CrmV2Section
                      title="Équipe staff"
                      icon={<Users size={15} />}
                      count={data.staff.length}
                      storageKey="crm-event-fiche-staff"
                    >
                      <div style={{ fontSize: 13, color: crmV2.textMuted }}>
                        {data.staff.length === 0
                          ? 'Personne n’a encore postulé.'
                          : `${data.staff.length} staff inscrit(s)${data.staff_needed != null ? ` sur ${data.staff_needed} nécessaires` : ''}.`}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <CrmV2Button variant="ghost" size="sm" onClick={() => setTab('staff')} style={{ paddingLeft: 0 }}>
                          Voir l’équipe
                        </CrmV2Button>
                      </div>
                    </CrmV2Section>
                  )}
                </div>
              </div>
              <style>{`
                @media (max-width: 1100px) {
                  .ev-detail-grid { grid-template-columns: minmax(0, 1fr) !important; }
                }
                @media (max-width: 980px) {
                  .event-perf-grid { grid-template-columns: 1fr !important; }
                }
              `}</style>
            </EvTabPanel>

            {/* ═════════ Communications email / SMS ═════════ */}
            {showComms && (
              <EvTabPanel active={activeTab === 'communications'}>
                <EvCard
                  title="Communications (email & SMS)"
                  icon={<Mail size={16} />}
                  actions={
                    <>
                      <CrmV2Pill>Exp : {brandSender(ev.brand)}</CrmV2Pill>
                      <CrmV2StatusPill
                        label={`SMS : ${ev.sms_factor_enabled ? 'activés' : 'désactivés'}`}
                        color={ev.sms_factor_enabled ? '#16a34a' : '#d13a41'}
                      />
                      {data.studio_url && (
                        <a href={data.studio_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <CrmV2Button variant="ghost" size="sm" icon={<ExternalLink size={14} />}>
                            Ouvrir dans Studio
                          </CrmV2Button>
                        </a>
                      )}
                    </>
                  }
                >
                  {ev.brief && (
                    <div
                      style={{
                        marginBottom: 14,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: crmV2.bgSoft,
                        fontSize: 13,
                        color: crmV2.textMuted,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: crmV2.text }}>Brief : </strong>
                      {ev.brief}
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}>
                    <CrmV2Segmented<'sms' | 'email'>
                      items={[
                        {
                          id: 'email',
                          label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Mail size={14} /> Emails
                            </span>
                          ),
                        },
                        {
                          id: 'sms',
                          label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <MessageSquare size={14} /> SMS
                            </span>
                          ),
                        },
                      ]}
                      value={commsTab}
                      onChange={(v) => setCommsTab(v)}
                    />
                  </div>

                  {ev?.event_date ? (
                    <CommsScheduleTable
                      steps={commsTab === 'email' ? emailSteps : smsSteps}
                      eventDate={ev.event_date}
                      schedule={scheduleDraft}
                      onChange={setStepSchedule}
                      inputStyle={inputStyle}
                    />
                  ) : null}

                  {commsTab === 'email' ? (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <EvChoicePills items={emailSteps} value={emailStep} onChange={setEmailStep} />
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.15fr)',
                          gap: 16,
                          alignItems: 'start',
                        }}
                        className="event-comms-grid"
                      >
                        <div style={{ minWidth: 0 }}>
                          <EvLabel>Objet (modifiable)</EvLabel>
                          <CommsTextField
                            key={`email-subject-${emailStep}-${editorEpoch}`}
                            fieldKey={`email-subject-${emailStep}-${editorEpoch}`}
                            value={emailSubjectValue}
                            onChange={(subject) =>
                              setEmailDraft((prev) => ({
                                ...prev,
                                [emailStep]: { ...prev[emailStep], subject },
                              }))
                            }
                            style={{ ...inputStyle, marginBottom: 12 }}
                            placeholder="Objet de l'email"
                          />
                          <EvLabel>Texte du mail (modifiable) — utilisez {'{prenom}'}</EvLabel>
                          <CommsTextField
                            key={`email-body-${emailStep}-${editorEpoch}`}
                            fieldKey={`email-body-${emailStep}-${editorEpoch}`}
                            value={emailBodyValue}
                            onChange={(body) =>
                              setEmailDraft((prev) => ({
                                ...prev,
                                [emailStep]: { ...prev[emailStep], body },
                              }))
                            }
                            style={{ ...inputStyle, minHeight: isMobile ? 180 : 240, resize: 'vertical', lineHeight: 1.5 }}
                            placeholder="Texte du mail (utilisez {prenom})"
                            multiline
                          />
                          <div style={{ marginTop: 8, fontSize: 11, color: crmV2.textFaint, lineHeight: 1.45 }}>
                            L’aperçu à droite se met à jour en direct. Les horaires se règlent dans le tableau en haut.
                            « Enregistrer » sauvegarde textes + horaires.
                          </div>
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginBottom: 6,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>
                              Aperçu HTML — {emailSteps.find((s) => s.id === emailStep)?.label || emailStep}
                            </div>
                            <div style={{ fontSize: 11, color: crmV2.textFaint, minWidth: 0, overflowWrap: 'anywhere' }}>
                              Objet : {emailSubjectValue}
                            </div>
                          </div>
                          <div
                            style={{
                              border: `1px solid ${crmV2.border}`,
                              borderRadius: 12,
                              overflow: 'hidden',
                              background: '#F5F2EC',
                              minHeight: 420,
                            }}
                          >
                            <iframe
                              title="Aperçu email HTML"
                              srcDoc={emailHtmlPreview}
                              style={{
                                width: '100%',
                                height: 520,
                                border: 'none',
                                background: '#F5F2EC',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <style>{`
                        @media (max-width: 900px) {
                          .event-comms-grid { grid-template-columns: 1fr !important; }
                        }
                      `}</style>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <EvChoicePills items={smsSteps} value={smsStep} onChange={setSmsStep} />
                      </div>
                      <CommsTextField
                        key={`sms-${smsStep}-${editorEpoch}`}
                        fieldKey={`sms-${smsStep}-${editorEpoch}`}
                        value={smsValue}
                        onChange={(text) => setSmsDraft((prev) => ({ ...prev, [smsStep]: text }))}
                        style={{ ...inputStyle, minHeight: 120, resize: 'vertical', lineHeight: 1.5 }}
                        placeholder="Texte SMS (utilisez {prenom} pour personnaliser)"
                        multiline
                      />
                      <div style={{ marginTop: 6, fontSize: 11, color: crmV2.textFaint }}>
                        {smsValue.length} caractères — horaires dans le tableau en haut
                      </div>
                    </>
                  )}

                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 14,
                      borderTop: `1px solid ${crmV2.borderLight}`,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <CrmV2Button variant="secondary" disabled={busy} onClick={regenerateComms}>
                      Régénérer les textes
                    </CrmV2Button>
                    <CrmV2Button variant="primary" disabled={busy} onClick={saveComms} icon={<Save size={14} />}>
                      Enregistrer les communications
                    </CrmV2Button>
                  </div>
                </EvCard>
              </EvTabPanel>
            )}

            {/* ═════════ Créneaux & SMS (salon) ═════════ */}
            {timeslotEligible && (
              <EvTabPanel active={activeTab === 'creneaux'}>
                <EventTimeslotSurveyCard
                  eventId={ev.id}
                  eventName={ev.name}
                  eventDate={ev.event_date}
                  inputStyle={inputStyle}
                />
              </EvTabPanel>
            )}

            {/* ═════════ Inscrits ═════════ */}
            <EvTabPanel active={activeTab === 'inscrits'}>
              <EvCard
                title={`Inscriptions (${inscriptionTotal})`}
                icon={<Users size={16} />}
                subtitle={
                  attendeeCounts && inscriptionTotal > 0
                    ? `CRM ${attendeeCounts.crm} · Meta ${attendeeCounts.meta}${
                        attendeeCounts.events > 0 ? ` · Events ${attendeeCounts.events}` : ''
                      }`
                    : undefined
                }
                style={{ padding: 0, overflow: 'hidden' }}
              >
                <div style={{ borderTop: `1px solid ${crmV2.border}` }}>
                  {data.registrations.length === 0 ? (
                    <CrmV2Empty icon={<Users size={26} />} title="Pas encore d’inscrits." />
                  ) : isMobile ? (
                    <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                      {data.registrations.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            minHeight: 52,
                            padding: '8px 12px',
                            borderBottom: `1px solid ${crmV2.borderLight}`,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.first_name} {r.last_name}
                            </div>
                            <div style={{ fontSize: 11, color: crmV2.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.email}
                              {r.created_at ? ` · Inscrit le ${registrationDate(r.created_at)}` : ''}
                            </div>
                          </div>
                          {r.source && <EvSourcePill source={r.source} />}
                          {showCheckin && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: r.checked_in ? '#00866f' : crmV2.textFaint }}>
                              {r.checked_in ? 'Présent' : '—'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                      <CrmV2Table>
                        <thead>
                          <tr>
                            <CrmV2Th>Nom</CrmV2Th>
                            <CrmV2Th>E-mail</CrmV2Th>
                            <CrmV2Th>Source</CrmV2Th>
                            {showCheckin && <CrmV2Th>Présence</CrmV2Th>}
                            <CrmV2Th>Inscrit le</CrmV2Th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.registrations.map((r) => (
                            <CrmV2Tr key={r.id}>
                              <CrmV2Td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {r.first_name} {r.last_name}
                              </CrmV2Td>
                              <CrmV2Td style={{ color: crmV2.textMuted }}>{r.email}</CrmV2Td>
                              <CrmV2Td>{r.source ? <EvSourcePill source={r.source} /> : null}</CrmV2Td>
                              {showCheckin && (
                                <CrmV2Td>
                                  {r.checked_in ? (
                                    <CrmV2StatusPill label="Présent" color="#00866f" />
                                  ) : (
                                    <span style={{ color: crmV2.textFaint }}>—</span>
                                  )}
                                </CrmV2Td>
                              )}
                              <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                                {r.created_at ? registrationDate(r.created_at) : null}
                              </CrmV2Td>
                            </CrmV2Tr>
                          ))}
                        </tbody>
                      </CrmV2Table>
                    </div>
                  )}
                </div>
              </EvCard>
            </EvTabPanel>

            {/* ═════════ Staff ═════════ */}
            {showStaffPanel && data.staff_url && (
              <EvTabPanel active={activeTab === 'staff'}>
                <EvCard
                  title={`Équipe staff (${data.staff.length})`}
                  icon={<Users size={16} />}
                  actions={
                    <>
                      <CrmV2Button variant="secondary" size="sm" onClick={() => copy(data.staff_url!)} icon={<Copy size={14} />}>
                        Copier
                      </CrmV2Button>
                      {data.staff.length > 0 && (
                        <CrmV2Button
                          variant="secondary"
                          size="sm"
                          icon={<Download size={14} />}
                          onClick={() => {
                            downloadStaffCsv(ev.name, data.staff)
                            setToast(`${data.staff.length} staff exporté(s)`)
                          }}
                        >
                          Export CSV
                        </CrmV2Button>
                      )}
                    </>
                  }
                  style={{ padding: 0, overflow: 'hidden' }}
                >
                  <div style={{ padding: isMobile ? '0 14px 12px' : '0 18px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.link, wordBreak: 'break-all' }}>
                      <Link2 size={13} style={{ flexShrink: 0 }} />
                      {data.staff_url}
                    </div>
                    {staffDispoCounts.length > 1 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                        {staffDispoCounts.map((c) => {
                          const active = staffDispoFilter === c.key
                          return (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => setStaffDispoFilter(active ? null : c.key)}
                              title={
                                c.key === STAFF_DISPO_ALL || c.key === STAFF_DISPO_NONE
                                  ? undefined
                                  : `${c.onSite} staff sur place ce jour (dont ${c.onSite - c.count} dispo les deux jours)`
                              }
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                justifyContent: 'center',
                                minHeight: 40,
                                padding: '5px 14px',
                                borderRadius: c.key !== STAFF_DISPO_ALL && c.key !== STAFF_DISPO_NONE && c.onSite !== c.count ? 14 : 999,
                                cursor: 'pointer',
                                border: `1px solid ${active ? 'rgba(0,145,174,0.45)' : crmV2.borderStrong}`,
                                background: active ? 'rgba(0,145,174,0.08)' : crmV2.bg,
                                color: active ? crmV2.link : crmV2.text,
                                fontFamily: 'inherit',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.3,
                              }}
                            >
                              <span>
                                <strong style={{ fontSize: 14 }}>{c.count}</strong> {c.label}
                              </span>
                              {c.key !== STAFF_DISPO_ALL && c.key !== STAFF_DISPO_NONE && c.onSite !== c.count ? (
                                <span style={{ fontSize: 10, color: crmV2.textMuted, fontWeight: 500 }}>{c.onSite} sur place au total</span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: `1px solid ${crmV2.border}` }}>
                    {data.staff.length === 0 ? (
                      <CrmV2Empty
                        icon={<Users size={26} />}
                        title="Personne n’a encore postulé. Partagez le lien ci-dessus."
                      />
                    ) : isMobile ? (
                      <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                        {visibleStaff.map((s) => (
                          <div
                            key={s.id}
                            style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.borderLight}`, fontSize: 13 }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                              <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.first_name} {s.last_name}
                              </strong>
                              {s.role ? (
                                <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.goldDark, flexShrink: 0 }}>{s.role}</span>
                              ) : null}
                            </div>
                            {s.note?.startsWith('Dispo') ? (
                              <div style={{ fontSize: 12, fontWeight: 600, color: crmV2.goldDark }}>{s.note}</div>
                            ) : null}
                            <div style={{ display: 'flex', gap: '2px 12px', flexWrap: 'wrap', fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                              {s.email ? (
                                s.email.includes('@') ? (
                                  <a href={`mailto:${s.email}`} style={{ color: crmV2.link, textDecoration: 'none', minHeight: 24, display: 'inline-flex', alignItems: 'center' }}>
                                    {s.email}
                                  </a>
                                ) : (
                                  <span>{s.email}</span>
                                )
                              ) : null}
                              {s.phone ? (
                                <a href={`tel:${s.phone}`} style={{ color: crmV2.link, textDecoration: 'none', minHeight: 24, display: 'inline-flex', alignItems: 'center' }}>
                                  {s.phone}
                                </a>
                              ) : null}
                            </div>
                            {s.created_at ? (
                              <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 2 }}>
                                Postulé le {formatParisDateTime(s.created_at)}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                        <CrmV2Table>
                          <thead>
                            <tr>
                              <CrmV2Th>Nom</CrmV2Th>
                              <CrmV2Th>Rôle</CrmV2Th>
                              <CrmV2Th>Disponibilité</CrmV2Th>
                              <CrmV2Th>E-mail</CrmV2Th>
                              <CrmV2Th>Téléphone</CrmV2Th>
                              <CrmV2Th>Postulé le</CrmV2Th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleStaff.map((s) => (
                              <CrmV2Tr key={s.id}>
                                <CrmV2Td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {s.first_name} {s.last_name}
                                </CrmV2Td>
                                <CrmV2Td>
                                  {s.role ? (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.goldDark }}>{s.role}</span>
                                  ) : null}
                                </CrmV2Td>
                                <CrmV2Td>
                                  {s.note?.startsWith('Dispo') ? (
                                    <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.goldDark }}>{s.note}</span>
                                  ) : null}
                                </CrmV2Td>
                                <CrmV2Td>
                                  {s.email ? (
                                    s.email.includes('@') ? (
                                      <a href={`mailto:${s.email}`} style={{ color: crmV2.link, textDecoration: 'none' }}>
                                        {s.email}
                                      </a>
                                    ) : (
                                      s.email
                                    )
                                  ) : null}
                                </CrmV2Td>
                                <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                                  {s.phone ? (
                                    <a href={`tel:${s.phone}`} style={{ color: crmV2.link, textDecoration: 'none' }}>
                                      {s.phone}
                                    </a>
                                  ) : null}
                                </CrmV2Td>
                                <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                                  {s.created_at ? formatParisDateTime(s.created_at) : null}
                                </CrmV2Td>
                              </CrmV2Tr>
                            ))}
                          </tbody>
                        </CrmV2Table>
                      </div>
                    )}
                  </div>
                </EvCard>
              </EvTabPanel>
            )}

            {/* ═════════ Formulaires CRM + Meta ═════════ */}
            <EvTabPanel active={activeTab === 'formulaires'}>
              <EvCard
                title="Formulaires associés"
                icon={<FileText size={16} />}
                actions={
                  <>
                    <CrmV2Button variant="secondary" onClick={openFormsPicker}>
                      Gérer les formulaires
                    </CrmV2Button>
                    {data.studio_url && (
                      <a href={data.studio_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <CrmV2Button variant="ghost" icon={<ExternalLink size={14} />}>
                          Studio
                        </CrmV2Button>
                      </a>
                    )}
                  </>
                }
              >
                {data.forms.length === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun formulaire lié (CRM ou Meta).</div>
                ) : (
                  <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    {data.forms.map((f, idx) => {
                      const isMeta = f.form_type === 'meta' || String(f.hubspot_form_id).startsWith('meta:')
                      return (
                        <div
                          key={f.hubspot_form_id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            alignItems: 'center',
                            minHeight: 48,
                            padding: '8px 12px',
                            borderTop: idx === 0 ? 'none' : `1px solid ${crmV2.borderLight}`,
                            flexWrap: isMobile ? 'wrap' : 'nowrap',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                              <EvSourcePill source={isMeta ? 'meta' : 'crm'} label={isMeta ? 'Meta Ads' : 'CRM'} />
                              <strong style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.form_name}
                              </strong>
                            </div>
                            {f.public_url && (
                              <div style={{ fontSize: 12, color: crmV2.link, wordBreak: 'break-all', marginTop: 3 }}>{f.public_url}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                            {f.public_url && (
                              <>
                                <CrmV2Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => copy(f.public_url!)}
                                  title="Copier le lien"
                                  aria-label="Copier le lien"
                                  style={{ minWidth: 36, minHeight: 34 }}
                                >
                                  <Copy size={14} />
                                </CrmV2Button>
                                <a href={f.public_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                  <CrmV2Button
                                    variant="secondary"
                                    size="sm"
                                    title="Ouvrir"
                                    aria-label="Ouvrir"
                                    style={{ minWidth: 36, minHeight: 34 }}
                                  >
                                    <ExternalLink size={14} />
                                  </CrmV2Button>
                                </a>
                              </>
                            )}
                            {!isMeta && (
                              <Link href={`/admin/crm/forms/${f.hubspot_form_id}`} style={{ textDecoration: 'none' }}>
                                <CrmV2Button variant="gold" size="sm" style={{ minHeight: 34 }}>
                                  Éditer
                                </CrmV2Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {formsPickerOpen && (
                  <EvSubBlock style={{ marginTop: 14, background: crmV2.bgHover }}>
                    <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Choisir les formulaires</div>
                    <input
                      style={{ ...inputStyle, marginBottom: 12, borderRadius: crmV2.radiusPill, padding: '9px 14px' }}
                      value={formSearch}
                      onChange={(e) => setFormSearch(e.target.value)}
                      placeholder="Rechercher un formulaire…"
                    />
                    {(() => {
                      const q = formSearch.trim().toLowerCase()
                      const filtered = formOptions.filter((f) => !q || f.name.toLowerCase().includes(q))
                      const metaOpts = filtered.filter((f) => f.formType === 'meta')
                      const crmOpts = filtered.filter((f) => f.formType !== 'meta')
                      // Manual metas not in API list
                      const apiMetaIds = new Set(formOptions.filter((f) => f.formType === 'meta').map((f) => f.id))
                      const manualMetas = [...metaFormNames.entries()].filter(([key]) => !apiMetaIds.has(key))
                      const groupTitle: CSSProperties = {
                        fontSize: 11,
                        fontWeight: 700,
                        color: crmV2.textMuted,
                        letterSpacing: '0.4px',
                        textTransform: 'uppercase',
                        marginBottom: 8,
                      }
                      return (
                        <>
                          <div style={groupTitle}>
                            META LEAD ADS — cochez pour lier ({formOptions.filter((f) => f.formType === 'meta').length})
                          </div>
                          <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto', marginBottom: 12 }}>
                            {metaOpts.length === 0 && manualMetas.length === 0 ? (
                              <div style={{ fontSize: 12, color: crmV2.textFaint }}>
                                Aucun formulaire Meta synchronisé. Ajoutez-en un manuellement ci-dessous.
                              </div>
                            ) : (
                              <>
                                {metaOpts.map((f) => metaCheckRow(f.id, f.name, 'meta'))}
                                {manualMetas.map(([key, name]) => metaCheckRow(key, name, 'meta'))}
                              </>
                            )}
                          </div>

                          <div
                            style={{
                              marginBottom: 8,
                              padding: '10px 12px',
                              background: crmV2.bg,
                              border: `1px solid ${crmV2.border}`,
                              borderRadius: 12,
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>
                              Ajouter un formulaire Meta Lead Ads manuellement
                            </div>
                            <div style={{ fontSize: 11, color: crmV2.textMuted, marginBottom: 8 }}>
                              Pour les formulaires Meta pas encore dans la liste (0 soumissions)
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                              <input
                                style={{ ...inputStyle, flex: '1 1 200px', width: 'auto', minWidth: 0 }}
                                value={metaInput}
                                onChange={(e) => setMetaInput(e.target.value)}
                                placeholder="Ex: Lead Ads — Salon octobre"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addMetaForm()
                                  }
                                }}
                              />
                              <CrmV2Button variant="secondary" onClick={addMetaForm}>
                                Ajouter
                              </CrmV2Button>
                            </div>
                          </div>

                          <div style={{ ...groupTitle, margin: '14px 0 8px' }}>FORMULAIRES CRM</div>
                          <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto', marginBottom: 12 }}>
                            {crmOpts.length === 0 ? (
                              <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucun formulaire CRM publié.</div>
                            ) : (
                              crmOpts.map((f) => metaCheckRow(f.id, f.name, 'crm'))
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 8 }}>
                            {selectedFormIds.size} formulaire(s) sélectionné(s)
                          </div>
                        </>
                      )
                    })()}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <CrmV2Button variant="secondary" onClick={() => setFormsPickerOpen(false)}>
                        Fermer
                      </CrmV2Button>
                      <CrmV2Button variant="primary" disabled={busy} onClick={saveForms} icon={<Save size={14} />}>
                        Enregistrer les formulaires
                      </CrmV2Button>
                    </div>
                  </EvSubBlock>
                )}
              </EvCard>
            </EvTabPanel>
          </>
        )}
      </div>
    </CrmV2Page>
  )
}

function evLike(data: Detail | null) {
  return {
    event_type: data?.event?.event_type,
    brand: data?.event?.brand,
    zoom_join_url: data?.event?.zoom_join_url,
  }
}
