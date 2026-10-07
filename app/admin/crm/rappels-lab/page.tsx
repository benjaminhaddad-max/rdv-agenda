'use client'

import { useEffect, useMemo, useState } from 'react'
import { PhoneCall, RefreshCw, CheckCircle2, Clock } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { crmV2 } from '@/lib/crm-v2-theme'

type Row = {
  contact_id: string
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  classe: string | null
  zone: string | null
  origine: string | null
  lead_status: string | null
  telepro: string | null
  apps: string[]
  screens: string[]
  request_count: number
  first_request_at: string
  last_request_at: string
  last_call_at: string | null
  called_back: boolean
}

type Tab = 'todo' | 'done' | 'all'
type AppFilter = '' | 'Diplomalab' | 'Medibox Lab'

const TABS: { key: Tab; label: string }[] = [
  { key: 'todo', label: 'À rappeler' },
  { key: 'done', label: 'Rappelés' },
  { key: 'all', label: 'Toutes' },
]

function fullName(r: Row): string {
  return [r.firstname, r.lastname].filter(Boolean).join(' ') || r.email || '(sans nom)'
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', borderRadius: crmV2.radiusPill, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? crmV2.gold : crmV2.border}`,
    background: active ? crmV2.goldSoft : crmV2.bg,
    color: active ? crmV2.text : crmV2.textMuted,
  }
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `1px solid ${crmV2.border}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: crmV2.text, borderBottom: `1px solid ${crmV2.border}`, verticalAlign: 'top' }

export default function RappelsLabPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('todo')
  const [app, setApp] = useState<AppFilter>('')

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/crm/lab-callbacks')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setRows(j.rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const byApp = useMemo(() => (app ? rows.filter(r => r.apps.includes(app)) : rows), [rows, app])
  const counts = useMemo(() => ({
    todo: byApp.filter(r => !r.called_back).length,
    done: byApp.filter(r => r.called_back).length,
    all: byApp.length,
  }), [byApp])
  const visible = useMemo(
    () => byApp.filter(r => (tab === 'all' ? true : tab === 'done' ? r.called_back : !r.called_back)),
    [byApp, tab],
  )

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft, fontFamily: crmV2.font, color: crmV2.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PhoneCall size={20} color={crmV2.gold} /> Demandes de rappel Lab
            </h1>
            <p style={{ fontSize: 13, color: crmV2.textMuted, margin: '6px 0 0' }}>
              Étudiants qui ont cliqué « Être rappelé » dans Diplomalab ou Medibox Lab. « Rappelé » = un appel a été loggé sur la fiche après la dernière demande.
            </p>
          </div>
          <button onClick={load} disabled={loading} style={{ ...pill(false), display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> Actualiser
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={pill(tab === t.key)}>
              {t.label} <span style={{ opacity: 0.7 }}>({counts[t.key]})</span>
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: crmV2.border, margin: '0 6px' }} />
          {(['', 'Diplomalab', 'Medibox Lab'] as AppFilter[]).map(a => (
            <button key={a || 'all'} onClick={() => setApp(a)} style={pill(app === a)}>{a || 'Toutes les apps'}</button>
          ))}
        </div>

        {error && (
          <div style={{ background: crmV2.dangerSoft, color: crmV2.danger, padding: 12, borderRadius: crmV2.radius, fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflowX: 'auto', boxShadow: crmV2.shadow }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr>
                <th style={th}>Dernière demande</th>
                <th style={th}>Étudiant</th>
                <th style={th}>Téléphone</th>
                <th style={th}>App · écran</th>
                <th style={th}>Classe · zone</th>
                <th style={th}>Statut</th>
                <th style={th}>Télépro</th>
                <th style={th}>Rappel</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: crmV2.textMuted, padding: 32 }} colSpan={8}>Chargement…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: crmV2.textMuted, padding: 32 }} colSpan={8}>Aucune demande dans cette vue.</td></tr>
              ) : visible.map(r => (
                <tr key={r.contact_id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{format(new Date(r.last_request_at), 'd MMM yyyy · HH:mm', { locale: fr })}</div>
                    <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                      {formatDistanceToNow(new Date(r.last_request_at), { locale: fr, addSuffix: true })}
                      {r.request_count > 1 && <> · {r.request_count} demandes</>}
                    </div>
                  </td>
                  <td style={td}>
                    <a href={`/admin/crm/contacts/${r.contact_id}`} style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>{fullName(r)}</a>
                    {r.email && <div style={{ fontSize: 11, color: crmV2.textFaint }}>{r.email}</div>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {r.phone ? <a href={`tel:${r.phone}`} style={{ color: crmV2.text, textDecoration: 'none' }}>{r.phone}</a> : '—'}
                  </td>
                  <td style={td}>
                    <div>{r.apps.join(', ')}</div>
                    {r.screens.length > 0 && <div style={{ fontSize: 11, color: crmV2.textFaint }}>{r.screens.join(' · ')}</div>}
                  </td>
                  <td style={td}>
                    <div>{r.classe || '—'}</div>
                    <div style={{ fontSize: 11, color: crmV2.textFaint }}>{[r.zone, r.origine].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td style={td}>{r.lead_status || '—'}</td>
                  <td style={td}>{r.telepro || <span style={{ color: crmV2.danger, fontWeight: 600 }}>Non assigné</span>}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {r.called_back ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: crmV2.success, fontWeight: 600 }}>
                        <CheckCircle2 size={14} /> {format(new Date(r.last_call_at!), 'd MMM', { locale: fr })}
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b7791f', fontWeight: 600 }}>
                        <Clock size={14} /> À rappeler
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
