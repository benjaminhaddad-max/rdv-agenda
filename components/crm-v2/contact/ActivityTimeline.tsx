'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  BookOpen, Calendar, ChevronDown, FileText, FlaskConical, Globe, Mail, MessageSquare, Pencil, Phone,
  Plus, SquareCheckBig, StickyNote, Trash2, TrendingUp, User, Video,
} from 'lucide-react'
import type { QuickActionType } from '@/components/crm/QuickActionModal'
import { stripAircallRecordingLinks } from '@/components/crm/AircallRecordingPlayer'
import { CrmV2Button, CrmV2Search } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { appEventLabel, type AppActivitySession } from '@/lib/app-activity'
import AircallPlayerV2 from './AircallPlayerV2'
import type { EmailCampaignLink, EmailStats, SMSLink, TimelineItem, TimelineTab, WebActivityVisit } from './types'
import { activityBg, activityColor, formatSeconds, hm, hms, sanitize, scoreOf, stripEmoji, toneStyle, type Tone } from './utils'

export function timelineTabToQuickAction(tab: TimelineTab): QuickActionType | null {
  const map: Partial<Record<TimelineTab, QuickActionType>> = {
    all: 'note',
    note: 'note',
    email: 'email',
    call: 'call',
    task: 'task',
    meeting: 'meeting',
  }
  return map[tab] ?? null
}

export const TIMELINE_ADD_LABELS: Record<QuickActionType, string> = {
  note: 'Ajouter une note',
  email: 'Logger un e-mail',
  call: 'Logger un appel',
  task: 'Créer une tâche',
  meeting: 'Logger une réunion',
}

const TABS: Array<{ id: TimelineTab; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'note', label: 'Notes' },
  { id: 'email', label: 'E-mails' },
  { id: 'sms', label: 'SMS' },
  { id: 'call', label: 'Appels' },
  { id: 'task', label: 'Tâches' },
  { id: 'meeting', label: 'Réunions' },
  { id: 'app', label: 'Applis' },
]

function inTab(t: TimelineItem, tab: TimelineTab) {
  if (tab === 'all') return true
  if (tab === 'meeting') return t.type === 'meeting' || t.type === 'rdv'
  return t.type === tab
}

