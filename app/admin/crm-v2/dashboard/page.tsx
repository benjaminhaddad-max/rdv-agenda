'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard, TrendingUp, Users, Briefcase, CheckSquare, Workflow,
  Clock, RefreshCw, Mail,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  CrmV2Avatar,
  CrmV2Button,
  CrmV2Card,
  CrmV2Header,
  CrmV2Link,
  CrmV2Page,
  CrmV2Spinner,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

interface Stats {
  generated_at: string
  leads: {
    today: number
    last_7_days: number
    last_30_days: number
    daily_series: Array<{ date: string; count: number }>
  }
  sources: Array<{ label: string; count: number }>
  stages: Array<{ label: string; count: number }>
  classes: Record<string, number>
  deals: { open: number; won_month: number }
  tasks: { overdue: number; today: number; week: number }
  workflows: { active: number; running_executions: number }
  top_owners: Array<{ owner_id: string; name: string; count: number }>
  last_submissions: Array<{
    hubspot_contact_id: string
    firstname: string | null
    lastname: string | null
    email: string | null
    recent_conversion_event: string | null
    recent_conversion_date: string | null
    hs_lead_status: string | null
  }>
}

export default function DashboardV2Page() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/crm/dashboard/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Dashboard"
        subtitle="Vue d’ensemble du CRM — Design B"
        actions={
          <>
            <CrmV2Button variant="ghost" onClick={() => { window.location.href = '/admin/crm/dashboard' }}>
              Version classique
            </CrmV2Button>
            <CrmV2Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Actualiser
            </CrmV2Button>
          </>
        }
      />

      <div style={{ padding: '20px 28px 40px', display: 'grid', gap: 16, maxWidth: 1400 }}>
        {loading && !stats && <CrmV2Spinner />}
        {err && <div style={{ color: crmV2.danger, fontSize: 13 }}>Erreur : {err}</div>}

        {stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Kpi
                icon={<TrendingUp size={16} />}
                label="Nouveaux leads"
                value={stats.leads.today}
                sub={`${stats.leads.last_7_days} / 7j · ${stats.leads.last_30_days} / 30j`}
                href="/admin/crm-v2"
                accent={crmV2.link}
              />
              <Kpi
                icon={<Briefcase size={16} />}
                label="Transactions ouvertes"
                value={stats.deals.open}
                sub={`${stats.deals.won_month} gagnées ce mois`}
                href="/admin/crm-v2/transactions"
                accent={crmV2.success}
              />
              <Kpi
                icon={<CheckSquare size={16} />}
                label="Tâches en retard"
                value={stats.tasks.overdue}
                sub={`${stats.tasks.today} aujourd'hui · ${stats.tasks.week} semaine`}
                href="/admin/crm-v2/tasks"
                accent={stats.tasks.overdue > 0 ? crmV2.danger : crmV2.textMuted}
              />
              <Kpi
                icon={<Workflow size={16} />}
                label="Workflows actifs"
                value={stats.workflows.active}
                sub={`${stats.workflows.running_executions} contacts en cours`}
                href="/admin/crm-v2/workflows"
                accent={crmV2.gold}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <Panel title="Sources (30j)" icon={<TrendingUp size={12} />}>
                <BarList items={stats.sources.map(s => ({ label: s.label, value: s.count }))} color={crmV2.link} />
              </Panel>
              <Panel title="Statuts lead" icon={<Users size={12} />}>
                <BarList items={stats.stages.map(s => ({ label: s.label, value: s.count }))} color={crmV2.gold} />
              </Panel>
              <Panel title="Top commerciaux (30j)" icon={<LayoutDashboard size={12} />}>
                {stats.top_owners.length === 0 ? (
                  <EmptyHint />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {stats.top_owners.map(o => (
                      <div key={o.owner_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CrmV2Avatar name={o.name} />
                        <span style={{ flex: 1, fontSize: 13 }}>{o.name}</span>
                        <strong style={{ fontSize: 13, color: crmV2.link }}>{o.count}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Dernières soumissions" icon={<Mail size={12} />}>
              {stats.last_submissions.length === 0 ? (
                <EmptyHint />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {stats.last_submissions.map((s, i) => {
                    const name = [s.firstname, s.lastname].filter(Boolean).join(' ') || s.email || 'Anonyme'
                    return (
                      <div
                        key={s.hubspot_contact_id + i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.2fr 1.4fr auto auto',
                          gap: 12,
                          alignItems: 'center',
                          padding: '12px 4px',
                          borderBottom: `1px solid ${crmV2.border}`,
                          fontSize: 13,
                        }}
                      >
                        <div>
                          <CrmV2Link href={`/admin/crm-v2/contacts/${s.hubspot_contact_id}`}>{name}</CrmV2Link>
                          <div style={{ fontSize: 12, color: crmV2.textFaint }}>{s.email}</div>
                        </div>
                        <div style={{ color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.recent_conversion_event || '—'}
                        </div>
                        <div style={{ color: crmV2.textMuted }}>{s.hs_lead_status || '—'}</div>
                        <div style={{ color: crmV2.textFaint, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} />
                          {s.recent_conversion_date
                            ? formatDistanceToNow(new Date(s.recent_conversion_date), { locale: fr, addSuffix: true })
                            : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>

            <div style={{ fontSize: 11, color: crmV2.textFaint, textAlign: 'right' }}>
              Données générées {format(new Date(stats.generated_at), "'le' d MMMM yyyy 'à' HH:mm:ss", { locale: fr })}
            </div>
          </>
        )}
      </div>
    </CrmV2Page>
  )
}

function Kpi({
  icon, label, value, sub, href, accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub: string
  href: string
  accent: string
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <CrmV2Card style={{ padding: 16, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: crmV2.bgSoft,
            color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {label}
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: accent, letterSpacing: '-0.02em' }}>
          {value.toLocaleString('fr-FR')}
        </div>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>{sub}</div>
      </CrmV2Card>
    </Link>
  )
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <CrmV2Card style={{ padding: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        fontSize: 11, fontWeight: 700, color: crmV2.text, textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        <span style={{ color: crmV2.gold }}>{icon}</span>
        {title}
      </div>
      {children}
    </CrmV2Card>
  )
}

function BarList({ items, color }: { items: Array<{ label: string; value: number }>; color: string }) {
  if (items.length === 0) return <EmptyHint />
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 8).map((item, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
              {item.label}
            </span>
            <span style={{ color: crmV2.textMuted, fontWeight: 600 }}>{item.value.toLocaleString('fr-FR')}</span>
          </div>
          <div style={{ height: 6, background: crmV2.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyHint() {
  return <div style={{ color: crmV2.textFaint, fontSize: 12, padding: 16, textAlign: 'center' }}>Aucune donnée</div>
}
