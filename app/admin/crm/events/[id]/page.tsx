'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  EyeOff,
  Rocket,
  Trash2,
  Users,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { BRAND_CONFIG, type EventBrand } from '@/lib/events-studio/config'

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
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events-studio/events/${id}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setData(json)
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{ev.name}</h1>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: crmV2.radiusPill,
                      background: crmV2.goldSoft,
                    }}
                  >
                    {data.type.short}
                  </span>
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
                  {BRAND_CONFIG[brand]?.name || brand} ·{' '}
                  {new Date(ev.event_date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                  {ev.event_time_end ? ` – ${ev.event_time_end}` : ''}
                  {ev.location ? ` · ${ev.location}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

            {!data.type.comms && (
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
                Salon — collecte CRM uniquement, aucune communication email/SMS à la publication.
              </div>
            )}

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
                  <Users size={16} /> Inscriptions ({data.registrations.length})
                </div>
                {data.registrations.length === 0 ? (
                  <div style={{ fontSize: 13, color: crmV2.textMuted }}>Pas encore d’inscrits.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
                    {data.registrations.slice(0, 30).map((r) => (
                      <div key={r.id} style={{ fontSize: 13, borderBottom: `1px solid ${crmV2.border}`, paddingBottom: 6 }}>
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