/** Colonne centrale « Activité » : onglets, recherche, regroupement par mois, cartes. */
export default function ActivityTimeline({
  timeline, appTabLabel, tab, onTabChange, search, onSearchChange, onAdd, ownerLabel,
  onSaveNote, onDeleteNote, savingNote, compact = false,
}: {
  timeline: TimelineItem[]
  appTabLabel: string
  tab: TimelineTab
  onTabChange: (t: TimelineTab) => void
  search: string
  onSearchChange: (v: string) => void
  onAdd: (a: QuickActionType) => void
  ownerLabel: (id?: string | null) => string
  onSaveNote: (activityId: string, subject: string, body: string) => Promise<boolean>
  onDeleteNote: (activityId: string) => void
  savingNote: boolean
  /** Mobile : pas de carte englobante, contenu dans le flux */
  compact?: boolean
}) {
  const filtered = timeline.filter(t => inTab(t, tab)).filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return t.title.toLowerCase().includes(s)
      || (t.body ?? '').toLowerCase().includes(s)
      || (t.subtitle ?? '').toLowerCase().includes(s)
      || (t.searchText ?? '').toLowerCase().includes(s)
  })

  const grouped: Array<{ month: string; items: TimelineItem[] }> = []
  for (const it of filtered) {
    const key = format(new Date(it.timestamp), 'MMMM yyyy', { locale: fr })
    let g = grouped.find(x => x.month === key)
    if (!g) grouped.push(g = { month: key, items: [] })
    g.items.push(it)
  }

  const addAction = timelineTabToQuickAction(tab)
  const plusAction: QuickActionType = addAction ?? 'note'

  const tabsRow = (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0, background: crmV2.bg }}>
      <div style={{ display: 'flex', padding: '0 6px', overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0 }}>
        {TABS.map(t => {
          const active = t.id === tab
          const count = timeline.filter(x => inTab(x, t.id)).length
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              style={{
                appearance: 'none', background: 'none', border: 'none',
                borderBottom: active ? `3px solid ${crmV2.text}` : '3px solid transparent',
                marginBottom: -1, padding: compact ? '12px 9px' : '12px 10px', whiteSpace: 'nowrap', flexShrink: 0,
                fontSize: 13, fontWeight: active ? 700 : 500, color: active ? crmV2.text : crmV2.textMuted,
                cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
              }}
            >
              {t.id === 'app' ? appTabLabel : t.label}
              <span style={{ marginLeft: 5, fontSize: 11, color: crmV2.textFaint, fontWeight: 600 }}>{count}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => onAdd(plusAction)}
        title={TIMELINE_ADD_LABELS[plusAction]}
        aria-label={TIMELINE_ADD_LABELS[plusAction]}
        style={{
          flexShrink: 0, marginRight: 8, width: compact ? 36 : 30, height: compact ? 36 : 30, borderRadius: 999,
          border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Plus size={15} />
      </button>
    </div>
  )

  const searchRow = (
    <div style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0, background: crmV2.bg }}>
      <CrmV2Search
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Rechercher dans la timeline…"
        style={{ background: crmV2.bgHover, borderColor: crmV2.border, minWidth: 0 }}
      />
    </div>
  )

  const list = filtered.length === 0 ? (
    <EmptyTimeline
      filtered={timeline.length > 0}
      onAdd={addAction ? () => onAdd(addAction) : undefined}
      addLabel={addAction ? TIMELINE_ADD_LABELS[addAction] : undefined}
    />
  ) : (
    grouped.map(g => (
      <div key={g.month} style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: crmV2.textFaint, padding: '4px 0 10px',
        }}>{g.month}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {g.items.map(t => (
            <TimelineCard
              key={t.id}
              t={t}
              ownerLabel={ownerLabel}
              onSaveNote={onSaveNote}
              onDeleteNote={onDeleteNote}
              savingNote={savingNote}
            />
          ))}
        </div>
      </div>
    ))
  )

  if (compact) {
    return (
      <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflow: 'hidden' }}>
        {tabsRow}
        {searchRow}
        <div style={{ padding: '12px 12px 16px', background: crmV2.bg }}>{list}</div>
      </div>
    )
  }

  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowRecord,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {tabsRow}
      {searchRow}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 20px' }}>{list}</div>
    </div>
  )
}

function TypeIcon({ t }: { t: TimelineItem }) {
  const app = t.appSession?.app
  const size = 15
  const icon: Record<string, ReactNode> = {
    note: <StickyNote size={size} />,
    call: <Phone size={size} />,
    email: <Mail size={size} />,
    sms: <MessageSquare size={size} />,
    meeting: <Video size={size} />,
    rdv: <Calendar size={size} />,
    form: <FileText size={size} />,
    web: <Globe size={size} />,
    task: <SquareCheckBig size={size} />,
    app: app === 'mediboxlab' ? <BookOpen size={size} /> : <FlaskConical size={size} />,
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', background: activityBg(t.type, app), color: activityColor(t.type, app),
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon[t.type] ?? icon.note}
    </div>
  )
}

