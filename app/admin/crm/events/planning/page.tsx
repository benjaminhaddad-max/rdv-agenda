'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, CalendarRange, Copy, ExternalLink, RefreshCw, Store, Users, School } from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Header, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page,
  CrmV2SectionLabel, CrmV2Select, CrmV2Spinner, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { V2Banner, V2CardTitle } from '@/components/crm-v2/marketing2/sms-events-tools/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
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

const SALON_COLOR = '#7C3AED'

export default function EventsPlanningPage() {
  const isMobile = useIsMobile()
  const router = useRouter()
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

  // Formatage d'une ligne (jour, heure, libellé staff) — identique à l'original
  function rowInfo(e: PlanningEvent) {
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
    const staffLabel = e.staff_full
      ? 'Complet'
      : e.staff_remaining != null
        ? `${e.staff_remaining} rest.`
        : 'staff'
    return { day, time, staffLabel }
  }

  const typePill = (e: PlanningEvent) => (
    <CrmV2StatusPill
      label={e.type.short}
      color={e.type.id === 'salon' ? SALON_COLOR : crmV2.goldDark}
      bg={e.type.id === 'salon' ? 'rgba(124,58,237,0.10)' : crmV2.goldSoft}
      style={{ fontSize: 11 }}
    />
  )
  const statusPill = (e: PlanningEvent) => (
    <CrmV2StatusPill
      label={e.status === 'published' ? 'Publié' : 'Brouillon'}
      color={e.status === 'published' ? crmV2.success : crmV2.textMuted}
      style={{ fontSize: 11 }}
    />
  )
  const staffCount = (e: PlanningEvent, size = 15) => (
    <span style={{ fontSize: size, fontWeight: 700, color: crmV2.text }}>
      {e.staff_count}
      {e.staff_needed != null ? (
        <span style={{ fontSize: size - 2, fontWeight: 500, color: crmV2.textMuted }}>/{e.staff_needed}</span>
      ) : null}
    </span>
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/events', label: 'Événements' }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <CalendarRange size={20} color={crmV2.gold} /> Planning Diploma Santé
          </span>
        }
        subtitle="JPO et salons de l’année — partagez le lien public pour que les équipes s’inscrivent."
        actions={
          <CrmV2Button variant="secondary" onClick={load} disabled={loading} icon={<RefreshCw size={14} />}>
            Actualiser
          </CrmV2Button>
        }
      />

      <CrmV2Body style={{ maxWidth: 1016, boxSizing: 'border-box', paddingBottom: 48 }}>
        {toast && <V2Banner kind="success">{toast}</V2Banner>}

        <CrmV2KpiGrid>
          <CrmV2KpiCard label="Événements" value={totals.events} icon={<CalendarDays size={15} />} color={crmV2.text} detail={`JPO + salons ${year}`} />
          <CrmV2KpiCard label="JPO" value={totals.jpo} icon={<School size={15} />} color={crmV2.goldDark} detail="journées portes ouvertes" />
          <CrmV2KpiCard label="Salons" value={totals.salon} icon={<Store size={15} />} color={SALON_COLOR} detail="salons étudiants" />
          <CrmV2KpiCard label="Inscriptions staff" value={totals.staff} icon={<Users size={15} />} color={crmV2.link} detail="collaborateurs inscrits" />
        </CrmV2KpiGrid>

        {/* Lien public + filtres */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 18 }}>
          <V2CardTitle
            title="Lien d’inscription public"
            description="Les collaborateurs choisissent les JPO / salons auxquels ils souhaitent participer."
          />
          <div
            style={{
              fontSize: 12,
              color: crmV2.link,
              fontWeight: 600,
              wordBreak: 'break-all',
              padding: '10px 12px',
              background: crmV2.bgSoft,
              borderRadius: crmV2.radius,
              border: `1px solid ${crmV2.border}`,
              margin: '12px 0',
            }}
          >
            {publicUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: crmV2.textMuted, fontWeight: 700 }}>
              Année
              <CrmV2Select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                style={{ width: 'auto', minWidth: 96, borderRadius: crmV2.radiusPill }}
              >
                {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </CrmV2Select>
            </label>
            <CrmV2Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Type d'événement"
              style={{ width: 'auto', minWidth: 160, borderRadius: crmV2.radiusPill }}
            >
              <option value="">JPO + Salons</option>
              <option value="jpo">JPO uniquement</option>
              <option value="salon">Salons uniquement</option>
            </CrmV2Select>
            <div style={{ display: 'flex', gap: 8, marginLeft: isMobile ? 0 : 'auto', flexWrap: 'wrap' }}>
              <CrmV2Button variant="primary" onClick={copyLink} icon={<Copy size={14} />} style={isMobile ? { minHeight: 40 } : undefined}>
                Copier le lien
              </CrmV2Button>
              <a href={publicUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />} style={isMobile ? { minHeight: 40 } : undefined}>
                  Ouvrir
                </CrmV2Button>
              </a>
            </div>
          </div>
        </CrmV2Card>

        {error && <V2Banner kind="error">{error}</V2Banner>}

        {loading ? (
          <CrmV2Card style={{ padding: 0 }}><CrmV2Spinner /></CrmV2Card>
        ) : events.length === 0 ? (
          <CrmV2Card style={{ padding: 0 }}>
            <CrmV2Empty
              icon={<CalendarRange size={26} />}
              title={`Aucun JPO / salon Diploma planifié pour ${year}.`}
              action={
                <Link href="/admin/crm/events/new?brand=diploma" style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="primary">Créer un événement</CrmV2Button>
                </Link>
              }
            />
          </CrmV2Card>
        ) : (
          <div style={{ display: 'grid', gap: isMobile ? 14 : 18 }}>
            {byMonth.map((month) => (
              <section key={month.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <CrmV2SectionLabel style={{ padding: '0 2px' }}>
                  {month.label}
                  <span style={{ fontWeight: 600, color: crmV2.textFaint }}>({month.events.length})</span>
                </CrmV2SectionLabel>

                {isMobile ? (
                  // Mobile : une ligne par événement
                  <CrmV2Card style={{ padding: 0, overflow: 'hidden' }}>
                    {month.events.map((e, i) => {
                      const { day, time, staffLabel } = rowInfo(e)
                      return (
                        <Link
                          key={e.id}
                          href={`/admin/crm/events/${e.id}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 56,
                            textDecoration: 'none', color: 'inherit',
                            borderTop: i === 0 ? 'none' : `1px solid ${crmV2.border}`,
                          }}
                        >
                          <div style={{ width: 44, textAlign: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: crmV2.textFaint, textTransform: 'uppercase', fontWeight: 700 }}>{day.split(' ')[0]}</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{day.split(' ').slice(1).join(' ')}</div>
                          </div>
                          <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 99, background: e.type.id === 'salon' ? SALON_COLOR : crmV2.gold, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                            <div style={{ fontSize: 11, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {e.type.short} · {e.status === 'published' ? 'Publié' : 'Brouillon'} · {time}
                              {e.event_time_end ? ` – ${e.event_time_end}` : ''}
                              {e.location ? ` · ${e.location}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {staffCount(e, 15)}
                            <div style={{ fontSize: 10, color: e.staff_full ? crmV2.successStrong : crmV2.textFaint, textTransform: 'uppercase', fontWeight: 700 }}>{staffLabel}</div>
                            {e.pay_label ? (
                              <div style={{ fontSize: 10, color: crmV2.textMuted }}>{e.pay_label}</div>
                            ) : null}
                          </div>
                        </Link>
                      )
                    })}
                  </CrmV2Card>
                ) : (
                  <CrmV2TableCard>
                    <CrmV2Table>
                      <thead>
                        <tr>
                          <CrmV2Th style={{ width: 120 }}>Date</CrmV2Th>
                          <CrmV2Th>Événement</CrmV2Th>
                          <CrmV2Th>Type</CrmV2Th>
                          <CrmV2Th>Statut</CrmV2Th>
                          <CrmV2Th>Horaires · Lieu</CrmV2Th>
                          <CrmV2Th style={{ textAlign: 'right' }}>Staff</CrmV2Th>
                        </tr>
                      </thead>
                      <tbody>
                        {month.events.map((e) => {
                          const { day, time, staffLabel } = rowInfo(e)
                          return (
                            <CrmV2Tr key={e.id} onClick={() => router.push(`/admin/crm/events/${e.id}`)}>
                              <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: 11, color: crmV2.textFaint, textTransform: 'uppercase', fontWeight: 700, marginRight: 6 }}>
                                  {day.split(' ')[0]}
                                </span>
                                <span style={{ fontWeight: 700 }}>{day.split(' ').slice(1).join(' ')}</span>
                              </CrmV2Td>
                              <CrmV2Td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <span style={{
                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    background: crmV2.bgSoft, color: e.type.id === 'salon' ? SALON_COLOR : crmV2.gold,
                                  }}>
                                    <CalendarDays size={14} />
                                  </span>
                                  <Link
                                    href={`/admin/crm/events/${e.id}`}
                                    onClick={(ev) => ev.stopPropagation()}
                                    style={{ color: crmV2.link, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}
                                  >
                                    {e.name}
                                  </Link>
                                </div>
                              </CrmV2Td>
                              <CrmV2Td>{typePill(e)}</CrmV2Td>
                              <CrmV2Td>{statusPill(e)}</CrmV2Td>
                              <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                                {time}
                                {e.event_time_end ? ` – ${e.event_time_end}` : ''}
                                {e.location ? ` · ${e.location}` : ''}
                              </CrmV2Td>
                              <CrmV2Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                  {e.pay_label ? (
                                    <span style={{ fontSize: 11, color: crmV2.textMuted }}>{e.pay_label}</span>
                                  ) : null}
                                  {staffCount(e)}
                                  <CrmV2StatusPill
                                    label={staffLabel}
                                    color={e.staff_full ? crmV2.successStrong : crmV2.textMuted}
                                    dot={false}
                                    style={{ fontSize: 11 }}
                                  />
                                </div>
                              </CrmV2Td>
                            </CrmV2Tr>
                          )
                        })}
                      </tbody>
                    </CrmV2Table>
                  </CrmV2TableCard>
                )}
              </section>
            ))}
          </div>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}
