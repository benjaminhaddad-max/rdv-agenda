'use client'

/**
 * Tableau de suivi des dossiers Edumove (comme l'ancien back-office de la
 * plateforme) : où en est chaque dossier, et modification directe du statut,
 * de la situation et du suivi de chaque fac depuis la liste.
 */

import { useState, type CSSProperties } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { PhoneCall } from 'lucide-react'
import { CrmV2Table, CrmV2Td, CrmV2Th, CrmV2Tr } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  EDUMOVE_DOCUMENT_LABELS, EDUMOVE_MANUAL_STATUSES, EDUMOVE_SITUATION_LABELS, EDUMOVE_SITUATIONS, EDUMOVE_STATUS_LABELS,
  EDUMOVE_TRACKING_BY_UNI, EDUMOVE_TRACKING_LABELS, type EdumoveStage,
} from '@/lib/edumove-stage'
import { FILIERES, STAGE_STYLE } from '@/components/crm-v2/contact/EdumoveSection'
import { fullName, trackingOf, type DossierLite } from './types'

const FRISE: { stage: EdumoveStage; label: string }[] = [
  { stage: 'compte', label: 'Compte' },
  { stage: 'candidature', label: 'Candidature' },
  { stage: 'reponse', label: 'Réponse' },
  { stage: 'choix_faits', label: 'Facs choisies' },
  { stage: 'inscrit', label: 'Inscrit' },
]
const DEST: Record<string, { flag: string; label: string; bg: string; color: string }> = {
  LINK: { flag: '🇮🇹', label: 'LINK', bg: '#eef2ff', color: '#4338ca' },
  UCJC: { flag: '🇪🇸', label: 'UCJC', bg: '#fef3c7', color: '#92400e' },
  UE: { flag: '🇪🇸', label: 'UE', bg: '#ecfdf5', color: '#065f46' },
  PASS_LAS: { flag: '🇫🇷', label: 'PASS/LAS', bg: '#f0f9ff', color: '#0369a1' },
}
const TRACK_COLOR: Record<string, string> = {
  en_attente: '#94a3b8', dossier_envoye: '#1565c0', test_paye: '#6a1b9a', test_passe: '#6a1b9a', tests_passes: '#6a1b9a',
  entretien_planifie: '#e65100', entretien_passe: '#e65100', accepte: '#2e7d32', acompte_verse: '#2e7d32', inscrit: '#047857',
  refuse: '#d32f2f', autre_agence: '#d32f2f',
}
const UE_COMPLETION: Record<string, { color: string; title: string }> = {
  red: { color: '#dc2626', title: 'Page UE non commencée' },
  orange: { color: '#f59e0b', title: 'Page UE partiellement complétée' },
  green: { color: '#16a34a', title: 'Page UE complétée à 100 %' },
}

const ago = (d: string) => formatDistanceToNow(new Date(d), { locale: fr, addSuffix: true })
const sel = (color?: string): CSSProperties => ({
  fontSize: 12, fontWeight: 600, padding: '4px 6px', borderRadius: 8, border: `1px solid ${crmV2.border}`,
  background: crmV2.bg, color: color ?? crmV2.text, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 170,
})

type Action = { type: 'status'; status: string; notify?: boolean } | { type: 'situation'; situation: string } | { type: 'tracking'; uni: string; value: string }