function Chip({ label, tone, title }: { label: ReactNode; tone: Tone; title?: string }) {
  const s = toneStyle[tone]
  return (
    <span title={title} style={{
      background: s.bg, color: s.color, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

const iconBtn: CSSProperties = {
  width: 26, height: 26, borderRadius: 999, border: 'none', background: 'transparent',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}

function TimelineCard({ t, ownerLabel, onSaveNote, onDeleteNote, savingNote }: {
  t: TimelineItem
  ownerLabel: (id?: string | null) => string
  onSaveNote: (activityId: string, subject: string, body: string) => Promise<boolean>
  onDeleteNote: (activityId: string) => void
  savingNote: boolean
}) {
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const callBody = t.body ? stripAircallRecordingLinks(t.body) : ''
  const isMedibox = t.type === 'app' && t.appSession?.app === 'mediboxlab'

  // Ligne d'auteur / de source sous le titre
  const subParts: string[] = []
  if (t.subtitle) subParts.push(t.subtitle)
  if (t.type === 'app') subParts.push('Session sur la plateforme')
  if (t.authorLabel && ['note', 'call', 'email', 'meeting'].includes(t.type)) subParts.push(t.authorLabel)
  else if (t.ownerId && !['note', 'call', 'email', 'meeting'].includes(t.type)) subParts.push(ownerLabel(t.ownerId))

  const expandable = (t.type === 'web' && !!t.webVisit) || (t.type === 'app' && !!t.appSession)
  const toggleLabel = open ? 'Masquer le détail' : (t.type === 'web' ? 'Voir les pages' : 'Voir le détail')

  const startEdit = () => {
    setDraftSubject(t.title)
    setDraftBody(t.body ?? '')
    setEditing(true)
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', gap: 12, border: `1px solid ${crmV2.border}`, borderRadius: 14, padding: '12px 14px', background: crmV2.bg,
        minWidth: 0,
      }}
    >
      <TypeIcon t={t} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 0, color: crmV2.text, overflowWrap: 'anywhere' }}>{t.title}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {t.editable && t.activityId && !editing && (
              <span style={{ display: 'inline-flex', gap: 2, opacity: hover ? 1 : 0, transition: 'opacity .12s' }}>
                <button type="button" onClick={startEdit} title="Modifier" aria-label="Modifier" style={{ ...iconBtn, color: crmV2.textMuted }}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => onDeleteNote(t.activityId!)} title="Supprimer" aria-label="Supprimer" style={{ ...iconBtn, color: '#d13a41' }}>
                  <Trash2 size={13} />
                </button>
              </span>
            )}
            <span style={{ fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap' }}>
              {format(new Date(t.timestamp), 'EEE d MMM · HH:mm', { locale: fr })}
            </span>
          </span>
        </div>

        {(subParts.length > 0 || isMedibox) && (
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {isMedibox && (
              <span style={{ background: '#14b8a6', color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: 10, fontWeight: 700 }}>Medibox</span>
            )}
            {subParts.map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span aria-hidden>·</span>}
                {i === subParts.length - 1 && t.authorLabel && p === t.authorLabel && <User size={11} />}
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Pastilles d'état : e-mail (Délivré / Ouvert ×N / Cliqué), SMS */}
        {t.type === 'email' && <EmailStatusBadges sendStatus={t.sendStatus} stats={t.emailStats} />}
        {t.type === 'sms' && <SMSStatusBadges status={t.sendStatus} totalClicks={t.sms?.total_clicks} />}

        {editing ? (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={draftSubject}
              onChange={e => setDraftSubject(e.target.value)}
              placeholder="Titre (optionnel)"
              style={fieldStyle}
            />
            <textarea
              value={draftBody}
              onChange={e => setDraftBody(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Contenu…"
              style={{ ...fieldStyle, height: 'auto', minHeight: 90, padding: '8px 12px', resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <CrmV2Button size="sm" onClick={() => setEditing(false)} disabled={savingNote}>Annuler</CrmV2Button>
              <CrmV2Button
                size="sm"
                variant="primary"
                disabled={savingNote}
                onClick={async () => { if (await onSaveNote(t.activityId!, draftSubject, draftBody)) setEditing(false) }}
              >
                {savingNote ? 'Enregistrement…' : 'Enregistrer'}
              </CrmV2Button>
            </div>
          </div>
        ) : callBody ? (
          <div
            style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: crmV2.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            dangerouslySetInnerHTML={{ __html: sanitize(callBody) }}
          />
        ) : null}

        {t.aircallCallId && (
          <AircallPlayerV2 callId={t.aircallCallId} isVoicemail={t.isVoicemail} duration={t.callDuration} />
        )}

        {t.type === 'sms' && t.sms?.error_message && <ErrorLine text={t.sms.error_message} />}
        {t.type === 'sms' && t.sms?.links && t.sms.links.length > 0 && <SMSLinksSection links={t.sms.links} />}
        {t.type === 'email' && t.emailCampaign?.error_message && <ErrorLine text={t.emailCampaign.error_message} />}
        {t.type === 'email' && t.emailCampaign?.links && t.emailCampaign.links.length > 0 && (
          <EmailLinksSection links={t.emailCampaign.links} />
        )}

        {expandable && (
          <>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              style={{
                marginTop: 8, appearance: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700, color: crmV2.link, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {toggleLabel}
              <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {open && t.type === 'web' && t.webVisit && <WebVisitPages visit={t.webVisit} />}
            {open && t.type === 'app' && t.appSession && <AppSessionEvents session={t.appSession} />}
          </>
        )}
      </div>
    </div>
  )
}

const fieldStyle: CSSProperties = {
  height: 38, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 12px',
  fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none', boxSizing: 'border-box', width: '100%',
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 12, color: '#b91c1c', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 8, padding: '4px 8px', marginTop: 8,
    }}>
      Erreur : {text}
    </div>
  )
}

const detailBox: CSSProperties = {
  marginTop: 8, background: crmV2.bgHover, borderRadius: 10, padding: '8px 10px',
  display: 'flex', flexDirection: 'column', gap: 6,
}
const mono: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: crmV2.textFaint, marginRight: 6,
}

/** Détail d'une visite : page par page, heure, durée, lecture, clics, formulaire. */
function WebVisitPages({ visit }: { visit: WebActivityVisit }) {
  const head = [
    `Horaires ${hms(visit.started_at)} → ${hms(visit.ended_at)}`,
    visit.device,
    visit.utm_campaign ? `Campagne ${visit.utm_campaign}` : null,
    visit.referrer ? `Provenance ${visit.referrer}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={detailBox}>
      <div style={{ fontSize: 11, color: crmV2.textMuted, overflowWrap: 'anywhere' }}>{head}</div>
      {visit.pages.map((p, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
            <div style={{ minWidth: 0 }}>
              <span style={mono}>{hm(p.at)}</span>
              <a
                href={p.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={p.url ?? ''}
                style={{ fontWeight: 600, color: crmV2.text, textDecoration: 'none', overflowWrap: 'anywhere' }}
              >
                {p.title?.split(' | ')[0] || p.path || p.url}
              </a>
              {p.path && p.title && <span style={{ color: crmV2.textFaint, marginLeft: 6 }}>{p.path}</span>}
              {p.submitted_form && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, background: 'rgba(22,163,74,0.10)', color: '#15803d', borderRadius: 999, padding: '1px 6px' }}>formulaire</span>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 11, fontWeight: 600, color: crmV2.textMuted }}>
              <div>{p.seconds !== null ? formatSeconds(p.seconds) : '—'}</div>
              {(p.left_at || p.scroll_pct !== null) && (
                <div style={{ fontWeight: 500, color: crmV2.textFaint, fontSize: 10 }}>
                  {[p.left_at ? `sortie ${hms(p.left_at)}` : null, p.scroll_pct !== null ? `lu à ${p.scroll_pct} %` : null].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
          {p.clicks.length > 0 && (
            <div style={{ marginLeft: 42, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {p.clicks.map((c, j) => (
                <div key={j} title={c.href ?? ''} style={{ fontSize: 11, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={mono}>{hms(c.at)}</span>
                  clic {c.kind} « {c.text || c.href} »
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Détail d'une session d'app : horaires puis actions (heure, libellé, matière › chapitre, score, durée). */
function AppSessionEvents({ session }: { session: AppActivitySession }) {
  return (
    <div style={detailBox}>
      <div style={{ fontSize: 11, color: crmV2.textMuted }}>Horaires {hms(session.started_at)} → {hms(session.ended_at)}</div>
      {session.events.map((e, i) => {
        const subject = [e.details.subject, e.details.chapter].filter(v => typeof v === 'string' && v).join(' › ')
        const score = scoreOf(e.details)
        const label = stripEmoji(appEventLabel(e))
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
            <div style={{ minWidth: 0 }}>
              <span style={mono}>{hm(e.at)}</span>
              <span style={{ fontWeight: 600, color: crmV2.text }}>{label}</span>
              {e.title && e.title !== appEventLabel(e) && <span style={{ color: crmV2.text }}> — {e.title}</span>}
              {subject && <span style={{ color: crmV2.textFaint, marginLeft: 6 }}>{subject}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {score && (
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 6px',
                  background: score.good === true ? 'rgba(16,185,129,0.12)' : score.good === false ? 'rgba(239,68,68,0.10)' : crmV2.bgSoft,
                  color: score.good === true ? '#047857' : score.good === false ? '#b91c1c' : crmV2.text,
                }}>{score.text}</span>
              )}
              {e.seconds !== null && e.seconds > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: crmV2.textMuted }}>{formatSeconds(e.seconds)}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SMSStatusBadges({ status, totalClicks }: { status?: string; totalClicks?: number }) {
  const items: Array<{ label: string; tone: Tone; title?: string }> = []
  const statusMap: Record<string, { label: string; tone: Tone }> = {
    sent: { label: 'Envoyé', tone: 'green' },
    failed: { label: 'Échec', tone: 'red' },
    skipped: { label: 'Ignoré', tone: 'orange' },
    pending: { label: 'En attente', tone: 'grey' },
  }
  if (status && statusMap[status]) items.push(statusMap[status])
  if ((totalClicks ?? 0) > 0) {
    items.push({ label: `${totalClicks} clic${(totalClicks ?? 0) > 1 ? 's' : ''}`, tone: 'purple', title: 'Clics sur les liens trackés' })
  }
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {items.map((b, i) => <Chip key={i} label={b.label} tone={b.tone} title={b.title} />)}
    </div>
  )
}

function EmailStatusBadges({ sendStatus, stats }: { sendStatus?: string; stats?: EmailStats }) {
  const items: Array<{ label: string; tone: Tone; title?: string }> = []

  // Dernier event d'un type donné dans stats.events
  const lastEventOf = (predicate: (type: string) => boolean): string | undefined => {
    if (!stats?.events) return undefined
    const matches = stats.events.filter(e => predicate(e.type))
    if (matches.length === 0) return undefined
    return matches.reduce((acc, e) => (!acc || e.at > acc ? e.at : acc), '' as string) || undefined
  }
  const formatRelative = (iso?: string): string | undefined => {
    if (!iso) return undefined
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr }) } catch { return undefined }
  }
  const formatExact = (iso?: string): string | undefined => {
    if (!iso) return undefined
    try { return format(new Date(iso), "d MMM 'à' HH:mm", { locale: fr }) } catch { return undefined }
  }

  if (sendStatus === 'FAILED') items.push({ label: 'Échec', tone: 'red' })
  else if (sendStatus === 'SENT') items.push({ label: 'Envoyé', tone: 'grey' })
  if (stats) {
    if (stats.delivered > 0) items.push({ label: 'Délivré', tone: 'green' })
    if (stats.opens > 0) {
      const last = lastEventOf(t => t === 'open' || t === 'opened' || t === 'opens' || t === 'unique_opened' || t === 'proxy_open')
      const rel = formatRelative(last)
      const exact = formatExact(last)
      const cnt = stats.opens > 1 ? ` ×${stats.opens}` : ''
      items.push({ label: rel ? `Ouvert${cnt} · ${rel}` : `Ouvert${cnt}`, tone: 'blue', title: exact ? `Dernière ouverture : ${exact}` : undefined })
    }
    if (stats.clicks > 0) {
      const last = lastEventOf(t => t === 'click' || t === 'clicks' || t === 'unique_clicked')
      const rel = formatRelative(last)
      const exact = formatExact(last)
      const cnt = stats.clicks > 1 ? ` ×${stats.clicks}` : ''
      items.push({ label: rel ? `Cliqué${cnt} · ${rel}` : `Cliqué${cnt}`, tone: 'purple', title: exact ? `Dernier clic : ${exact}` : undefined })
    }
    if (stats.bounces > 0) items.push({ label: 'Rejeté', tone: 'orange' })
    if (stats.spam > 0) items.push({ label: 'Spam', tone: 'red' })
  }
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {items.map((it, i) => <Chip key={i} label={it.label} tone={it.tone} title={it.title} />)}
    </div>
  )
}

const linkRow: CSSProperties = {
  fontSize: 12, border: `1px solid ${crmV2.border}`, borderRadius: 10, background: crmV2.bgHover, padding: '6px 10px',
}
const linkToggle: CSSProperties = {
  appearance: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit',
  fontSize: 11, fontWeight: 700, color: crmV2.link, cursor: 'pointer',
}

function SMSLinksSection({ links }: { links: SMSLink[] }) {
  const [expandedToken, setExpandedToken] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {links.map((link, idx) => {
        const key = link.placeholder + idx
        const isExpanded = expandedToken === key
        const hasClicks = (link.click_count ?? 0) > 0
        return (
          <div key={key} style={linkRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <code style={{ color: '#7e22ce', fontWeight: 700, background: crmV2.bg, padding: '1px 6px', borderRadius: 6, fontSize: 10 }}>
                {link.placeholder}
              </code>
              <a href={link.original_url} target="_blank" rel="noopener noreferrer" title={link.original_url}
                style={{ color: crmV2.link, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                {link.original_url}
              </a>
              {link.label && <span style={{ color: crmV2.textFaint, fontStyle: 'italic' }}>({link.label})</span>}
              <span style={{ marginLeft: 'auto' }}>
                <Chip label={`${link.click_count ?? 0} clic${(link.click_count ?? 0) > 1 ? 's' : ''}`} tone={hasClicks ? 'purple' : 'grey'} />
              </span>
              {hasClicks && link.clicks.length > 0 && (
                <button type="button" onClick={() => setExpandedToken(isExpanded ? null : key)} style={linkToggle}>
                  {isExpanded ? 'Masquer' : 'Détails'}
                </button>
              )}
            </div>
            {hasClicks && link.last_clicked_at && (
              <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 2 }}>
                Dernier clic : {(() => {
                  try { return formatDistanceToNow(new Date(link.last_clicked_at), { addSuffix: true, locale: fr }) } catch { return link.last_clicked_at }
                })()}
              </div>
            )}
            {isExpanded && link.clicks.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${crmV2.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {link.clicks.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: crmV2.textMuted, display: 'flex', gap: 8 }}>
                    <span style={mono}>{format(new Date(c.clicked_at), "d MMM 'à' HH:mm:ss", { locale: fr })}</span>
                    {c.ip && <span style={{ color: crmV2.textFaint }}>IP {c.ip}</span>}
                    {c.user_agent && <span title={c.user_agent} style={{ color: crmV2.textFaint }}>{c.user_agent.split(/[/\s]/)[0]}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmailLinksSection({ links }: { links: EmailCampaignLink[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {links.map((link, idx) => {
        const key = link.url + idx
        const isExpanded = expandedKey === key
        return (
          <div key={key} style={linkRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}
                style={{ color: crmV2.link, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                {link.url}
              </a>
              <span style={{ marginLeft: 'auto' }}>
                <Chip label={`${link.click_count} clic${link.click_count > 1 ? 's' : ''}`} tone="purple" />
              </span>
              {link.clicks.length > 0 && (
                <button type="button" onClick={() => setExpandedKey(isExpanded ? null : key)} style={linkToggle}>
                  {isExpanded ? 'Masquer' : 'Détails'}
                </button>
              )}
            </div>
            {link.clicks.length > 0 && link.clicks[0]?.at && (
              <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 2 }}>
                Dernier clic : {(() => {
                  try { return formatDistanceToNow(new Date(link.clicks[0].at), { addSuffix: true, locale: fr }) } catch { return link.clicks[0].at }
                })()}
              </div>
            )}
            {isExpanded && link.clicks.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${crmV2.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {link.clicks.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: crmV2.textMuted, display: 'flex', gap: 8 }}>
                    <span style={mono}>{format(new Date(c.at), "d MMM 'à' HH:mm:ss", { locale: fr })}</span>
                    {c.ip && <span style={{ color: crmV2.textFaint }}>IP {c.ip}</span>}
                    {c.ua && <span title={c.ua} style={{ color: crmV2.textFaint }}>{c.ua.split(/[/\s]/)[0]}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmptyTimeline({ onAdd, addLabel, filtered }: { onAdd?: () => void; addLabel?: string; filtered: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 12px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%',
        background: crmV2.bgSoft, color: crmV2.textFaint, marginBottom: 10,
      }}>
        <TrendingUp size={24} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.textMuted }}>
        {filtered ? 'Aucune activité pour ce filtre.' : 'Pas encore d’activité'}
      </div>
      {!filtered && (
        <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 4 }}>Les notes, appels, e-mails, formulaires apparaîtront ici.</div>
      )}
      {onAdd && addLabel && (
        <div style={{ marginTop: 14 }}>
          <CrmV2Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>{addLabel}</CrmV2Button>
        </div>
      )}
    </div>
  )
}
