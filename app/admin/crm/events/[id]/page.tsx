'use client'

import { use, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  EyeOff,
  Mail,
  QrCode,
  Rocket,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { defaultEmailBody, defaultEmailSubject, defaultSmsBody, mergeCommsWithDefaults } from '@/lib/events-studio/comms-defaults'
import { emailStepsFor, smsStepsFor } from '@/lib/events-studio/comms-steps'
import { BRAND_CONFIG, EVENT_TYPES, eventTypeOf, type EventBrand, type EventTypeId } from '@/lib/events-studio/config'
import { formatEventSchedule } from '@/lib/events-studio/event-meta'

const EDITABLE_TYPES: EventTypeId[] = ['salon', 'jpo', 'webinaire']

function currentTypeId(ev: { event_type?: string | null; brand?: string | null; zoom_join_url?: string | null }): EventTypeId {
  const id = eventTypeOf(ev).id
  if (id === 'jpo' || id === 'salon' || id === 'webinaire') return id
  return 'salon'
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
  }
  forms: FormRow[]
  registrations: Array<{
    id: string
    first_name: string
    last_name: string
    email: string
    created_at: string
    checked_in?: boolean | null
    qr_code?: string | null
  }>
  staff: Array<{ id: string; first_name: string; last_name: string; email: string }>
  type: { short: string; label: string; staff: boolean; comms: boolean; checkin: boolean }
  staff_url: string | null
  studio_url?: string | null
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
  const [typeEdit, setTypeEdit] = useState<EventTypeId>('salon')

  const [smsDraft, setSmsDraft] = useState<Record<string, string>>({})
  const [emailDraft, setEmailDraft] = useState<Record<string, EmailValue>>({})
  const [commsTab, setCommsTab] = useState<'sms' | 'email'>('email')
  const [emailStep, setEmailStep] = useState('confirmation')
  const [smsStep, setSmsStep] = useState('confirmation')

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
    (emailDraft[emailStep]?.subject || '').trim() ||
    (evForDefaults ? defaultEmailSubject(evForDefaults, emailStep) : '')
  const emailBodyValue =
    (emailDraft[emailStep]?.body || '').trim() ||
    (evForDefaults ? defaultEmailBody(evForDefaults, emailStep) : '')
  const smsValue =
    (smsDraft[smsStep] || '').trim() || (evForDefaults ? defaultSmsBody(evForDefaults, smsStep) : '')

  async function setStatus(status: 'published' | 'draft') {
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
      setToast(status === 'published' ? 'Événement publié' : 'Repassé en brouillon')
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function savePlaces() {
    setBusy(true)
    try {
      const typeCfg = EVENT_TYPES[typeEdit]
      const body: Record<string, unknown> = {
        event_type: typeEdit,
        location: locationEdit,
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
      setToast('Type, lieu, places et staff enregistrés')
      await load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function saveComms() {
    setBusy(true)
    try {
      const base = evForDefaults || { event_type: typeEdit }
      const merged = mergeCommsWithDefaults(base, emailDraft, smsDraft)
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_sms: merged.sms, custom_emails: merged.emails }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setEmailDraft(merged.emails)
      setSmsDraft(merged.sms)
      setToast('Communications enregistrées')
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
  const showCheckin = typeCfg.checkin
  const cap = data?.capacity
  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: crmV2.radius,
    border: `1px solid ${crmV2.border}`,
    fontSize: 13,
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft }}>
      <MarketingNav title="Événement" />
      <CrmV2Page style={{ padding: '20px 28px 48px', maxWidth: 980, margin: '0 auto' }}>
        <Link
          href="/admin/crm/events"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: crmV2.link,
            textDecoration: 'none',
            marginBottom: 14,
          }}
        >
          <ArrowLeft size={14} /> Liste des événements
        </Link>

        {toast && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: crmV2.radius,
              background: crmV2.goldSoft,
              color: crmV2.text,
              fontSize: 13,
            }}
          >
            {toast}
          </div>
        )}

        {loading && <div style={{ color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>}
        {error && (
          <div style={{ padding: 12, borderRadius: crmV2.radius, background: crmV2.dangerSoft, color: crmV2.danger }}>
            {error}
          </div>
        )}

        {ev && data && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{ev.name}</h1>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 600 }}>Type</span>
                    <select
                      value={typeEdit}
                      disabled={busy}
                      onChange={(e) => setTypeEdit(e.target.value as EventTypeId)}
                      style={{
                        ...inputStyle,
                        width: 'auto',
                        minWidth: 160,
                        padding: '6px 10px',
                        fontWeight: 600,
                        fontSize: 13,
                        background: crmV2.goldSoft,
                        border: `1px solid ${crmV2.goldBorder}`,
                        cursor: 'pointer',
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
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: crmV2.radiusPill,
                      background: ev.status === 'published' ? 'rgba(0,189,165,0.12)' : crmV2.bgMuted,
                      color: ev.status === 'published' ? crmV2.success : crmV2.textMuted,
                    }}
                  >
                    {ev.status === 'published' ? 'Publié' : 'Brouillon'}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: crmV2.textMuted }}>
                  {BRAND_CONFIG[brand]?.name || brand} · {formatEventSchedule(ev)}
                  {ev.location ? ` · ${ev.location}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {typeEdit !== currentTypeId(ev) && (
                  <CrmV2Button variant="gold" disabled={busy} onClick={savePlaces}>
                    <Save size={14} /> Enregistrer le type
                  </CrmV2Button>
                )}
                {showCheckin && data.scanner_url && (
                  <a href={data.scanner_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <CrmV2Button variant="secondary">
                      <QrCode size={14} /> Scanner QR
                    </CrmV2Button>
                  </a>
                )}
                {ev.status !== 'published' ? (
                  <CrmV2Button variant="gold" disabled={busy} onClick={() => setStatus('published')}>
                    <Rocket size={14} /> Publier
                  </CrmV2Button>
                ) : (
                  <CrmV2Button variant="secondary" disabled={busy} onClick={() => setStatus('draft')}>
                    <EyeOff size={14} /> Dépublier
                  </CrmV2Button>
                )}
                <CrmV2Button variant="secondary" disabled={busy} onClick={remove} style={{ color: crmV2.danger }}>
                  <Trash2 size={14} /> Supprimer
                </CrmV2Button>
              </div>
            </div>

            {!showComms && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '10px 14px',
                  borderRadius: crmV2.radius,
                  background: crmV2.goldSoft,
                  border: `1px solid ${crmV2.goldBorder}`,
                  fontSize: 13,
                  color: crmV2.text,
                }}
              >
                {typeCfg.label} — collecte CRM uniquement, aucune communication email/SMS à la publication.
              </div>
            )}

            <CrmV2Card style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Type, lieu, places leads & staff</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: showStaffEdit ? '160px 1fr 140px 140px' : '160px 1fr 140px',
                  gap: 12,
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Type</label>
                  <select style={inputStyle} value={typeEdit} onChange={(e) => setTypeEdit(e.target.value as EventTypeId)}>
                    {EDITABLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {EVENT_TYPES[t].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                    Adresse / lieu
                  </label>
                  <input
                    style={inputStyle}
                    value={locationEdit}
                    onChange={(e) => setLocationEdit(e.target.value)}
                    placeholder="Ex: Paris Expo Porte de Versailles"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                    Places leads
                  </label>
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
                    <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                      Staff nécessaires
                    </label>
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
                  marginTop: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                  {cap
                    ? `Leads : ${cap.registered_count}${
                        cap.max_capacity != null
                          ? ` / ${cap.max_capacity} · ${cap.remaining ?? 0} restante(s)`
                          : ' · illimité'
                      }`
                    : 'Places leads optionnelles.'}
                </div>
                <CrmV2Button variant="gold" disabled={busy} onClick={savePlaces}>
                  <Save size={14} /> Enregistrer
                </CrmV2Button>
              </div>
            </CrmV2Card>

            {/* ——— Formulaires CRM + Meta ——— */}
            <CrmV2Card style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>Formulaires associés</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <CrmV2Button variant="secondary" onClick={openFormsPicker}>
                    Gérer les formulaires
                  </CrmV2Button>
                  {data.studio_url && (
                    <a href={data.studio_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <CrmV2Button variant="ghost">
                        <ExternalLink size={14} /> Studio
                      </CrmV2Button>
                    </a>
                  )}
                </div>
              </div>

              {data.forms.length === 0 ? (
                <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun formulaire lié (CRM ou Meta).</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.forms.map((f) => {
                    const isMeta = f.form_type === 'meta' || String(f.hubspot_form_id).startsWith('meta:')
                    return (
                      <div
                        key={f.hubspot_form_id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: crmV2.radius,
                          border: `1px solid ${crmV2.border}`,
                          background: crmV2.bg,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 7px',
                                borderRadius: crmV2.radiusPill,
                                background: isMeta ? 'rgba(37,99,235,0.12)' : crmV2.goldSoft,
                                color: isMeta ? '#1d4ed8' : crmV2.text,
                              }}
                            >
                              {isMeta ? 'Meta Ads' : 'CRM'}
                            </span>
                            <strong style={{ fontSize: 13 }}>{f.form_name}</strong>
                          </div>
                          {f.public_url && (
                            <div style={{ fontSize: 12, color: crmV2.link, wordBreak: 'break-all' }}>{f.public_url}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {f.public_url && (
                            <>
                              <CrmV2Button variant="secondary" onClick={() => copy(f.public_url!)}>
                                <Copy size={14} />
                              </CrmV2Button>
                              <a href={f.public_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                <CrmV2Button variant="ghost">
                                  <ExternalLink size={14} />
                                </CrmV2Button>
                              </a>
                            </>
                          )}
                          {!isMeta && (
                            <Link href={`/admin/crm/forms/${f.hubspot_form_id}`} style={{ textDecoration: 'none' }}>
                              <CrmV2Button variant="gold">Éditer</CrmV2Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {formsPickerOpen && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: crmV2.radius,
                    border: `1px solid ${crmV2.border}`,
                    background: crmV2.bgSoft,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Choisir les formulaires</div>
                  <input
                    style={{ ...inputStyle, marginBottom: 12 }}
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
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', letterSpacing: '0.04em', marginBottom: 6 }}>
                          META LEAD ADS — cochez pour lier ({formOptions.filter((f) => f.formType === 'meta').length})
                        </div>
                        <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflow: 'auto', marginBottom: 12 }}>
                          {metaOpts.length === 0 && manualMetas.length === 0 ? (
                            <div style={{ fontSize: 12, color: crmV2.textFaint }}>
                              Aucun formulaire Meta synchronisé. Ajoutez-en un manuellement ci-dessous.
                            </div>
                          ) : (
                            <>
                              {metaOpts.map((f) => (
                                <label
                                  key={f.id}
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    borderLeft: '2px solid #60a5fa',
                                    paddingLeft: 8,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedFormIds.has(f.id)}
                                    onChange={() => toggleForm(f.id, 'meta', f.name)}
                                  />
                                  <span style={{ flex: 1 }}>{f.name}</span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      background: 'rgba(37,99,235,0.12)',
                                      color: '#1d4ed8',
                                      borderRadius: 999,
                                      padding: '2px 8px',
                                    }}
                                  >
                                    Meta
                                  </span>
                                </label>
                              ))}
                              {manualMetas.map(([key, name]) => (
                                <label
                                  key={key}
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    borderLeft: '2px solid #60a5fa',
                                    paddingLeft: 8,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedFormIds.has(key)}
                                    onChange={() => toggleForm(key, 'meta', name)}
                                  />
                                  <span style={{ flex: 1 }}>{name}</span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      background: 'rgba(37,99,235,0.12)',
                                      color: '#1d4ed8',
                                      borderRadius: 999,
                                      padding: '2px 8px',
                                    }}
                                  >
                                    Meta
                                  </span>
                                </label>
                              ))}
                            </>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: '#1d4ed8',
                            marginBottom: 8,
                            padding: '8px 10px',
                            background: 'rgba(37,99,235,0.06)',
                            borderRadius: crmV2.radius,
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>Ajouter un formulaire Meta Lead Ads manuellement</div>
                          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>
                            Pour les formulaires Meta pas encore dans la liste (0 soumissions)
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              style={inputStyle}
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

                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#4338ca',
                            letterSpacing: '0.04em',
                            margin: '12px 0 6px',
                          }}
                        >
                          FORMULAIRES CRM
                        </div>
                        <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflow: 'auto', marginBottom: 12 }}>
                          {crmOpts.length === 0 ? (
                            <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucun formulaire CRM publié.</div>
                          ) : (
                            crmOpts.map((f) => (
                              <label
                                key={f.id}
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  alignItems: 'center',
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  borderLeft: '2px solid #a5b4fc',
                                  paddingLeft: 8,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedFormIds.has(f.id)}
                                  onChange={() => toggleForm(f.id, 'crm', f.name)}
                                />
                                <span style={{ flex: 1 }}>{f.name}</span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    background: 'rgba(67,56,202,0.1)',
                                    color: '#4338ca',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                  }}
                                >
                                  CRM
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 8 }}>
                          {selectedFormIds.size} formulaire(s) sélectionné(s)
                        </div>
                      </>
                    )
                  })()}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <CrmV2Button variant="gold" disabled={busy} onClick={saveForms}>
                      <Save size={14} /> Enregistrer les formulaires
                    </CrmV2Button>
                    <CrmV2Button variant="ghost" onClick={() => setFormsPickerOpen(false)}>
                      Fermer
                    </CrmV2Button>
                  </div>
                </div>
              )}
            </CrmV2Card>

            {/* ——— Communications email / SMS ——— */}
            {showComms && (
              <CrmV2Card style={{ padding: 18, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={16} /> Communications (email & SMS)
                  </div>
                  {data.studio_url && (
                    <a href={data.studio_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <CrmV2Button variant="ghost">
                        <ExternalLink size={14} /> Prévisualisation HTML Studio
                      </CrmV2Button>
                    </a>
                  )}
                </div>
                {ev.brief && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '10px 12px',
                      borderRadius: crmV2.radius,
                      background: crmV2.bgSoft,
                      fontSize: 13,
                      color: crmV2.textMuted,
                    }}
                  >
                    <strong style={{ color: crmV2.text }}>Brief : </strong>
                    {ev.brief}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <CrmV2Button variant={commsTab === 'email' ? 'gold' : 'secondary'} onClick={() => setCommsTab('email')}>
                    Emails
                  </CrmV2Button>
                  <CrmV2Button variant={commsTab === 'sms' ? 'gold' : 'secondary'} onClick={() => setCommsTab('sms')}>
                    SMS
                  </CrmV2Button>
                </div>

                {commsTab === 'email' ? (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {emailSteps.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEmailStep(s.id)}
                          style={{
                            border: `1px solid ${emailStep === s.id ? crmV2.goldBorder : crmV2.border}`,
                            background: emailStep === s.id ? crmV2.goldSoft : crmV2.bg,
                            borderRadius: crmV2.radiusPill,
                            padding: '5px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                      Objet
                    </label>
                    <input
                      style={{ ...inputStyle, marginBottom: 8 }}
                      value={emailSubjectValue}
                      onChange={(e) =>
                        setEmailDraft((prev) => ({
                          ...prev,
                          [emailStep]: { ...prev[emailStep], subject: e.target.value },
                        }))
                      }
                      placeholder="Objet de l'email"
                    />
                    <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                      Corps (texte)
                    </label>
                    <textarea
                      style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
                      value={emailBodyValue}
                      onChange={(e) =>
                        setEmailDraft((prev) => ({
                          ...prev,
                          [emailStep]: { ...prev[emailStep], body: e.target.value },
                        }))
                      }
                      placeholder="Contenu de l'email…"
                    />
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {smsSteps.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSmsStep(s.id)}
                          style={{
                            border: `1px solid ${smsStep === s.id ? crmV2.goldBorder : crmV2.border}`,
                            background: smsStep === s.id ? crmV2.goldSoft : crmV2.bg,
                            borderRadius: crmV2.radiusPill,
                            padding: '5px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                      value={smsValue}
                      onChange={(e) => setSmsDraft((prev) => ({ ...prev, [smsStep]: e.target.value }))}
                      placeholder="Texte SMS (utilisez {prenom} pour personnaliser)"
                    />
                    <div style={{ marginTop: 6, fontSize: 11, color: crmV2.textFaint }}>
                      {smsValue.length} caractères
                    </div>
                  </>
                )}

                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <CrmV2Button variant="gold" disabled={busy} onClick={saveComms}>
                    <Save size={14} /> Enregistrer les communications
                  </CrmV2Button>
                  <CrmV2Button variant="secondary" disabled={busy} onClick={regenerateComms}>
                    Régénérer les textes
                  </CrmV2Button>
                </div>
              </CrmV2Card>
            )}

            {/* ——— Scan QR / check-in ——— */}
            {showCheckin && (
              <CrmV2Card style={{ padding: 18, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <QrCode size={16} /> Scan QR & présence
                  </div>
                  {data.scanner_url && (
                    <a href={data.scanner_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <CrmV2Button variant="gold">
                        <QrCode size={14} /> Ouvrir le scanner
                      </CrmV2Button>
                    </a>
                  )}
                </div>
                {data.checkin_stats ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[
                      ['Inscrits', data.checkin_stats.registered],
                      ['Présents', data.checkin_stats.present],
                      ['Absents', data.checkin_stats.absent],
                      ['Taux', `${data.checkin_stats.rate}%`],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        style={{
                          padding: 12,
                          borderRadius: crmV2.radius,
                          background: crmV2.bgSoft,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                        <div style={{ fontSize: 11, color: crmV2.textMuted }}>{label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas encore de données de présence.</div>
                )}
              </CrmV2Card>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <CrmV2Card style={{ padding: 18 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={16} /> Inscriptions ({cap?.registered_count ?? data.registrations.length})
                </div>
                {data.registrations.length === 0 && (cap?.registered_count || 0) === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas encore d’inscrits.</div>
                ) : data.registrations.length === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>
                    {cap?.registered_count} inscription(s) via le formulaire CRM.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                    {data.registrations.slice(0, 40).map((r) => (
                      <div
                        key={r.id}
                        style={{ fontSize: 13, borderBottom: `1px solid ${crmV2.border}`, paddingBottom: 6 }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong>
                            {r.first_name} {r.last_name}
                          </strong>
                          {showCheckin && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: r.checked_in ? crmV2.success : crmV2.textFaint,
                              }}
                            >
                              {r.checked_in ? 'Présent' : '—'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: crmV2.textFaint }}>{r.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CrmV2Card>

              {data.type.staff && data.staff_url ? (
                <CrmV2Card style={{ padding: 18 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Lien staff</div>
                  <div style={{ fontSize: 12, color: crmV2.link, wordBreak: 'break-all', marginBottom: 10 }}>
                    {data.staff_url}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <CrmV2Button variant="secondary" onClick={() => copy(data.staff_url!)}>
                      <Copy size={14} /> Copier
                    </CrmV2Button>
                    <span style={{ fontSize: 12, color: crmV2.textMuted }}>
                      {data.staff.length} inscription(s) staff
                    </span>
                  </div>
                </CrmV2Card>
              ) : (
                <CrmV2Card style={{ padding: 18 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Zoom / visio</div>
                  {ev.zoom_join_url ? (
                    <div style={{ fontSize: 12, color: crmV2.link, wordBreak: 'break-all' }}>{ev.zoom_join_url}</div>
                  ) : (
                    <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas de lien Zoom renseigné.</div>
                  )}
                </CrmV2Card>
              )}
            </div>

            {ev.description && (
              <CrmV2Card style={{ padding: 18, marginTop: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Description</div>
                <p style={{ margin: 0, fontSize: 13, color: crmV2.textMuted, whiteSpace: 'pre-wrap' }}>
                  {ev.description}
                </p>
              </CrmV2Card>
            )}
          </>
        )}
      </CrmV2Page>
    </div>
  )
}

function evLike(data: Detail | null) {
  return {
    event_type: data?.event?.event_type,
    brand: data?.event?.brand,
    zoom_join_url: data?.event?.zoom_join_url,
  }
}