export default function EdumoveSuiviTable({ rows, selected, onToggle, onToggleAll, allSelected, openId, onOpen, onPatched }: {
  rows: DossierLite[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  allSelected: boolean
  openId: string | null
  onOpen: (id: string) => void
  /** Après une modification : copie locale corrigée tout de suite, puis rechargement. */
  onPatched: (id: string, patch: Partial<DossierLite>) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (d: DossierLite, action: Action, patch: Partial<DossierLite>) => {
    setBusy(d.candidature_id)
    try {
      const r = await fetch(`/api/crm/edumove/${d.candidature_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { window.alert(j?.error || 'Modification impossible'); return }
      if (action.type === 'status' && action.notify) {
        const n = j?.notified as { email?: boolean; sms?: boolean } | undefined
        if (n && !n.email && !n.sms) window.alert("Statut changé, mais le candidat n'a pas pu être prévenu (mail et SMS en échec).")
      }
      onPatched(d.candidature_id, patch)
    } finally { setBusy(null) }
  }

  const changeStatus = (d: DossierLite, status: string) => {
    const notify = status === 'reponse_edumove' ? window.confirm('Prévenir le candidat que sa réponse est disponible (mail + SMS) ?') : false
    void act(d, { type: 'status', status, notify }, { status })
  }

  return (
    <CrmV2Table>
      <thead>
        <tr>
          <CrmV2Th style={{ width: 36 }}>
            <input type="checkbox" aria-label="Tout sélectionner" checked={allSelected} onChange={onToggleAll} />
          </CrmV2Th>
          <CrmV2Th>Candidat</CrmV2Th>
          <CrmV2Th>Où en est le dossier</CrmV2Th>
          <CrmV2Th>Vœux</CrmV2Th>
          <CrmV2Th>Statut</CrmV2Th>
          <CrmV2Th>Situation</CrmV2Th>
          <CrmV2Th>Suivi par fac</CrmV2Th>
          <CrmV2Th>Pièces</CrmV2Th>
          <CrmV2Th>Activité</CrmV2Th>
          <CrmV2Th>Dates</CrmV2Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(d => {
          const isCompte = d.stage === 'compte'
          const locked = isCompte || d.stage === 'archive'
          const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation() }
          return (
            <CrmV2Tr key={d.candidature_id} onClick={() => onOpen(d.candidature_id)}
              style={{ ...(openId === d.candidature_id ? { background: crmV2.bgMuted } : {}), opacity: busy === d.candidature_id ? 0.55 : d.stage === 'archive' ? 0.6 : 1 }}>
              <CrmV2Td style={{ verticalAlign: 'top' }}>
                <span {...stop}>
                  <input type="checkbox" aria-label={`Sélectionner ${fullName(d)}`} checked={selected.has(d.candidature_id)} onChange={() => onToggle(d.candidature_id)} />
                </span>
              </CrmV2Td>

              {/* Candidat */}
              <CrmV2Td style={{ verticalAlign: 'top', minWidth: 170, maxWidth: 230 }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {fullName(d)}
                  {d.callback && <PhoneCall size={13} color="#b45309" aria-label="Rappel demandé" />}
                </div>
                <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.email}</div>
                <div style={{ fontSize: 11.5, color: crmV2.textFaint, marginTop: 2 }}>
                  {[d.departement ? `Dép. ${d.departement}` : null, d.profil === 'reorientation' ? 'Réorientation' : d.profil ? 'Terminale' : null, d.moyenne ? `${d.moyenne}/20` : null].filter(Boolean).join(' · ')}
                </div>
                {d.diploma && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#059669', color: '#fff' }}>Diploma · {d.diploma}</span>}
              </CrmV2Td>

              {/* Frise */}
              <CrmV2Td style={{ verticalAlign: 'top', minWidth: 170 }}>
                <Frise stage={d.stage} />
              </CrmV2Td>

              {/* Vœux */}
              <CrmV2Td style={{ verticalAlign: 'top', minWidth: 150, maxWidth: 220 }}>
                {d.filieres.length > 0 && (
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {d.filieres.slice(0, 3).map((f, i) => (
                      <span key={f}>{i > 0 && <span style={{ color: crmV2.textFaint }}> · </span>}<span style={{ fontSize: 10, fontWeight: 700, color: '#4338ca' }}>{i + 1}.</span> {FILIERES[f] ?? f}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                  {d.destinations.map((x, i) => {
                    const s = DEST[x] ?? { flag: '', label: x, bg: crmV2.chipBg, color: crmV2.textMuted }
                    return <span key={x} style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{i + 1}. {s.flag} {s.label}</span>
                  })}
                </div>
                {!d.filieres.length && !d.destinations.length && <span style={{ color: crmV2.textFaint }}>—</span>}
              </CrmV2Td>

              {/* Statut */}
              <CrmV2Td style={{ verticalAlign: 'top' }}>
                {locked || d.status === 'accepte' ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>{isCompte ? 'Pas de candidature' : EDUMOVE_STATUS_LABELS[d.status ?? ''] ?? d.status}</span>
                ) : (
                  <select {...stop} style={sel()} value={d.status ?? 'en_cours'} disabled={!!busy} onChange={e => changeStatus(d, e.target.value)} aria-label="Statut">
                    {!(EDUMOVE_MANUAL_STATUSES as readonly string[]).includes(d.status ?? '') && d.status && <option value={d.status}>{EDUMOVE_STATUS_LABELS[d.status] ?? d.status}</option>}
                    {EDUMOVE_MANUAL_STATUSES.map(s => <option key={s} value={s}>{EDUMOVE_STATUS_LABELS[s]}</option>)}
                  </select>
                )}
              </CrmV2Td>

              {/* Situation */}
              <CrmV2Td style={{ verticalAlign: 'top' }}>
                {locked ? <span style={{ color: crmV2.textFaint }}>—</span> : (
                  <select {...stop} style={sel()} value={d.situation ?? 'nouveau'} disabled={!!busy} aria-label="Situation"
                    onChange={e => void act(d, { type: 'situation', situation: e.target.value }, { situation: e.target.value })}>
                    {EDUMOVE_SITUATIONS.map(s => <option key={s} value={s}>{EDUMOVE_SITUATION_LABELS[s]}</option>)}
                  </select>
                )}
              </CrmV2Td>

              {/* Suivi par fac */}
              <CrmV2Td style={{ verticalAlign: 'top', minWidth: 190 }}>
                {d.facs.length === 0 ? <span style={{ color: crmV2.textFaint }}>—</span> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {d.facs.map(u => {
                      const t = trackingOf(d, u)
                      const choix = (d.uni_selections[u] ?? {}) as { filiereLabel?: string; filiere?: string; ville?: string }
                      const comp = u === 'UE' ? UE_COMPLETION[String(d.tracking.UE_completion ?? 'red')] ?? UE_COMPLETION.red : null
                      return (
                        <div key={u} style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={[choix.filiereLabel ?? (choix.filiere ? FILIERES[choix.filiere] ?? choix.filiere : ''), choix.ville].filter(Boolean).join(' · ')}>
                          {comp && <span title={comp.title} style={{ width: 8, height: 8, borderRadius: 99, background: comp.color, flexShrink: 0 }} />}
                          <span style={{ fontSize: 11, fontWeight: 800, minWidth: 34, color: crmV2.text }}>{u}</span>
                          {d.stage === 'archive' ? (
                            <span style={{ fontSize: 12, color: TRACK_COLOR[t] }}>{EDUMOVE_TRACKING_LABELS[t] ?? t}</span>
                          ) : (
                            <select {...stop} style={sel(TRACK_COLOR[t])} value={t} disabled={!!busy} aria-label={`Suivi ${u}`}
                              onChange={e => {
                                const v = e.target.value
                                void act(d, { type: 'tracking', uni: u, value: v }, {
                                  tracking: { ...d.tracking, [`${u}_status`]: v },
                                  ...(v === 'inscrit' ? { stage: 'inscrit' as const, status: 'accepte' } : {}),
                                })
                              }}>
                              {(EDUMOVE_TRACKING_BY_UNI[u] ?? []).map(o => <option key={o} value={o}>{EDUMOVE_TRACKING_LABELS[o] ?? o}</option>)}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CrmV2Td>

              {/* Pièces */}
              <CrmV2Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {d.facs.length === 0 ? <span style={{ color: crmV2.textFaint }}>—</span>
                  : d.missing.length
                    ? <span title={d.missing.map(k => EDUMOVE_DOCUMENT_LABELS[k] ?? k).join('\n')} style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', cursor: 'help' }}>{d.missing.length} manquante{d.missing.length > 1 ? 's' : ''}</span>
                    : <span style={{ fontSize: 12.5, fontWeight: 700, color: '#047857' }}>Complet</span>}
              </CrmV2Td>

              {/* Activité */}
              <CrmV2Td style={{ verticalAlign: 'top', minWidth: 130 }}>
                {d.stage === 'reponse' || d.stage === 'choix_faits' || d.stage === 'inscrit' ? (
                  d.views > 0 ? (
                    <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                      <div style={{ color: '#059669', fontWeight: 700 }}>✓ Réponse vue</div>
                      <div style={{ color: crmV2.textMuted }}>{d.views} consultation{d.views > 1 ? 's' : ''}{d.viewed_at ? ` · 1re ${ago(d.viewed_at)}` : ''}</div>
                    </div>
                  ) : <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>✗ Réponse pas encore vue</div>
                ) : <span style={{ color: crmV2.textFaint }}>—</span>}
                {d.callback && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, marginTop: 2 }}>📞 Rappel demandé</div>}
              </CrmV2Td>

              {/* Dates */}
              <CrmV2Td style={{ verticalAlign: 'top', fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                <div>{d.created_at ? `${isCompte ? 'Compte' : 'Déposée'} le ${format(new Date(d.created_at), 'd MMM yyyy', { locale: fr })}` : '—'}</div>
                {d.last_change && <div style={{ color: crmV2.textFaint }}>Dernier changement {ago(d.last_change)}</div>}
              </CrmV2Td>
            </CrmV2Tr>
          )
        })}
      </tbody>
    </CrmV2Table>
  )
}

function Frise({ stage }: { stage: EdumoveStage }) {
  if (stage === 'archive') {
    return <span style={{ fontSize: 12, fontWeight: 700, color: STAGE_STYLE.archive.color }}>Archivé</span>
  }
  const idx = FRISE.findIndex(f => f.stage === stage)
  const color = STAGE_STYLE[stage]?.dot ?? crmV2.gold
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {FRISE.map((f, i) => (
          <div key={f.stage} style={{ display: 'flex', alignItems: 'center', flex: i < FRISE.length - 1 ? 1 : '0 0 auto' }}>
            <span title={f.label} style={{
              width: i === idx ? 12 : 9, height: i === idx ? 12 : 9, borderRadius: 99, flexShrink: 0,
              background: i <= idx ? color : crmV2.bg, border: `2px solid ${i <= idx ? color : crmV2.borderStrong}`,
            }} />
            {i < FRISE.length - 1 && <span style={{ flex: 1, height: 2, minWidth: 10, background: i < idx ? color : crmV2.border }} />}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 5, color: STAGE_STYLE[stage]?.color ?? crmV2.text }}>
        {FRISE[idx]?.label ?? stage} <span style={{ fontWeight: 500, color: crmV2.textFaint }}>· {idx + 1}/5</span>
      </div>
    </div>
  )
}
