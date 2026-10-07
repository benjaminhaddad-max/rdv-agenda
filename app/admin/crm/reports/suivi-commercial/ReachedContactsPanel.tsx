'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import type { ReachedContact, ReachedContactsResponse, SuiviRole } from '@/lib/suivi-commercial'
import { TALK_MIN_SEC } from '@/lib/suivi-commercial'

type Filter = 'all' | 'long' | 'short'

const PAGE = 40

/** Palette des statuts lead : succès = vert, négatif = gris/rouge, à travailler = orange/violet. */
const STATUS_COLORS: Record<string, string> = {
  'Nouveau': '#3b82f6',
  'Nouveau - Chaud': '#2563eb',
  'En cours': '#22c55e',
  'NRP1': '#f59e0b',
  'NRP2': '#f97316',
  'NRP3': '#dc2626',
  'NRP4': '#b91c1c',
  'A relancer': '#a855f7',
  'À relancer': '#a855f7',
  'A replanifier': '#06b6d4',
  'En attente / Réfléchit': '#eab308',
  'RDV pris': '#16a34a',
  'Rdv pris': '#16a34a',
  'Pré-inscrit 2025/2026': '#15803d',
  'Pré-inscrit 2026/2027': '#15803d',
  'Inscrit': '#15803d',
  "A garder pour l'an prochain": '#0ea5e9',
  'Disqualifié': '#dc2626',
  'Mauvais numéro': '#a89e8a',
  'Raccroche au nez': '#ef4444',
  'Autre prépa concurrente': '#4a6070',
  'Doublon': '#a89e8a',
  'Perdu': '#4a6070',
}

function statusColor(status: string | null): string {
  if (!status) return '#a89e8a'
  return STATUS_COLORS[status] || '#4a6070'
}

function fmtTalk(sec: number): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  return s ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' })
}

function fmtDayTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function ReachedContactsPanel({
  agentId, from, to, role, isMobile = false,
}: {
  agentId: string
  from: string
  to: string
  role: SuiviRole
  isMobile?: boolean
}) {
  const pathname = usePathname()
  const base = pathname?.includes('/crm-v2') ? '/admin/crm-v2' : '/admin/crm'
  const qs = new URLSearchParams({ from, to, role, agent: agentId }).toString()
  // Résultat indexé par requête : un changement de période/agent repasse en « Chargement… » sans setState dans l'effet.
  const [result, setResult] = useState<{ qs: string; contacts: ReachedContact[] | null; err: string | null } | null>(null)
  const contacts = result?.qs === qs ? result.contacts : null
  const err = result?.qs === qs ? result.err : null
  const [filter, setFilter] = useState<Filter>('all')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/crm/reports/suivi-commercial/contacts?${qs}`)
      .then(async res => {
        const json = await res.json() as ReachedContactsResponse & { error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (!cancelled) setResult({ qs, contacts: json.contacts, err: null })
      })
      .catch(e => { if (!cancelled) setResult({ qs, contacts: null, err: e instanceof Error ? e.message : 'Erreur' }) })
    return () => { cancelled = true }
  }, [qs])

  const all = useMemo(() => contacts ?? [], [contacts])
  const longCount = all.filter(c => c.max_talk_sec >= TALK_MIN_SEC).length
  const tiered = useMemo(() => all.filter(c =>
    filter === 'all' ? true : filter === 'long' ? c.max_talk_sec >= TALK_MIN_SEC : c.max_talk_sec < TALK_MIN_SEC,
  ), [all, filter])

  const byStatus = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of tiered) {
      const k = c.hubspot_contact_id ? (c.lead_status || 'Sans statut') : 'Hors CRM'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
  }, [tiered])

  const changedCount = tiered.filter(c => c.status_changed_to).length
  const visible = statusFilter
    ? tiered.filter(c => (c.hubspot_contact_id ? (c.lead_status || 'Sans statut') : 'Hors CRM') === statusFilter)
    : tiered

  return (
    <div style={{ background: '#fff', border: '1px solid #eee6d6', borderRadius: 10, padding: 14, marginTop: isMobile ? 12 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase' }}>
            Contacts joints au téléphone{contacts ? ` (${all.length})` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#a89e8a', marginTop: 2 }}>
            Décrochés humains (≥ 10 s, hors messagerie) · statut lead actuel et changement après l’appel
          </div>
        </div>
        <div style={{ display: 'flex', background: '#faf8f4', border: '1px solid #e5ddc8', borderRadius: 8, overflow: 'hidden' }}>
          {([
            { v: 'all', label: `Tous (${all.length})` },
            { v: 'long', label: `> 2 min (${longCount})` },
            { v: 'short', label: `< 2 min (${all.length - longCount})` },
          ] as Array<{ v: Filter; label: string }>).map(o => (
            <button
              key={o.v}
              onClick={() => { setFilter(o.v); setStatusFilter(null); setLimit(PAGE) }}
              style={{
                padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit',
                background: filter === o.v ? 'rgba(204,172,113,0.2)' : 'transparent',
                color: filter === o.v ? '#0e1e35' : '#4a6070',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ fontSize: 12, color: '#dc2626' }}>Erreur : {err}</div>}
      {!contacts && !err && <div style={{ fontSize: 12, color: '#4a6070', padding: '8px 0' }}>Chargement…</div>}

      {contacts && tiered.length === 0 && (
        <div style={{ fontSize: 12, color: '#4a6070', padding: '8px 0' }}>Aucun contact joint sur la période.</div>
      )}

      {contacts && tiered.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, marginRight: 2 }}>{tiered.length} joint{tiered.length > 1 ? 's' : ''} :</span>
            {byStatus.map(([status, n]) => {
              const color = statusColor(status === 'Hors CRM' || status === 'Sans statut' ? null : status)
              const active = statusFilter === status
              return (
                <button
                  key={status}
                  onClick={() => { setStatusFilter(active ? null : status); setLimit(PAGE) }}
                  title={active ? 'Retirer le filtre' : `Voir seulement « ${status} »`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? `${color}33` : `${color}14`,
                    border: `1px solid ${active ? color : `${color}55`}`,
                    color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                  }}
                >
                  {n} {status}
                </button>
              )
            })}
            {changedCount > 0 && (
              <span style={{ fontSize: 11, color: '#4a6070', marginLeft: 4 }}>
                · {changedCount} statut{changedCount > 1 ? 's' : ''} changé{changedCount > 1 ? 's' : ''} après l’appel
              </span>
            )}
          </div>

          <div style={{ border: '1px solid #f0ebe0', borderRadius: 8, overflow: 'hidden' }}>
            {!isMobile && (
              <div style={{ ...gridRow, background: '#faf8f4', fontSize: 10, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <span>Contact</span>
                <span>Numéro</span>
                <span>Appels joints</span>
                <span>Statut actuel</span>
                <span>Évolution après l’appel</span>
              </div>
            )}
            {visible.slice(0, limit).map(c => (
              <ContactLine key={c.key} c={c} base={base} isMobile={isMobile} />
            ))}
          </div>
          {visible.length > limit && (
            <button
              onClick={() => setLimit(l => l + PAGE)}
              style={{ marginTop: 8, background: 'none', border: 'none', color: '#C9A84C', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              Voir {Math.min(PAGE, visible.length - limit)} de plus ({visible.length - limit} restants)
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ContactLine({ c, base, isMobile }: { c: ReachedContact; base: string; isMobile: boolean }) {
  const long = c.max_talk_sec >= TALK_MIN_SEC
  const name = c.name || (c.hubspot_contact_id ? 'Contact sans nom' : 'Numéro hors CRM')
  const nameEl = c.hubspot_contact_id ? (
    <Link href={`${base}/contacts/${c.hubspot_contact_id}`} style={{ color: '#0e1e35', fontWeight: 600, textDecoration: 'none' }}>
      {name}
    </Link>
  ) : (
    <span style={{ color: '#a89e8a', fontWeight: 600, fontStyle: 'italic' }}>{name}</span>
  )
  const calls = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: long ? '#2ea3f2' : '#e8b84a', flexShrink: 0 }} />
      <span>
        <b>{c.calls}</b> · {fmtTalk(c.talk_sec)}
        <span style={{ color: '#a89e8a', fontSize: 11 }}> · {c.calls > 1 ? `dernier ${fmtDayTime(c.last_call_at)}` : fmtDayTime(c.last_call_at)}</span>
      </span>
    </span>
  )
  const status = c.hubspot_contact_id ? <StatusBadge status={c.lead_status} /> : <span style={{ color: '#a89e8a' }}>—</span>
  const evolution = c.status_changed_to ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
      {c.status_before && <span style={{ color: '#a89e8a' }}>{c.status_before}</span>}
      <ArrowRight size={12} style={{ color: '#a89e8a' }} />
      <b style={{ color: statusColor(c.status_changed_to) }}>{c.status_changed_to}</b>
      {c.status_changed_at && <span style={{ color: '#a89e8a' }}>le {fmtDay(c.status_changed_at)}</span>}
    </span>
  ) : (
    <span style={{ color: '#a89e8a', fontSize: 12 }}>{c.hubspot_contact_id ? 'Inchangé' : '—'}</span>
  )

  if (isMobile) {
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid #f0ebe0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameEl}</span>
          {status}
        </div>
        <div style={{ fontSize: 12, color: '#4a6070' }}>{c.phone || '—'}</div>
        <div style={{ fontSize: 12 }}>{calls}</div>
        {c.status_changed_to && <div>{evolution}</div>}
      </div>
    )
  }

  return (
    <div style={{ ...gridRow, borderTop: '1px solid #f0ebe0', fontSize: 13 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameEl}</span>
      <span style={{ color: '#4a6070', whiteSpace: 'nowrap' }}>{c.phone || '—'}</span>
      <span>{calls}</span>
      <span>{status}</span>
      <span>{evolution}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const color = statusColor(status)
  return (
    <span style={{
      background: `${color}1a`, border: `1px solid ${color}66`, color,
      borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {status || 'Sans statut'}
    </span>
  )
}

const gridRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(140px, 1.3fr) 130px minmax(170px, 1.2fr) minmax(120px, 0.9fr) minmax(160px, 1.3fr)',
  gap: 12,
  alignItems: 'center',
  padding: '8px 12px',
}
