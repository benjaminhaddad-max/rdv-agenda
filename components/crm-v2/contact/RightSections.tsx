'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  AlertTriangle, Archive, BookOpen, Briefcase, Calendar, CalendarPlus, Check, Copy, FileText, FlaskConical, Globe,
  GraduationCap, MonitorSmartphone, Pencil, Plus, SquareCheckBig, Target,
} from 'lucide-react'
import { CrmV2Button, CrmV2Section, CrmV2StatusPill, hexA } from '@/components/crm-v2/primitives'
import { STATUS_CONFIG } from '@/components/StatusBadge'
import { crmV2, crmV2ActivityColors } from '@/lib/crm-v2-theme'
import { getStageMeta } from '@/lib/crm-stages'
import { isMediboxBrand } from '@/lib/rdv-brand'
import { appName, appSessionCompletedCount, appSessionSeconds, type AppActivitySession } from '@/lib/app-activity'
import type { Any, CRMTask, FormSubmission, Owner, ParcoursupPayload, ParcoursupQ3Voeu, PreInscription, WebActivity } from './types'
import { formatSeconds, scoreOf, visitSourceLabel } from './utils'

const ICON = 14

/** Clé de mémorisation repliée/dépliée (mêmes clés que l'ancienne fiche). */
const key = (title: string) => `rs-open:${title}`

const empty: CSSProperties = {
  fontSize: 12, color: crmV2.textFaint, textAlign: 'center', padding: '14px 8px',
  border: `1px dashed ${crmV2.border}`, borderRadius: 12,
}
const kv: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }
const kvLabel: CSSProperties = { color: crmV2.textMuted, flexShrink: 0 }
const kvValue: CSSProperties = { fontWeight: 600, color: crmV2.text, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }
const softBox: CSSProperties = { background: crmV2.bgHover, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }
const miniTile: CSSProperties = { background: crmV2.bgHover, borderRadius: 8, padding: '6px 0', textAlign: 'center' }

function KV({ label, value, color, title }: { label: ReactNode; value: ReactNode; color?: string; title?: string }) {
  return (
    <div style={kv}>
      <span style={kvLabel}>{label}</span>
      <span style={{ ...kvValue, ...(color ? { color } : {}) }} title={title}>{value}</span>
    </div>
  )
}

function Tile({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <div style={miniTile}>
      <div style={{ fontSize: 14, fontWeight: 700, color: color ?? crmV2.text }}>{value}</div>
      <div style={{ fontSize: 10, color: crmV2.textMuted }}>{label}</div>
    </div>
  )
}

function AddButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} style={{
      width: 26, height: 26, borderRadius: 999, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg,
      color: crmV2.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
    }}>
      <Plus size={13} />
    </button>
  )
}

/* ───────── Tâches ───────── */

