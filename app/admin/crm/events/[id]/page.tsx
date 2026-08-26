'use client'

import { use, useCallback, useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  EyeOff,
  Rocket,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  BRAND_CONFIG,
  EVENT_TYPES,
  eventTypeOf,
  type EventBrand,
  type EventTypeId,
} from '@/lib/events-studio/config'

const EDITABLE_TYPES: EventTypeId[] = ['salon', 'jpo', 'webinaire']

function currentTypeId(ev: { event_type?: string | null; brand?: string | null; zoom_join_url?: string | null }): EventTypeId {
  const id = eventTypeOf(ev).id
  if (id === 'jpo' || id === 'salon' || id === 'webinaire') return id
  return 'salon'
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
  }
  forms: Array<{
    id: string
    hubspot_form_id: string
    form_name: string
    form_type: string
    slug: string | null
    public_url: string | null
  }>
  registrations: Array<{
    id: string
    first_name: string
    last_name: string
    email: string
    created_at: string
  }>
  staff: Array<{ id: string; first_name: string; last_name: string; email: string }>
  type: { short: string; label: string; staff: boolean; comms: boolean }
  staff_url: string | null
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

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
  const crmForm = data?.forms?.find((f) => f.form_type === 'crm' || f.public_url)
  const cap = data?.capacity
  const typeOptions = EDITABLE_TYPES
  const showStaffEdit = EVENT_TYPES[typeEdit].staff
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
      <CrmV2Page style={{ padding: '20px 28px 48px', maxWidth: 960, margin: '0 auto' }}>
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
                  {cap?.is_full && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: crmV2.radiusPill,
                        background: crmV2.dangerSoft,
                        color: crmV2.danger,
                      }}
                    >
                      Complet
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: crmV2.textMuted }}>
                  {BRAND_CONFIG[brand]?.name || brand} ·{' '}
                  {new Date(ev.event_date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                  {ev.event_time_end ? ` – ${ev.event_time_end}` : ''}
                  {ev.location ? ` · ${ev.location}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {typeEdit !== currentTypeId(ev) && (
                  <CrmV2Button variant="gold" disabled={busy} onClick={savePlaces}>
                    <Save size={14} /> Enregistrer le type
                  </CrmV2Button>
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

            {!EVENT_TYPES[typeEdit].comms && (
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
                {EVENT_TYPES[typeEdit].label} — collecte CRM uniquement, aucune communication email/SMS à
                la publication.
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
                  <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
                    Type
                  </label>
                  <select
                    style={inputStyle}
                    value={typeEdit}
                    onChange={(e) => setTypeEdit(e.target.value as EventTypeId)}
                  >
                    {typeOptions.map((t) => (
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
                    placeholder="Ex: Paris Expo Porte de Versailles, Pav. 7.2"
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
                  {data.staff_needed != null
                    ? ` · Staff : ${data.staff?.length || 0}/${data.staff_needed}${
                        data.staff_remaining != null ? ` · ${data.staff_remaining} rest.` : ''
                      }`
                    : ''}
                </div>
                <CrmV2Button variant="gold" disabled={busy} onClick={savePlaces}>
                  <Save size={14} /> Enregistrer
                </CrmV2Button>
              </div>
            </CrmV2Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <CrmV2Card style={{ padding: 18 }}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>Formulaire CRM</div>
                {crmForm?.public_url ? (
                  <>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>{crmForm.form_name}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: crmV2.link,
                        wordBreak: 'break-all',
                        marginBottom: 12,
                      }}
                    >
                      {crmForm.public_url}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <CrmV2Button variant="secondary" onClick={() => copy(crmForm.public_url!)}>
                        <Copy size={14} /> Copier le lien
                      </CrmV2Button>
                      <a href={crmForm.public_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <CrmV2Button variant="ghost">
                          <ExternalLink size={14} /> Ouvrir
                        </CrmV2Button>
                      </a>
                      <Link href={`/admin/crm/forms/${crmForm.hubspot_form_id}`} style={{ textDecoration: 'none' }}>
                        <CrmV2Button variant="gold">Éditer le formulaire</CrmV2Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun formulaire CRM lié.</div>
                )}
              </CrmV2Card>

              <CrmV2Card style={{ padding: 18 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={16} /> Inscriptions (
                  {cap?.registered_count ?? data.registrations.length})
                </div>
                {data.registrations.length === 0 && (cap?.registered_count || 0) === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas encore d’inscrits.</div>
                ) : data.registrations.length === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>
                    {cap?.registered_count} inscription(s) via le formulaire CRM.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
                    {data.registrations.slice(0, 30).map((r) => (
                      <div
                        key={r.id}
                        style={{ fontSize: 13, borderBottom: `1px solid ${crmV2.border}`, paddingBottom: 6 }}
                      >
                        <strong>
                          {r.first_name} {r.last_name}
                        </strong>
                        <div style={{ fontSize: 11, color: crmV2.textFaint }}>{r.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CrmV2Card>
            </div>

            {data.type.staff && data.staff_url && (
              <CrmV2Card style={{ padding: 18, marginTop: 14 }}>
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
            )}

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
