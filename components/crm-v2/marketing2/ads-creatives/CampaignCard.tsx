'use client'

/**
 * Carte d'une campagne Ads : en-tête (date, pilier, funnel, statut, chiffres),
 * frise Créas → Allumage → Événement → Extinction, brief, puis les trois
 * colonnes Créas statiques / Créas vidéo / Ads Manager.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  Check, ChevronDown, ChevronRight, Clock, Image as ImageIcon, Link2Off, MapPin, Megaphone, Pencil, Target, Video,
  AlertTriangle, Mic, MousePointerClick,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CREATIVE_ROLE_LABELS, diffDays, formatEuros, frDay, parisDay,
  type AdsCreativesSettings, type AdsEventRow, type CreativeItem, type CreativeRole, type FolderFile,
} from '@/lib/ads-creatives'
import FolderLane from './FolderLane'
import { TONES, funnelColor, iconBtn, pill, pilierColor, statusColor, type Tone } from './ui'

/* ─── Statuts ─────────────────────────────────────────────────────── */

export function creativeStatus(ev: AdsEventRow, role: CreativeRole, today: string): { tone: Tone; label: string } {
  if (ev.items.some((i) => i.role === role)) return { tone: 'done', label: 'Déposé' }
  if (ev.no_campaign) return { tone: 'off', label: 'Pas de campagne' }
  if (ev.day < today) return { tone: 'off', label: 'Non déposé' }
  const d = diffDays(today, ev.creas_deadline)
  if (d < 0) return { tone: 'late', label: `En retard de ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'À rendre aujourd’hui' }
  if (d <= 3) return { tone: 'warn', label: `Plus que ${d} j` }
  return { tone: 'idle', label: `Dans ${d} j` }
}

export function adsStatus(ev: AdsEventRow, today: string): { tone: Tone; label: string } {
  if (ev.launched_at) return { tone: 'done', label: 'En ligne' }
  if (ev.no_campaign) return { tone: 'off', label: 'Pas de campagne' }
  if (ev.day < today) return { tone: 'off', label: 'Non lancée' }
  const d = diffDays(today, ev.campaign_start)
  if (d < 0) return { tone: 'late', label: `En retard de ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'À lancer aujourd’hui' }
  if (d <= 3) return { tone: 'warn', label: `Lancement dans ${d} j` }
  return { tone: 'idle', label: `Lancement dans ${d} j` }
}

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')

/* ─── Carte ───────────────────────────────────────────────────────── */

