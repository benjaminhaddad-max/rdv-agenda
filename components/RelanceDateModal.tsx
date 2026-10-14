'use client'

/**
 * Statut « A relancer » : on demande obligatoirement la date et l'heure de la
 * relance. Avec une date à venir, le lead reste au télépro ; sans date (ou
 * date passée sans RDV), il part dans la vue « À réattribuer ».
 */
import { useState } from 'react'
import { AlarmClock } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2ModalHeader, CrmV2ModalShell } from '@/components/crm-v2/modals/ModalShell'

export const RELANCE_STATUS = 'A relancer'

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function at(daysFromNow: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, 0, 0, 0)
  return d
}

function nextMonday(hour: number): Date {
  const d = new Date()
  const add = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + add)
  d.setHours(hour, 0, 0, 0)
  return d
}

export default function RelanceDateModal({ contactName, initial, onConfirm, onCancel }: {
  contactName: string
  initial?: string | null
  onConfirm: (iso: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(() => toLocalInput(initial && Date.parse(initial) > Date.now() ? new Date(initial) : at(1, 10)))
  const date = new Date(value)
  const valid = Number.isFinite(date.getTime()) && date.getTime() > Date.now()
  const quick: { label: string; d: Date }[] = [
    ...(new Date().getHours() < 17 ? [{ label: 'Aujourd’hui 18h', d: at(0, 18) }] : []),
    { label: 'Demain 10h', d: at(1, 10) },
    { label: 'Demain 18h', d: at(1, 18) },
    { label: 'Dans 2 jours', d: at(2, 10) },
    { label: 'Lundi 10h', d: nextMonday(10) },
    { label: 'Dans 1 semaine', d: at(7, 10) },
  ]

  return (
    <CrmV2ModalShell
      onClose={onCancel}
      width={460}
      closeOnEscape
      zIndex={1300}
      header={
        <CrmV2ModalHeader
          title="Quand le relancer ?"
          subtitle={`${contactName} passe en « A relancer » : indique la date et l’heure du rappel.`}
          icon={<AlarmClock size={16} />}
          onClose={onCancel}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {quick.map(q => {
            const sel = toLocalInput(q.d) === value
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => setValue(toLocalInput(q.d))}
                style={{
                  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: sel ? crmV2.primary : crmV2.bg, color: sel ? '#fff' : crmV2.text,
                  border: `1px solid ${sel ? crmV2.primary : crmV2.borderStrong}`,
                }}
              >
                {q.label}
              </button>
            )
          })}
        </div>
        <input
          type="datetime-local"
          value={value}
          onChange={e => setValue(e.target.value)}
          style={{ height: 38, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 10, padding: '0 10px', fontSize: 14, fontFamily: 'inherit', color: crmV2.text }}
        />
        <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5 }}>
          Le lead reste chez toi jusqu’à cette date. S’il n’a toujours pas de RDV une fois la date passée, il part dans « À réattribuer ».
        </div>
        {!valid && <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>Choisis une date et une heure à venir.</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => valid && onConfirm(date.toISOString())}
            style={{ borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', background: crmV2.primary, border: `1px solid ${crmV2.primary}`, color: '#fff', opacity: valid ? 1 : 0.5 }}
          >
            Passer en « A relancer »
          </button>
        </div>
      </div>
    </CrmV2ModalShell>
  )
}

/** « jeu. 16 oct. 14h00 » (heure de Paris) */
export function formatRelance(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h')}`
}
