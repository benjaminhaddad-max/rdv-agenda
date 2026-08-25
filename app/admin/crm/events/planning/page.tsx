'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarRange, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { planningPublicUrl } from '@/lib/events-studio/config'

type PlanningEvent = {
  id: string
  name: string
  event_date: string
  event_time_end: string | null
  location: string | null
  status: string
  staff_count: number
  staff_needed?: number | null
  staff_remaining?: number | null
  staff_full?: boolean
  pay_label?: string | null
  type: { id: string; short: string; label: string }
}

export default function EventsPlanningPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [typeFilter, setTypeFilter] = useState('')
  const [events, setEvents] = useState<PlanningEvent[]>([])
  const [publicUrl, setPublicUrl] = useState(planningPublicUrl(thisYear))
  const [totals, setTotals] = useState({ events: 0, jpo: 0, salon: 0, staff: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ year: String(year) })
      if (typeFilter) qs.set('type', typeFilter)
      const res = await fetch(`/api/events-studio/planning?${qs}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setEvents(data.events || [])
      setPublicUrl(data.public_url || planningPublicUrl(year))
      setTotals(data.totals || { events: 0, jpo: 0, salon: 0, staff: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [year, typeFilter])

  useEffect(() => {
    load()
  }, [load])

  const byMonth = useMemo(() => {
    const map: Record<string, PlanningEvent[]> = {}
    for (const e of events) {
      const d = new Date(e.event_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return Object.keys(map)
      .sort()
      .map((key) => {
        const [y, m] = key.split('-')
        const label = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleDateString('fr-FR', {
          month: 'long',
          year: 'numeric',
        })
        return { key, label, events: map[key] }
      })
  }, [events])

  function copyLink() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setToast('Lien public copié')
      setTimeout(() => setToast(null), 2000)
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft }}>
      <MarketingNav title="Planning Diploma" />
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
          <ArrowLeft size={14} /> Retour aux événements
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalendarRange size={20} color={crmV2.gold} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Planning Diploma Santé</h1>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: crmV2.textMuted }}>
              JPO et salons de l’année — partagez le lien public pour que les équipes s’inscrivent.
            </p>
          </div>
          <CrmV2Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </CrmV2Button>
        </div>

        {toast && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: crmV2.radius,
              background: crmV2.goldSoft,
              fontSize: 13,
            }}
          >
            {toast}
          </div>
        )}

        <CrmV2Card style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Lien d’inscription public</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: crmV2.textMuted }}>
            Les collaborateurs choisissent les JPO / salons auxquels ils souhaitent participer.
          </p>
          <div
            style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: crmV2.link,
              wordBreak: 'break-all',
              padding: '10px 12px',
              background: crmV2.bgSoft,
              borderRadius: crmV2.radius,
              border: `1px solid ${crmV2.border}`,
              marginBottom: 12,
            }}
          >
            {publicUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 600 }}>Année</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              style={{
                padding: '8px 12px',
                borderRadius: crmV2.radiusPill,
                border: `1px solid ${crmV2.borderStrong}`,
                background: crmV2.bg,
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: crmV2.radiusPill,
                border: `1px solid ${crmV2.borderStrong}`,
                background: crmV2.bg,
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              <option value="">JPO + Salons</option>
              <option value="jpo">JPO uniquement</option>
              <option value="salon">Salons uniquement</option>
            </select>
            <CrmV2Button variant="gold" onClick={copyLink}>
              <Copy size={14} /> Copier le lien
            </CrmV2Button>
            <a href={publicUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="secondary">
                <ExternalLink size={14} /> Ouvrir
              </CrmV2Button>
            </a>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: crmV2.textMuted }}>
            <span>
              <strong style={{ color: crmV2.text }}>{totals.events}</strong> événements
            </span>
            <span>
              <strong style={{ color: crmV2.text }}>{totals.jpo}</strong> JPO
            </span>
            <span>
              <strong style={{ color: crmV2.text }}>{totals.salon}</strong> salons
            </span>
            <span>
              <strong style={{ color: crmV2.text }}>{totals.staff}</strong> inscriptions staff
            </span>
          </div>
        </CrmV2Card>

        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: crmV2.radius,
              background: crmV2.dangerSoft,
              color: crmV2.danger,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>
        ) : events.length === 0 ? (
          <CrmV2Card style={{ padding: 28, textAlign: 'center' }}>
            <p style={{ margin: 0, color: crmV2.textMuted, fontSize: 14 }}>
              Aucun JPO / salon Diploma planifié pour {year}.
            </p>
            <div style={{ marginTop: 14 }}>
              <Link href="/admin/crm/events/new?brand=diploma" style={{ textDecoration: 'none' }}>
                <CrmV2Button variant="gold">Créer un événement</CrmV2Button>
              </Link>
            </div>
          </CrmV2Card>
        ) : (
          <div style={{ display: 'grid', gap: 22 }}>
            {byMonth.map((month) => (
              <section key={month.key}>
                <h2
                  style={{
                    margin: '0 0 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: crmV2.textFaint,
                  }}
                >
                  {month.label}
                </h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {month.events.map((e) => {
                    const d = new Date(e.event_date)
                    const day = d.toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Europe/Paris',
                    })
                    const time = d.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Paris',
                    })
                    return (
                      <Link key={e.id} href={`/admin/crm/events/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <CrmV2Card
                          style={{
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ width: 72, textAlign: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: 11, color: crmV2.textFaint, textTransform: 'uppercase' }}>
                              {day.split(' ')[0]}
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{day.split(' ').slice(1).join(' ')}</div>
                          </div>
                          <div
                            style={{
                              width: 3,
                              alignSelf: 'stretch',
                              borderRadius: 99,
                              background: e.type.id === 'salon' ? '#7C3AED' : crmV2.gold,
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: crmV2.radiusPill,
                                  background: crmV2.goldSoft,
                                }}
                              >
                                {e.type.short}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: crmV2.radiusPill,
                                  background: e.status === 'published' ? 'rgba(0,189,165,0.12)' : crmV2.bgMuted,
                                  color: e.status === 'published' ? crmV2.success : crmV2.textMuted,
                                }}
                              >
                                {e.status === 'published' ? 'Publié' : 'Brouillon'}
                              </span>
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                              {time}
                              {e.event_time_end ? ` – ${e.event_time_end}` : ''}
                              {e.location ? ` · ${e.location}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>
                              {e.staff_count}
                              {e.staff_needed != null ? (
                                <span style={{ fontSize: 14, fontWeight: 500, color: crmV2.textMuted }}>
                                  /{e.staff_needed}
                                </span>
                              ) : null}
                            </div>
                            <div style={{ fontSize: 10, color: crmV2.textFaint, textTransform: 'uppercase' }}>
                              {e.staff_full
                                ? 'Complet'
                                : e.staff_remaining != null
                                  ? `${e.staff_remaining} rest.`
                                  : 'staff'}
                            </div>
                            {e.pay_label ? (
                              <div style={{ fontSize: 10, color: crmV2.textMuted, marginTop: 2 }}>{e.pay_label}</div>
                            ) : null}
                          </div>
                        </CrmV2Card>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </CrmV2Page>
    </div>
  )
}