export default function CampaignCard({
  ev, today, isMobile, crm, settings, token, author, fileUrl, onAddFolder, onRemove, onLaunched, onEdit, flash,
}: {
  ev: AdsEventRow
  today: string
  isMobile: boolean
  crm: boolean
  settings: (AdsCreativesSettings & { share_url?: string }) | null
  token?: string
  author: string
  fileUrl: (f: FolderFile) => string
  onAddFolder: (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => Promise<void>
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  onLaunched: (v: boolean) => void
  onEdit: () => void
  flash: (m: string) => void
}) {
  const [briefOpen, setBriefOpen] = useState(false)
  const d = new Date(`${ev.day}T12:00:00Z`)
  const pc = pilierColor(ev.pilier)
  const fc = funnelColor(ev.funnel)
  const sc = statusColor(ev.status)
  const missingCreas = (['static', 'video'] as const)
    .filter((r) => !ev.items.some((i) => i.role === r))
    .map((r) => (r === 'static' ? 'statiques' : 'vidéo'))
  const details: Array<[string, string | null, boolean?]> = [
    ['Intervenant', ev.intervenant],
    ['CTA post-événement', ev.cta],
    ['Référence', ev.ref_diploma],
    ['Logique budget', ev.budget_logic],
    ['Pourquoi / comment', ev.why],
    ['Points à vérifier', ev.to_check, true],
  ]
  const hasDetails = details.some(([, v]) => !!v)

  return (
    <div style={{ ...card, opacity: ev.no_campaign ? 0.6 : 1, borderLeft: `4px solid ${pc.color}` }}>
      {/* ── En-tête ── */}
      <div style={{ display: 'flex', gap: 14, padding: isMobile ? 14 : '16px 20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={dateBlock}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: crmV2.goldDark }}>
            {d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: crmV2.text }}>{d.getUTCDate()}</div>
          <div style={{ fontSize: 11, color: crmV2.textMuted }}>
            {d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: isMobile ? 0 : 260 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            {ev.num != null && <span style={{ ...pill, color: crmV2.textMuted, background: crmV2.chipBg }}>N° {ev.num}</span>}
            <span style={{ ...pill, color: ev.event_type === 'jpo' ? '#7c3aed' : '#0369a1', background: ev.event_type === 'jpo' ? '#f3e8ff' : '#e0f2fe', textTransform: 'uppercase' }}>
              {ev.event_type === 'jpo' ? 'JPO' : 'Webinaire'}
            </span>
            {ev.pilier && <span style={{ ...pill, color: pc.color, background: pc.bg }}>{ev.pilier}</span>}
            {ev.funnel && <span style={{ ...pill, color: fc.color, background: fc.bg }}>{ev.funnel}</span>}
            {ev.status && <span style={{ ...pill, color: sc.color, background: sc.bg }}>{ev.status}</span>}
            {crm && !ev.event_id && (
              <span style={{ ...pill, color: crmV2.textFaint, background: crmV2.bgHover, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Se rattachera tout seul quand l’événement sera créé à cette date dans Événements">
                <Link2Off size={11} /> Pas encore dans Événements
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: crmV2.text, lineHeight: 1.35 }}>{ev.name}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: crmV2.textMuted, marginTop: 6 }}>
            {ev.event_time && <Meta icon={<Clock size={13} />}>{ev.event_time}</Meta>}
            {ev.cible && <Meta icon={<Target size={13} />}>{ev.cible}</Meta>}
            {(ev.geo || ev.location) && <Meta icon={<MapPin size={13} />}>{ev.geo || ev.location}</Meta>}
            {ev.intervenant && <Meta icon={<Mic size={13} />}>{ev.intervenant}</Meta>}
          </div>
        </div>

        {(ev.budget_target != null || ev.cpl_target != null || ev.leads_expected != null) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <Stat label="Budget" value={formatEuros(ev.budget_target)} />
            <Stat label="CPL cible" value={formatEuros(ev.cpl_target, 2)} hint={ev.cpl_ref != null ? `réf. ${formatEuros(ev.cpl_ref, 2)}` : undefined} />
            <Stat label="Leads" value={ev.leads_expected != null ? ev.leads_expected.toLocaleString('fr-FR') : '—'} />
          </div>
        )}

        {crm && (
          <button type="button" onClick={onEdit} style={{ ...iconBtn, padding: 6, borderRadius: 8, border: `1px solid ${crmV2.border}` }} title="Modifier le brief">
            <Pencil size={14} />
          </button>
        )}
      </div>

      {/* ── Frise ── */}
      <Timeline ev={ev} today={today} isMobile={isMobile} />

      {/* ── Brief ── */}
      {(ev.accroche || hasDetails) && (
        <div style={{ padding: isMobile ? '0 14px 14px' : '0 20px 16px' }}>
          {ev.accroche && <div style={quote}>{ev.accroche}</div>}
          {hasDetails && (
            <button type="button" onClick={() => setBriefOpen((v) => !v)} style={toggleBtn}>
              {briefOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Brief complet
              {ev.to_check && !briefOpen && <AlertTriangle size={13} style={{ color: TONES.warn.color }} />}
            </button>
          )}
          {briefOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
              {details.filter(([, v]) => !!v).map(([label, v, warn]) => (
                <div key={label} style={{ ...detailBox, ...(warn ? { background: TONES.warn.bg, borderColor: TONES.warn.border } : {}) }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: warn ? TONES.warn.color : crmV2.textFaint, marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5 }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Colonnes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', borderTop: `1px solid ${crmV2.borderLight}`, background: '#fcfdfe' }}>
        {(['static', 'video'] as const).map((role, i) => (
          <Lane
            key={role}
            icon={role === 'static' ? <ImageIcon size={15} /> : <Video size={15} />}
            title={CREATIVE_ROLE_LABELS[role]}
            owner={role === 'static' ? settings?.static_owner_name : settings?.video_owner_name}
            status={creativeStatus(ev, role, today)}
            dateLine={<>À déposer le <b>{frDay(ev.creas_deadline)}</b></>}
            borderLeft={!isMobile && i > 0}
            borderTop={isMobile && i > 0}
          >
            <FolderLane ev={ev} role={role} token={token} fileUrl={fileUrl} onAddFolder={onAddFolder} onRemove={onRemove} flash={flash} />
          </Lane>
        ))}
        <Lane
          icon={<Megaphone size={15} />}
          title="Ads Manager"
          owner={settings?.ads_owner_name}
          status={adsStatus(ev, today)}
          dateLine={<>Allumage le <b>{frDay(ev.campaign_start)}</b> · extinction le <b>{frDay(ev.campaign_end)}</b>{ev.campaign_end === ev.day ? ' (jour J)' : ''}</>}
          borderLeft={!isMobile}
          borderTop={isMobile}
        >
          <label style={{ ...launchBox, ...(ev.launched_at ? launchBoxOn : {}) }}>
            <input
              type="checkbox"
              checked={!!ev.launched_at}
              onChange={(e) => {
                if (!e.target.checked && !confirm('Décocher : la campagne n’est plus en ligne ?')) return
                onLaunched(e.target.checked)
              }}
              style={{ width: 18, height: 18, accentColor: TONES.done.color, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600 }}>{ev.launched_at ? 'Campagne en ligne' : 'Marquer la campagne en ligne'}</span>
          </label>
          {ev.launched_at && (
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
              Lancée le {frDay(parisDay(ev.launched_at))}{ev.launched_by ? ` par ${ev.launched_by}` : ''}
            </div>
          )}
          {!ev.launched_at && !ev.no_campaign && missingCreas.length > 0 && (
            <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 6 }}>En attente des créas {missingCreas.join(' et ')}</div>
          )}
          {ev.cta && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: crmV2.textMuted, marginTop: 8 }}>
              <MousePointerClick size={13} /> CTA : {ev.cta}
            </div>
          )}
          {!author && !ev.launched_at && (
            <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 4 }}>Renseigne ton prénom en haut pour signer la validation.</div>
          )}
        </Lane>
      </div>
    </div>
  )
}

/* ─── Frise des dates ─────────────────────────────────────────────── */

function Timeline({ ev, today, isMobile }: { ev: AdsEventRow; today: string; isMobile: boolean }) {
  const creasDone = (['static', 'video'] as const).every((r) => ev.items.some((i) => i.role === r))
  const eventLabel = ev.event_type === 'jpo' ? 'JPO' : 'Webinaire'
  const sameDayEnd = ev.campaign_end === ev.day
  const steps: Array<{ label: string; day: string; late: boolean; done: boolean }> = [
    { label: 'Créas', day: ev.creas_deadline, done: creasDone, late: !creasDone && today > ev.creas_deadline && !ev.no_campaign },
    { label: 'Allumage', day: ev.campaign_start, done: !!ev.launched_at, late: !ev.launched_at && today > ev.campaign_start && !ev.no_campaign },
    // Extinction le jour de l'événement : une seule étape « Webinaire · extinction »
    { label: sameDayEnd ? `${eventLabel} · extinction` : eventLabel, day: ev.day, done: today > ev.day, late: false },
    ...(sameDayEnd ? [] : [{ label: 'Extinction', day: ev.campaign_end, done: today > ev.campaign_end, late: false }]),
  ]
  // Position d'aujourd'hui : entre quelles étapes ?
  const idx = steps.findIndex((s) => today < s.day) // première étape à venir
  const progress = idx === -1 ? 1 : idx === 0 ? 0 : (idx - 1 + Math.min(1, Math.max(0,
    diffDays(steps[idx - 1].day, today) / Math.max(1, diffDays(steps[idx - 1].day, steps[idx].day))))) / (steps.length - 1)

  return (
    <div style={{ padding: isMobile ? '4px 18px 18px' : '4px 34px 18px' }}>
      <div style={{ position: 'relative', height: 54 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 4, borderRadius: 2, background: crmV2.bgMuted }} />
        <div style={{ position: 'absolute', left: 0, width: `${progress * 100}%`, top: 9, height: 4, borderRadius: 2, background: crmV2.goldGradient }} />
        {progress > 0 && progress < 1 && (
          <div style={{ position: 'absolute', left: `${progress * 100}%`, top: 0, transform: 'translateX(-50%)' }} title="Aujourd’hui">
            <div style={{ width: 2, height: 22, background: crmV2.text, margin: '0 auto' }} />
          </div>
        )}
        {steps.map((s, i) => {
          const color = s.done ? TONES.done.color : s.late ? TONES.late.color : today >= s.day ? crmV2.gold : crmV2.borderStrong
          const left = `${(i / (steps.length - 1)) * 100}%`
          const align = i === 0 ? 'flex-start' : i === steps.length - 1 ? 'flex-end' : 'center'
          return (
            <div key={s.label} style={{
              position: 'absolute', left, top: 0, transform: i === 0 ? 'none' : i === steps.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: align,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: s.done || s.late ? color : crmV2.bg,
                border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}>
                {s.done && <Check size={12} strokeWidth={3} />}
                {s.late && <span style={{ fontSize: 11, fontWeight: 800 }}>!</span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.late ? TONES.late.color : crmV2.textMuted, marginTop: 4, whiteSpace: 'nowrap' }}>{s.label}</div>
              <div style={{ fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap' }}>{shortDay(s.day)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Petits composants ───────────────────────────────────────────── */

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{icon}{children}</span>
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: crmV2.radius, background: crmV2.bgHover, border: `1px solid ${crmV2.borderLight}`, minWidth: 86 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.textFaint }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: crmV2.text, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: crmV2.textFaint }}>{hint}</div>}
    </div>
  )
}

function Lane({
  icon, title, owner, status, dateLine, borderLeft, borderTop, children,
}: {
  icon: ReactNode
  title: string
  owner?: string | null
  status: { tone: Tone; label: string }
  dateLine: ReactNode
  borderLeft?: boolean
  borderTop?: boolean
  children: ReactNode
}) {
  const t = TONES[status.tone]
  return (
    <div style={{
      padding: 16, minWidth: 0,
      borderLeft: borderLeft ? `1px solid ${crmV2.borderLight}` : undefined,
      borderTop: borderTop ? `1px solid ${crmV2.borderLight}` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ color: crmV2.textMuted, display: 'inline-flex' }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.textMuted }}>{title}</span>
          {owner && <span style={{ fontSize: 12, color: crmV2.textFaint, whiteSpace: 'nowrap' }}>· {owner}</span>}
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`,
          padding: '3px 10px', borderRadius: crmV2.radiusPill, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {status.tone === 'done' && <Check size={12} />}
          {status.label}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: crmV2.textMuted, marginBottom: 12 }}>{dateLine}</div>
      {children}
    </div>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const card: CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden',
}
const dateBlock: CSSProperties = {
  width: 58, padding: '8px 0', textAlign: 'center', borderRadius: crmV2.radius,
  background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, flexShrink: 0,
}
const quote: CSSProperties = {
  fontSize: 13.5, lineHeight: 1.55, color: crmV2.text, fontStyle: 'italic',
  padding: '10px 14px', borderLeft: `3px solid ${crmV2.gold}`, background: crmV2.goldSoft, borderRadius: `0 ${crmV2.radius}px ${crmV2.radius}px 0`,
}
const toggleBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, border: 'none', background: 'transparent',
  color: crmV2.link, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
}
const detailBox: CSSProperties = {
  padding: '10px 12px', borderRadius: crmV2.radius, background: crmV2.bgHover, border: `1px solid ${crmV2.borderLight}`,
}
const launchBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: crmV2.radius,
  border: `1.5px solid ${crmV2.border}`, background: crmV2.bg, cursor: 'pointer', fontSize: 13, color: crmV2.text,
}
const launchBoxOn: CSSProperties = { borderColor: TONES.done.border, background: TONES.done.bg, color: TONES.done.color }
