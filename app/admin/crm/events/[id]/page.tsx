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

type CrmFormOption = { id: string; slug: string; name: string; status: string }

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
  const [crmFormOptions, setCrmFormOptions] = useState<CrmFormOption[]>([])
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
      setTypeEdit(currentTypeId(json.event || {}))
      setSmsDraft({ ...(json.event?.custom_sms || {}) })
      setEmailDraft({ ...(json.event?.custom_emails || {}) })

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
      const custom_sms: Record<string, string> = {}
      for (const [k, v] of Object.entries(smsDraft)) {
        if (v?.trim()) custom_sms[k] = v.trim()
      }
      const custom_emails: Record<string, EmailValue> = {}
      for (const [k, v] of Object.entries(emailDraft)) {
        if (v && (v.subject?.trim() || v.body?.trim())) {
          custom_emails[k] = { subject: v.subject?.trim() || '', body: v.body?.trim() || '' }
        }
      }
      const res = await fetch(`/api/events-studio/events/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_sms, custom_emails }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
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
    try {
      const res = await fetch('/api/events-studio/crm-forms', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setCrmFormOptions(json.forms || [])
    } catch {
      /* ignore */
    }
  }

  function toggleCrmForm(formId: string) {
    setSelectedFormIds((prev) => {
      const next = new Set(prev)
      if (next.has(formId)) next.delete(formId)
      else next.add(formId)
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
        const opt = crmFormOptions.find((f) => f.id === formId)
        const existing = data?.forms.find((f) => f.hubspot_form_id === formId)
        forms.push({
          hubspot_form_id: formId,
          form_name: opt?.name || existing?.form_name || formId,
          form_type: 'crm',
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
                  <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 8 }}>Formulaires CRM</div>
                  <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto', marginBottom: 12 }}>
                    {crmFormOptions.length === 0 ? (
                      <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucun formulaire CRM publié.</div>
                    ) : (
                      crmFormOptions.map((f) => (
                        <label
                          key={f.id}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFormIds.has(f.id)}
                            onChange={() => toggleCrmForm(f.id)}
                          />
                          {f.name}
                        </label>
                      ))
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 8 }}>Formulaire Meta Ads (nom)</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      style={inputStyle}
                      value={metaInput}
                      onChange={(e) => setMetaInput(e.target.value)}
                      placeholder="Ex: Lead Ads — Salon octobre"
                    />
                    <CrmV2Button variant="secondary" onClick={addMetaForm}>
                      Ajouter
                    </CrmV2Button>
                  </div>
                  {[...metaFormNames.entries()].map(([key, name]) => (
                    <div key={key} style={{ fontSize: 12, marginBottom: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#1d4ed8', fontWeight: 600 }}>Meta</span> {name}
                      <button
                        type="button"
                        onClick={() => {
                          setMetaFormNames((prev) => {
                            const n = new Map(prev)
                            n.delete(key)
                            return n
                          })
                          setSelectedFormIds((prev) => {
                            const n = new Set(prev)
                            n.delete(key)
                            return n
                          })
                        }}
                        style={{ border: 'none', background: 'transparent', color: crmV2.danger, cursor: 'pointer' }}
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
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
                      value={emailDraft[emailStep]?.subject || ''}
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
                      value={emailDraft[emailStep]?.body || ''}
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
                      value={smsDraft[smsStep] || ''}
                      onChange={(e) => setSmsDraft((prev) => ({ ...prev, [smsStep]: e.target.value }))}
                      placeholder="Texte SMS (utilisez {prenom} pour personnaliser)"
                    />
                    <div style={{ marginTop: 6, fontSize: 11, color: crmV2.textFaint }}>
                      {(smsDraft[smsStep] || '').length} caractères
                    </div>
                  </>
                )}

                <div style={{ marginTop: 12 }}>
                  <CrmV2Button variant="gold" disabled={busy} onClick={saveComms}>
                    <Save size={14} /> Enregistrer les communications
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
