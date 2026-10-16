'use client'

/**
 * Liste d'appels du power dialer (vue « Appels ») : les contacts de la liste
 * lancée, dans l'ordre, avec pour chacun son état en direct — en cours (icône
 * animée), résultat noté, passé, rang dans la file. Clic sur une ligne = fiche.
 */

import { useEffect, useRef, type CSSProperties } from 'react'
import { Check, SkipForward } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import type { DialerLead } from '@/lib/dialer-shared'
import { toE164French } from '@/lib/phone-e164'
import type { DialerLive } from '@/lib/dialer-live'
import StatusPill, { DialerAnimations, LiveIcon } from './DialerStatusPill'
import { tint } from './ui'

const GRID = '64px minmax(180px, 1.5fr) 140px 120px 170px minmax(170px, 1fr)'

export default function DialerQueue({
  items, live, nextIds, takenIds, more, onOpenContact,
}: {
  /** Contacts dans l'ordre de la liste (relances dues comprises) */
  items: DialerLead[]
  live: DialerLive
  /** Tous les prochains appels, dans l'ordre (le 1er = « Ensuite ») */
  nextIds: string[]
  /** Contacts déjà pris par la session */
  takenIds: ReadonlySet<string>
  /** D'autres contacts arrivent (liste chargée page par page) */
  more: boolean
  onOpenContact?: (contactId: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const currentId = live.current?.id ?? null

  // La ligne en cours reste visible
  useEffect(() => {
    if (!currentId || !box.current) return
    const row = box.current.querySelector(`[data-queue-row="${CSS.escape(currentId)}"]`)
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentId])

  const results = live.results
  const called = items.filter(l => results[l.hubspot_contact_id]).length
  const reached = items.filter(l => results[l.hubspot_contact_id]?.reached).length
  const rank = new Map(nextIds.map((id, i) => [id, i]))

  const head: CSSProperties = { fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: crmV2.bg,
      border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden',
    }}>
      <DialerAnimations />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: `1px solid ${crmV2.border}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: crmV2.text }}>Liste d&apos;appels</span>
        <Count n={items.length} label={more ? 'contacts chargés' : 'contacts'} />
        <Count n={called} label="appelés" />
        <Count n={reached} label="joints" color={crmV2.successStrong} />
        <Count n={nextIds.length} label={more ? 'à appeler (et la suite)' : 'à appeler'} color={crmV2.goldDark} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 16px', borderBottom: `1px solid ${crmV2.border}`, background: crmV2.bgSoft }}>
        <span style={head}>#</span><span style={head}>Contact</span><span style={head}>Téléphone</span>
        <span style={head}>Classe</span><span style={head}>Statut</span><span style={head}>Appel</span>
      </div>

      <div ref={box} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {items.length === 0 && (
          <div style={{ padding: 24, fontSize: 13, color: crmV2.textMuted }}>Chargement de la liste…</div>
        )}
        {items.map((l, i) => {
          const id = l.hubspot_contact_id
          const isCurrent = id === currentId
          const res = results[id]
          const r = rank.get(id)
          const status = live.statuses[id] ?? l.lead_status
          const passed = !isCurrent && !res && takenIds.has(id)
          const done = !!res && !isCurrent
          return (
            <div key={id} data-queue-row={id} role="button" tabIndex={0}
              onClick={() => onOpenContact?.(id)}
              onKeyDown={e => { if (e.key === 'Enter') onOpenContact?.(id) }}
              title="Ouvrir la fiche"
              style={{
                display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '0 16px', minHeight: isCurrent ? 60 : 48,
                borderBottom: `1px solid ${crmV2.border}`, cursor: onOpenContact ? 'pointer' : 'default',
                background: isCurrent ? crmV2.goldSoft : 'transparent',
                boxShadow: isCurrent ? `inset 4px 0 0 ${crmV2.gold}` : undefined,
                opacity: done || passed ? 0.62 : 1,
              }}>
              {/* Rang ou icône */}
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: isCurrent ? 38 : 32, height: isCurrent ? 38 : 32, borderRadius: 999,
                background: isCurrent ? tint(crmV2.gold, 0.2) : res ? tint(res.color, 0.12) : crmV2.bgSoft,
                border: isCurrent ? `1px solid ${crmV2.goldBorder}` : undefined,
                animation: isCurrent ? 'dq-halo 1.6s infinite' : undefined,
                color: res ? res.color : crmV2.textMuted, fontSize: 12, fontWeight: 700 }}>
                {isCurrent && live.current ? <LiveIcon state={live.current.state} size={18} />
                  : res ? <Check size={14} />
                  : passed ? <SkipForward size={13} />
                  : i + 1}
              </span>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: isCurrent ? 15 : 14, fontWeight: isCurrent ? 800 : 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isCurrent && <span style={{ fontSize: 10, fontWeight: 800, color: crmV2.goldDark, letterSpacing: '0.5px', marginRight: 8 }}>EN COURS</span>}
                  {l.name}
                </span>
                {l.form_name && (
                  <span style={{ fontSize: 11, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.form_name}</span>
                )}
              </span>
              <span style={{ fontSize: 13, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{l.phone ?? '—'}</span>
              <span style={{ fontSize: 13, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.classe ?? '—'}</span>
              <span style={{ minWidth: 0 }}>
                {status ? (
                  <span style={{ display: 'inline-block', maxWidth: '100%', fontSize: 12, fontWeight: 600, color: crmV2.text, background: crmV2.chipBg,
                    border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '2px 9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
                ) : <span style={{ fontSize: 12, color: crmV2.textFaint }}>—</span>}
              </span>
              <span style={{ minWidth: 0 }}>
                {isCurrent && live.current ? <StatusPill state={live.current.state} label={live.current.label || 'Appel…'} />
                  : res ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: res.color,
                      background: tint(res.color, 0.1), border: `1px solid ${tint(res.color, 0.3)}`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                      <Check size={11} /> {res.label}
                    </span>
                  )
                  : passed ? <span style={{ fontSize: 12, color: crmV2.textMuted }}>Passé</span>
                  : r === 0 ? <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.goldDark }}>Ensuite</span>
                  : r != null ? <span style={{ fontSize: 12, color: crmV2.textMuted }}>Dans {r + 1} appels</span>
                  : <span style={{ fontSize: 12, color: crmV2.textFaint }}>{toE164French(l.phone) ? 'Déjà traité aujourd\'hui' : 'Pas de numéro valide'}</span>}
              </span>
            </div>
          )
        })}
        {more && items.length > 0 && (
          <div style={{ padding: '12px 16px', fontSize: 12, color: crmV2.textMuted }}>Les contacts suivants se chargent au fil des appels…</div>
        )}
      </div>
    </div>
  )
}

function Count({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <span style={{ fontSize: 13, color: crmV2.textMuted }}>
      <strong style={{ color: color ?? crmV2.text, fontSize: 15 }}>{n}</strong> {label}
    </span>
  )
}
