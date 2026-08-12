'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, CalendarRange, Copy, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page, CrmV2PillTabs } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  BRAND_CONFIG,
  EVENT_TYPES,
  brandEventTypes,
  eventTypeOf,
  planningPublicUrl,
  type EventBrand,
} from '@/lib/events-studio/config'

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
}

const BRANDS: EventBrand[] = ['diploma', 'medibox', 'edumove']

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

export default function EventsListPage() {
  const [brand, setBrand] = useState<EventBrand>('diploma')
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const planningYear = new Date().getFullYear()
  const planningUrl = planningPublicUrl(planningYear)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events-studio/events?brand=${brand}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur chargement')
      setEvents(data.events || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [brand])

  useEffect(() => {
    load()
  }, [load])

  const types = useMemo(() => brandEventTypes(brand), [brand])

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
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Actualiser
            </CrmV2Button>
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
          ) : events.length === 0 ? (
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
            <div style={{ display: 'grid', gap: 10 }}>
              {events.map((ev) => {
                const type = eventTypeOf(ev)
                const st = statusStyle(ev.status)
                return (
                  <Link
                    key={ev.id}
                    href={`/admin/crm/events/${ev.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <CrmV2Card
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{ev.name}</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: crmV2.radiusPill,
                              background: crmV2.goldSoft,
                              color: crmV2.text,
                            }}
                          >
                            {type.short}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: crmV2.radiusPill,
                              background: st.bg,
                              color: st.color,
                            }}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: crmV2.textMuted }}>
                          {formatWhen(ev.event_date, ev.event_time_end)}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: crmV2.link, flexShrink: 0 }}>Ouvrir →</span>
                    </CrmV2Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </CrmV2Page>
    </div>
  )
}