export function TasksSection({ tasks, owners, onUpdated, onAdd }: {
  tasks: CRMTask[]
  owners: Owner[]
  onUpdated: () => void
  onAdd: () => void
}) {
  const [nowMs] = useState(() => Date.now())
  const ownerLabel = (id?: string | null) => {
    if (!id) return ''
    const o = owners.find(o => o.hubspot_owner_id === id)
    if (!o) return id
    return [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || id
  }
  const completeTask = async (id: number) => {
    await fetch(`/api/crm/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    onUpdated()
  }
  const priority: Record<string, { label: string; color: string }> = {
    low: { label: 'Basse', color: crmV2.textMuted },
    high: { label: 'Haute', color: '#c2410c' },
    urgent: { label: 'Urgent', color: '#b91c1c' },
  }

  return (
    <CrmV2Section
      title="Tâches"
      icon={<SquareCheckBig size={ICON} />}
      count={tasks.length}
      storageKey={key('Tâches')}
      actions={<AddButton title="Créer une tâche" onClick={onAdd} />}
    >
      {tasks.length === 0 ? (
        <div style={empty}>Aucune tâche en cours.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map(t => {
            const overdue = !!t.due_at && new Date(t.due_at).getTime() < nowMs
            const p = priority[t.priority]
            const meta = [
              t.due_at ? format(new Date(t.due_at), "EEE d MMM · HH:mm", { locale: fr }) : null,
              t.owner_id ? ownerLabel(t.owner_id) : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <button
                  type="button"
                  onClick={() => completeTask(t.id)}
                  title="Marquer comme terminée"
                  aria-label="Marquer comme terminée"
                  style={{
                    width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${crmV2.borderStrong}`, background: crmV2.bg,
                    flexShrink: 0, marginTop: 1, cursor: 'pointer', padding: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text }}>{t.title}</div>
                  {t.description && (
                    <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {t.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, marginTop: 2, color: overdue ? crmV2.danger : crmV2.textMuted, fontWeight: overdue ? 600 : 500, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p && <span style={{ color: p.color, fontWeight: 700 }}>{p.label}</span>}
                    {meta && <span>{meta}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CrmV2Section>
  )
}

/* ───────── Transactions ───────── */

export function DealsSection({ deals, stageLabel, pipelineLabel, ownerLabel }: {
  deals: Array<Record<string, Any>>
  stageLabel: (v?: string | null) => string
  pipelineLabel: (v?: string | null) => string
  ownerLabel: (id?: string | null) => string
}) {
  return (
    <CrmV2Section title="Transactions" icon={<Briefcase size={ICON} />} count={deals.length} storageKey={key('Transactions')}>
      {deals.length === 0 ? (
        <div style={empty}>Aucune transaction.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {deals.map(d => <DealCard key={d.hubspot_deal_id as string} deal={d} stageLabel={stageLabel} pipelineLabel={pipelineLabel} ownerLabel={ownerLabel} />)}
        </div>
      )}
    </CrmV2Section>
  )
}

export function DealCard({ deal, stageLabel, pipelineLabel, ownerLabel }: {
  deal: Record<string, Any>
  stageLabel: (v?: string | null) => string
  pipelineLabel: (v?: string | null) => string
  ownerLabel: (id?: string | null) => string
}) {
  const meta = getStageMeta(String(deal.dealstage ?? ''))
  const label = meta?.label ?? stageLabel(deal.dealstage as string)
  const people = [
    deal.hubspot_owner_id ? `Propriétaire : ${ownerLabel(deal.hubspot_owner_id as string)}` : null,
    deal.teleprospecteur ? `Télépro : ${ownerLabel(deal.teleprospecteur as string)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px' }}>
      <Link href={`/admin/crm/deals/${deal.hubspot_deal_id}`} style={{ fontSize: 13, fontWeight: 700, color: crmV2.link, textDecoration: 'none' }}>
        {deal.dealname || '(sans nom)'}
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <CrmV2StatusPill label={label} color={meta?.color ?? crmV2.textMuted} bg={meta?.bg} />
        <span style={{ fontSize: 11, color: crmV2.textFaint }}>{pipelineLabel(deal.pipeline as string)}</span>
      </div>
      {deal.formation && <div style={{ fontSize: 12, color: crmV2.text, marginTop: 6 }}>{deal.formation as string}</div>}
      {(people || deal.createdate) && (
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
          {people}
          {people && deal.createdate ? ' · ' : ''}
          {deal.createdate ? `Créée le ${format(new Date(deal.createdate as string), 'd MMM yyyy', { locale: fr })}` : ''}
        </div>
      )}
    </div>
  )
}

/* ───────── Archive télépro / closer (admins) ───────── */

export function AssignmentArchiveSection({ rows, ownerLabel }: {
  rows: Array<Record<string, Any>>
  ownerLabel: (id?: string | null) => string
}) {
  if (rows.length === 0) return null
  return (
    <CrmV2Section title="Archive télépro / closer" icon={<Archive size={ICON} />} count={rows.length} storageKey={key('Archive attributions')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.campagne as string} style={softBox}>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.text }}>Campagne {r.campagne as string}</div>
            <KV label="Télépro" value={ownerLabel((r.telepro_user_id ?? r.teleprospecteur) != null ? String(r.telepro_user_id ?? r.teleprospecteur) : null)} />
            <KV label="Closer du contact" value={ownerLabel(r.closer_du_contact_owner_id as string | null)} />
            <KV label="Propriétaire" value={ownerLabel(r.hubspot_owner_id as string | null)} />
            {r.motif && <div style={{ fontSize: 11, color: crmV2.textMuted }}>{r.motif as string}</div>}
            <div style={{ fontSize: 11, color: crmV2.textFaint }}>
              Archivé le {format(new Date(r.archived_at as string), 'd MMM yyyy', { locale: fr })}
            </div>
          </div>
        ))}
      </div>
    </CrmV2Section>
  )
}

/* ───────── Rendez-vous ───────── */

export function AppointmentsSection({ appointments, isLinova, onSchedule, ownerLabel }: {
  appointments: Array<Record<string, Any>>
  isLinova: boolean
  onSchedule: () => void
  ownerLabel: (id?: string | null) => string
}) {
  const [nowMs] = useState(() => Date.now())
  return (
    <CrmV2Section title="Rendez-vous" icon={<Calendar size={ICON} />} count={appointments.length} storageKey={key('Rendez-vous')}>
      <CrmV2Button variant="accent" size="sm" icon={<CalendarPlus size={14} />} onClick={onSchedule} style={{ width: '100%', marginBottom: 10 }}>
        {isLinova ? 'Programmer RDV admission Linova' : 'Programmer un rendez-vous'}
      </CrmV2Button>
      {appointments.length === 0 ? (
        <div style={empty}>Aucun RDV.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {appointments.map(a => {
            const start = a.start_at ? new Date(a.start_at as string) : null
            const end = a.end_at ? new Date(a.end_at as string) : null
            const upcoming = !!start && start.getTime() >= nowMs
            const st = (STATUS_CONFIG as Record<string, { label: string; color: string; bg: string }>)[String(a.status ?? '')]
            const closer = a.commercial_id ? ownerLabel(a.commercial_id as string) : null
            const medibox = isMediboxBrand(a.brand)
            return (
              <div key={a.id as string} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{
                  width: 42, height: 46, borderRadius: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: upcoming ? crmV2.goldSoft : crmV2.bgSoft,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: upcoming ? crmV2.goldDark : crmV2.textMuted }}>
                    {start ? format(start, 'EEE', { locale: fr }).replace('.', '') : '—'}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1, color: upcoming ? crmV2.goldDark : crmV2.textMuted }}>
                    {start ? format(start, 'd') : ''}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {start ? format(start, 'd MMM yyyy', { locale: fr }) : 'Date inconnue'}
                    {medibox && <span style={{ background: crmV2ActivityColors.mediboxBrand, color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: 10, fontWeight: 700 }}>Medibox</span>}
                  </div>
                  <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                    {start ? format(start, 'HH:mm') : ''}{end ? ` – ${format(end, 'HH:mm')}` : ''}
                    {closer && closer !== a.commercial_id ? ` · ${closer}` : ''}
                  </div>
                  {a.status && (
                    <span style={{
                      display: 'inline-block', marginTop: 3, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                      background: st?.bg ?? crmV2.bgSoft, color: st?.color ?? crmV2.textMuted,
                    }}>{st?.label ?? String(a.status)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CrmV2Section>
  )
}

/* ───────── Formulaires soumis ───────── */

export function FormsSection({ forms }: { forms: FormSubmission[] }) {
  return (
    <CrmV2Section title="Formulaires soumis" icon={<FileText size={ICON} />} count={forms.length} storageKey={key('Formulaires soumis')}>
      {forms.length === 0 ? (
        <div style={empty}>Aucune soumission.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {forms.slice(0, 10).map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{f.form_title || f.form_id}</span>
              <span style={{ color: crmV2.textFaint, fontSize: 12, whiteSpace: 'nowrap' }}>{format(new Date(f.submitted_at), 'd MMM yyyy', { locale: fr })}</span>
            </div>
          ))}
        </div>
      )}
    </CrmV2Section>
  )
}

/* ───────── Inscription par saison + Parcoursup ───────── */

function inscriptionStatus(pi: PreInscription, formStarted: boolean, finalisationStep: number) {
  const s = pi.paiement_status
  const amber = '#b45309'
  if (s === 'archivee') return { label: 'Inscription finalisée', color: '#047857', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' }
  if (s === 'en_cours' && formStarted) return { label: 'Finalisation – lien rempli', color: crmV2.goldDark, bg: crmV2.goldSoft, dot: crmV2.gold }
  if (s === 'en_cours') return { label: 'Finalisation – lien envoyé', color: amber, bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' }
  // payee + finalisation_step>0 = onglet « En finalisation » côté plateforme
  if (s === 'payee' && finalisationStep > 0 && formStarted) return { label: 'Finalisation – lien rempli', color: crmV2.goldDark, bg: crmV2.goldSoft, dot: crmV2.gold }
  if (s === 'payee' && finalisationStep > 0) return { label: 'Finalisation – lien envoyé', color: amber, bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' }
  if (s === 'payee') return { label: 'Pré-inscrit', color: '#047857', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' }
  if (s === 'en_attente') return { label: 'En attente paiement', color: amber, bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' }
  if (s === 'brouillon') return { label: 'Brouillon', color: crmV2.textMuted, bg: crmV2.bgSoft, dot: crmV2.textFaint }
  if (s === 'annulee') return { label: 'Inscription annulée', color: '#b91c1c', bg: 'rgba(239,68,68,0.10)', dot: '#ef4444' }
  return { label: 'En attente données…', color: crmV2.textMuted, bg: crmV2.bgSoft, dot: crmV2.borderStrong }
}

export function InscriptionSections({ pi, onEditParcoursup }: {
  pi: PreInscription
  onEditParcoursup: (data: ParcoursupPayload) => void
}) {
  // Titre court (26-27 au lieu de 2026-2027) pour rester sur 1 ligne
  const yyShort = pi.saison.split('-').map(y => y.slice(2)).join('-')
  const ext = pi.external_data || {}
  const finalisationStep = Number(ext.finalisation_step ?? 0)
  const paidAt = ext.paid_at as string | undefined
  const acompteEuros = Number(ext.amount_paid_cents ?? 0) / 100
  // « Lien rempli » côté plateforme = étape 1 du formulaire de finalisation soumise
  const finData = (ext.finalisation_data as Record<string, unknown> | null | undefined) ?? null
  const formStarted = !!finData?.fin_echeances
  const parcoursupData = ((ext.parcoursup_crm_override as ParcoursupPayload | undefined) ?? (ext.parcoursup as ParcoursupPayload | undefined)) ?? {}
  // Bloc visible pour toute pré-inscription 26-27 (même sans formulaire rempli).
  const showParcoursup2026 = pi.saison === '2026-2027'
  const status = inscriptionStatus(pi, formStarted, finalisationStep)

  return (
    <>
      <CrmV2Section title={`Inscription ${yyShort}`} icon={<GraduationCap size={ICON} />} count={1} storageKey={key(`Inscription ${yyShort}`)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: status.bg, color: status.color, fontSize: 12, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.dot, flexShrink: 0 }} />
            {status.label}
          </div>
          {pi.formation && (
            <div>
              <div style={{ fontSize: 12, color: crmV2.textMuted }}>Formation</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pi.formation}</div>
            </div>
          )}
          {(pi.montant != null || acompteEuros > 0) && (
            <div style={softBox}>
              {pi.montant != null && <KV label="Total formule" value={`${Number(pi.montant).toLocaleString('fr-FR')} €`} />}
              {acompteEuros > 0 && <KV label="Acompte payé" value={`${acompteEuros.toLocaleString('fr-FR')} €`} color="#047857" />}
              {paidAt && <KV label="Date paiement" value={format(new Date(paidAt), 'd MMM yyyy', { locale: fr })} />}
              {ext.payment_method && (
                <KV label="Méthode" value={<span style={{ textTransform: 'capitalize' }}>{String(ext.payment_method).replace(/_/g, ' ')}</span>} />
              )}
            </div>
          )}
          {pi.notes && (
            <div>
              <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, background: '#fdf6e3', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap' }}>{pi.notes}</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: crmV2.textFaint, borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 8 }}>
            <span>Détectée le {format(new Date(pi.detected_at), 'd MMM yyyy', { locale: fr })}</span>
            {ext.inscription_id && <span title="ID plateforme">{String(ext.inscription_id).slice(0, 8)}…</span>}
          </div>
        </div>
      </CrmV2Section>

      {showParcoursup2026 && (
        <CrmV2Section title="Parcoursup 2026" icon={<GraduationCap size={ICON} />} count={1} storageKey={key('Parcoursup 2026')}>
          <ParcoursupSummary
            data={parcoursupData}
            inscriptionId={ext.inscription_id as string | undefined}
            onEdit={() => {
              const clone = (typeof globalThis.structuredClone === 'function')
                ? globalThis.structuredClone(parcoursupData)
                : JSON.parse(JSON.stringify(parcoursupData))
              onEditParcoursup(clone)
            }}
          />
        </CrmV2Section>
      )}
    </>
  )
}

function parcoursupVerdictColor(status?: string | null): string {
  const v = String(status || '').toLowerCase()
  if (v === 'ok_valide') return '#16a34a'
  if (v === 'ok_attente') return '#0369a1'
  if (v === 'good') return '#15803d'
  if (v === 'attention') return '#b45309'
  if (v === 'bascule') return '#b91c1c'
  return crmV2.textMuted
}

export function normalizedParcoursup(data: ParcoursupPayload): ParcoursupPayload {
  const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []
    return value.map(v => String(v || '').trim()).filter(Boolean)
  }
  const toVoeuxArray = (value: unknown): ParcoursupQ3Voeu[] => {
    if (!Array.isArray(value)) return []
    return value.filter(v => !!v && typeof v === 'object').map(v => v as ParcoursupQ3Voeu)
  }
  return {
    verdict: (data.verdict && typeof data.verdict === 'object') ? data.verdict : {},
    voeux_alert: {
      flagged: !!data.voeux_alert?.flagged,
      formations: toStringArray(data.voeux_alert?.formations),
    },
    q1: {
      proposition: data.q1?.proposition ?? null,
      formations: toStringArray(data.q1?.formations),
      va_valider: data.q1?.va_valider ?? null,
    },
    q3: { voeux: toVoeuxArray(data.q3?.voeux) },
    updated_at: data.updated_at ?? null,
  }
}

function ParcoursupSummary({ data, inscriptionId, onEdit }: { data: ParcoursupPayload; inscriptionId?: string; onEdit: () => void }) {
  const p = normalizedParcoursup(data)
  const verdictColor = parcoursupVerdictColor(p.verdict?.status)
  const formations = p.q1?.formations ?? []
  const voeux = p.q3?.voeux ?? []
  const flaggedFormations = (p.voeux_alert?.formations ?? []).filter(Boolean)
  const link = inscriptionId ? `https://admission.diploma-sante.fr/#/parcoursup/${inscriptionId}` : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ background: hexA(verdictColor, 0.12), color: verdictColor, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
          {p.verdict?.label || 'En attente de verdict'}
        </span>
        <button type="button" onClick={onEdit} style={{
          appearance: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: crmV2.link, display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Pencil size={12} /> Modifier
        </button>
      </div>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: crmV2.link, overflowWrap: 'anywhere', textDecoration: 'none' }}>{link}</a>
      )}
      <KV label="Proposition reçue ?" value={<span style={{ textTransform: 'capitalize' }}>{p.q1?.proposition || '—'}</span>} />
      <KV label="Validera" value={p.q1?.va_valider || '—'} />
      {formations.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Formations avec proposition</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {formations.map((f, idx) => (
              <span key={`${f}-${idx}`} style={{ background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, color: crmV2.goldDark, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{f}</span>
            ))}
          </div>
        </div>
      )}
      {voeux.slice(0, 8).map((v, idx) => (
        <div key={`voeu-${idx}`} style={kv}>
          <span style={kvLabel}>Vœu {idx + 1}</span>
          <span style={kvValue}>
            {[v.formation, v.mineure].filter(Boolean).join(' · ') || '—'}
            {(v.rang != null || v.rang_dernier_admis != null) && (
              <span style={{ display: 'block', fontWeight: 500, color: crmV2.textMuted, fontSize: 11 }}>
                Rang {v.rang ?? '—'} · dernier admis {v.rang_dernier_admis ?? '—'}
              </span>
            )}
          </span>
        </div>
      ))}
      {!!p.voeux_alert?.flagged && (
        <div style={{ borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', padding: '8px 10px', color: '#b91c1c', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <AlertTriangle size={13} /> Vœux à vérifier
          </div>
          {flaggedFormations.length > 0 && <div style={{ marginTop: 4 }}>{flaggedFormations.join(', ')}</div>}
        </div>
      )}
      {p.updated_at && (
        <div style={{ fontSize: 11, color: crmV2.textFaint, textAlign: 'right' }}>
          Mis à jour le {(() => {
            try { return format(new Date(p.updated_at as string), 'dd/MM/yyyy HH:mm', { locale: fr }) } catch { return String(p.updated_at) }
          })()}
        </div>
      )}
    </div>
  )
}

/* ───────── Plateformes (Diplomalab, Medibox Lab) ───────── */

const LESSON_EVENTS = new Set(['lesson_viewed', 'lesson_completed', 'video_watched', 'flashcards_reviewed'])

export function PlatformsSection({ sessions }: { sessions: AppActivitySession[] }) {
  if (sessions.length === 0) return null
  const byApp = new Map<string, AppActivitySession[]>()
  for (const s of sessions) byApp.set(s.app, [...(byApp.get(s.app) ?? []), s])
  const apps = [...byApp.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <CrmV2Section title="Plateformes" icon={<MonitorSmartphone size={ICON} />} count={apps.length} storageKey={key('Plateformes')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {apps.map(([app, list]) => {
          const isMedibox = app === 'mediboxlab'
          const last = list.reduce((acc, s) => (s.started_at > acc ? s.started_at : acc), list[0].started_at)
          const done = list.reduce((acc, s) => acc + appSessionCompletedCount(s), 0)
          const lessons = list.reduce((acc, s) => acc + s.events.filter(e => LESSON_EVENTS.has(e.event)).length, 0)
          const seconds = list.reduce((acc, s) => acc + appSessionSeconds(s), 0)
          const scores = list.flatMap(s => s.events.map(e => scoreOf(e.details))).filter((x): x is NonNullable<ReturnType<typeof scoreOf>> => !!x && x.good !== null)
          const rate = scores.length > 0 ? Math.round((scores.filter(x => x.good).length / scores.length) * 100) : null
          // Exercices + réussite quand l'app en envoie, sinon cours vus + temps
          const showExercises = done > 0 || !isMedibox
          return (
            <div key={app} style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                  {isMedibox
                    ? <BookOpen size={14} color={crmV2ActivityColors.mediboxBrand} />
                    : <FlaskConical size={14} color={crmV2ActivityColors.diplomalab} />}
                  {appName(app)}
                </span>
                <span style={{ fontSize: 11, color: crmV2.textFaint }}>{format(new Date(last), 'd MMM · HH:mm', { locale: fr })}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                <Tile value={list.length} label={`session${list.length > 1 ? 's' : ''}`} />
                {showExercises
                  ? <Tile value={done} label="exercices" />
                  : <Tile value={lessons} label="cours vus" />}
                {showExercises && rate !== null
                  ? <Tile value={`${rate} %`} label="réussite" color={rate >= 50 ? crmV2.successStrong : '#b91c1c'} />
                  : <Tile value={formatSeconds(seconds)} label="au total" />}
              </div>
            </div>
          )
        })}
      </div>
    </CrmV2Section>
  )
}

/* ───────── Tracking publicitaire ───────── */

interface TrackingId { key: string; label: string }
interface TrackingSource {
  id: 'google' | 'meta' | 'bing' | 'linkedin' | 'tiktok' | 'snapchat'
  label: string
  color: string
  ids: TrackingId[]
  /** Propriété booléenne : « le lead a cliqué sur une pub de ce réseau » */
  clickedKey?: string
}

const AD_SOURCES: TrackingSource[] = [
  { id: 'google', label: 'Google Ads', color: '#4285f4', ids: [{ key: 'gclid', label: 'gclid' }, { key: 'hs_google_click_id', label: 'Google Click ID' }], clickedKey: 'hs_google_ad_clicked' },
  { id: 'meta', label: 'Meta · Facebook / Instagram', color: '#1877f2', ids: [{ key: 'fbclid', label: 'fbclid' }, { key: 'hs_facebook_click_id', label: 'Facebook Click ID' }], clickedKey: 'hs_facebook_ad_clicked' },
  { id: 'bing', label: 'Microsoft Ads (Bing)', color: '#00809d', ids: [{ key: 'hs_bing_click_id', label: 'Bing Click ID' }], clickedKey: 'hs_bing_ad_clicked' },
  { id: 'linkedin', label: 'LinkedIn Ads', color: '#0a66c2', ids: [{ key: 'hs_linkedin_click_id', label: 'LinkedIn Click ID' }], clickedKey: 'hs_linkedin_ad_clicked' },
  { id: 'tiktok', label: 'TikTok Ads', color: '#111827', ids: [{ key: 'hs_tiktok_click_id', label: 'TikTok Click ID' }], clickedKey: 'hs_tiktok_ad_clicked' },
  { id: 'snapchat', label: 'Snapchat Ads', color: '#a16207', ids: [{ key: 'lead_id_snapchat', label: 'Snapchat Lead ID' }] },
]

const UTM_FIELDS: TrackingId[] = [
  { key: 'utm_source', label: 'Source' },
  { key: 'utm_medium', label: 'Medium' },
  { key: 'utm_campaign', label: 'Campagne' },
  { key: 'utm_content', label: 'Content' },
  { key: 'utm_term', label: 'Term' },
]

const CAMPAIGN_FIELDS: TrackingId[] = [
  { key: 'hs_analytics_first_touch_converting_campaign', label: 'Premier contact' },
  { key: 'hs_analytics_last_touch_converting_campaign', label: 'Dernier contact' },
]

function rawString(raw: Record<string, unknown> | null | undefined, k: string): string | null {
  if (!raw) return null
  const v = raw[k]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function rawBool(raw: Record<string, unknown> | null | undefined, k: string): boolean {
  const s = rawString(raw, k)
  return !!s && (s === 'true' || s === '1')
}

/** Visible uniquement si au moins une donnée d'attribution est présente. */
export function AdTrackingSection({ raw }: { raw: Record<string, unknown> | null | undefined }) {
  const sourcesPresent = AD_SOURCES
    .map(src => ({
      src,
      ids: src.ids.map(i => ({ ...i, value: rawString(raw, i.key) })).filter(i => !!i.value),
      clicked: src.clickedKey ? rawBool(raw, src.clickedKey) : false,
    }))
    .filter(s => s.ids.length > 0 || s.clicked)
  const utms = UTM_FIELDS.map(f => ({ ...f, value: rawString(raw, f.key) })).filter(f => !!f.value)
  const campaigns = CAMPAIGN_FIELDS.map(f => ({ ...f, value: rawString(raw, f.key) })).filter(f => !!f.value)
  const totalCount = sourcesPresent.reduce((acc, s) => acc + s.ids.length, 0) + utms.length + campaigns.length
  if (totalCount === 0) return null

  return (
    <CrmV2Section title="Tracking publicitaire" icon={<Target size={ICON} />} count={totalCount} storageKey={key('Tracking publicitaire')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sourcesPresent.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sourcesPresent.map(({ src, clicked }) => (
              <span key={src.id} style={{ background: src.color, color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                {src.label}{clicked ? ' · pub cliquée' : ''}
              </span>
            ))}
          </div>
        )}
        {sourcesPresent.flatMap(({ ids }) => ids).map(i => (
          <CopyableId key={i.key} label={i.label} value={i.value as string} />
        ))}
        {utms.length > 0 && (
          <div style={softBox}>
            {utms.map(u => <KV key={u.key} label={u.label} value={u.value} title={u.value as string} />)}
          </div>
        )}
        {campaigns.length > 0 && (
          <div style={softBox}>
            {campaigns.map(c => <KV key={c.key} label={`Campagne · ${c.label}`} value={c.value} title={c.value as string} />)}
          </div>
        )}
      </div>
    </CrmV2Section>
  )
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* silencieux */ }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: crmV2.textFaint }}>{label}</div>
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, wordBreak: 'break-all' }} title={value}>{value}</div>
      </div>
      <button type="button" onClick={onCopy} title="Copier" aria-label="Copier" style={{
        width: 26, height: 26, borderRadius: 8, border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.textMuted,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
      }}>
        {copied ? <Check size={12} color={crmV2.successStrong} /> : <Copy size={12} />}
      </button>
    </div>
  )
}

/* ───────── Parcours web ───────── */

export function WebActivitySection({ data }: { data: WebActivity | null }) {
  if (!data?.totals || data.visits.length === 0) return null
  const { totals, first_touch: first } = data
  const dt = (iso: string) => format(new Date(iso), 'dd/MM/yyyy · HH:mm', { locale: fr })

  return (
    <CrmV2Section title="Parcours web" icon={<Globe size={ICON} />} count={totals.page_views} storageKey={key('Parcours web')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <Tile value={totals.visits} label={`visite${totals.visits > 1 ? 's' : ''}`} />
          <Tile value={totals.page_views} label="pages vues" />
          <Tile value={formatSeconds(totals.seconds)} label="sur le site" />
        </div>
        {first && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <KV label="1re visite" value={dt(first.at)} />
            {totals.last_seen && <KV label="Dernière visite" value={dt(totals.last_seen)} />}
            <KV label="Source" value={visitSourceLabel(first)} />
            {first.utm_campaign && <KV label="Campagne" value={first.utm_campaign} title={first.utm_campaign} />}
            {first.landing_path && <KV label="Page d’entrée" value={first.landing_path} title={first.landing_path} />}
            {first.device && <KV label="Appareil" value={first.device} />}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: `1px solid ${crmV2.borderLight}` }}>
          {data.visits.slice(0, 10).map(v => (
            <div key={v.session_id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                  {format(new Date(v.started_at), 'd MMM', { locale: fr })} · {format(new Date(v.started_at), 'HH:mm')}–{format(new Date(v.ended_at), 'HH:mm')}
                </span>
                <span style={{ fontSize: 10, color: crmV2.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {visitSourceLabel(v)} · {formatSeconds(v.total_seconds)}
                </span>
              </div>
              <div style={{ marginTop: 3, paddingLeft: 8, borderLeft: `2px solid ${crmV2.goldBorder}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {v.pages.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                    <a href={p.url ?? undefined} target="_blank" rel="noopener noreferrer" title={p.title ?? p.url ?? ''}
                      style={{ color: crmV2.text, textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, color: crmV2.textFaint, marginRight: 4 }}>{format(new Date(p.at), 'HH:mm')}</span>
                      {p.path || p.title || p.url}
                      {p.submitted_form && (
                        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, background: 'rgba(22,163,74,0.10)', color: '#15803d', borderRadius: 999, padding: '0 6px' }}>formulaire</span>
                      )}
                    </a>
                    <span style={{ flexShrink: 0, fontSize: 10, color: crmV2.textMuted }}>{p.seconds !== null ? formatSeconds(p.seconds) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.visits.length > 10 && (
            <div style={{ fontSize: 11, color: crmV2.textFaint }}>+ {data.visits.length - 10} visites plus anciennes</div>
          )}
        </div>
      </div>
    </CrmV2Section>
  )
}
