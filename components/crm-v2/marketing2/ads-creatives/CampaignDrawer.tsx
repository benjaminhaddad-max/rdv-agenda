'use client'

/**
 * Fiche d'une campagne (panneau à droite, ouvert au clic sur une ligne du tableau) :
 * dates, brief, brief vidéo (3 scripts Claude modifiables), dépôt des dossiers
 * statique / vidéo et coche « campagne en ligne ».
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Clapperboard, FileText, Image as ImageIcon, Megaphone, Pencil, Video } from 'lucide-react'
import { CrmV2Button, CrmV2Drawer } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  campaignTypeLabel, diffDays, formatEuros, frDay, parisDay,
  type AdsCreativesSettings, type AdsEventRow, type CreativeItem, type CreativeRole, type FolderFile, type VideoScript,
} from '@/lib/ads-creatives'
import FolderLane from './FolderLane'
import GuidePdfLane from './GuidePdfLane'
import VideoScriptsLane from './VideoScriptsLane'
import { adsStatus, creativeStatus, guidePdfStatus, type Status } from './status'
import { TONES, funnelColor, pill, pilierColor, statusColor, typeColor } from './ui'

const typeColorStyle = (ev: AdsEventRow) => {
  const c = typeColor(ev)
  return { color: c.color, background: c.bg }
}

export default function CampaignDrawer({
  ev, today, crm, settings, token, author, fileUrl, onAddFolder, onItemAdded, onRemove, onLaunched, onEdit, onSaveTime, onSaveLocation, onScriptsSaved, onClose, flash,
}: {
  ev: AdsEventRow
  today: string
  crm: boolean
  settings: AdsCreativesSettings | null
  token?: string
  author: string
  fileUrl: (f: FolderFile) => string
  onAddFolder: (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => Promise<void>
  onItemAdded: (ev: AdsEventRow, item: CreativeItem) => void
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  onLaunched: (v: boolean) => void
  onEdit: () => void
  /** CRM : modifier l'horaire directement depuis la fiche */
  onSaveTime: (time: string) => void
  /** CRM : modifier le lieu (JPO / présentiel) depuis la fiche */
  onSaveLocation: (location: string) => void
  /** Brief vidéo : scripts générés ou modifiés */
  onScriptsSaved: (scripts: VideoScript[], at?: string | null) => void
  onClose: () => void
  flash: (m: string) => void
}) {
  const [more, setMore] = useState(false)
  const isGuide = ev.kind === 'guide'
  const physical = !isGuide && ev.event_type !== 'webinaire'
  const eventLabel = campaignTypeLabel(ev)
  const days = diffDays(ev.campaign_start, ev.campaign_end) + 1
  const pc = pilierColor(ev.pilier)
  const fc = funnelColor(ev.funnel)
  const sc = statusColor(ev.status)
  const details: Array<[string, string | null]> = [
    ['Référence', ev.ref_diploma],
    ['Logique budget', ev.budget_logic],
    ['Pourquoi / comment', ev.why],
  ]

  return (
    <CrmV2Drawer
      open
      onClose={onClose}
      width={600}
      header={
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ ...pill, ...typeColorStyle(ev) }}>{eventLabel}{ev.num != null ? ` n°${ev.num}` : ''}</span>
            {ev.pilier && <span style={{ ...pill, color: pc.color, background: pc.bg }}>{ev.pilier}</span>}
            {ev.funnel && <span style={{ ...pill, color: fc.color, background: fc.bg }}>{ev.funnel}</span>}
            {ev.status && <span style={{ ...pill, color: sc.color, background: sc.bg }}>{ev.status}</span>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35, color: crmV2.text }}>{ev.name}</div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4 }}>
            {isGuide
              ? `Diffusé du ${frDay(ev.campaign_start)} au ${frDay(ev.campaign_end)} · ${days} jours`
              : <>
                  {capitalize(new Date(`${ev.day}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}
                  {ev.event_time ? ` · ${ev.event_time}` : ''}
                  {physical && ev.location ? ` · ${ev.location}` : ''}
                </>}
          </div>
        </div>
      }
      footer={crm ? (
        <>
          <div style={{ flex: 1 }} />
          <CrmV2Button size="sm" icon={<Pencil size={14} />} onClick={onEdit}>Modifier le brief</CrmV2Button>
        </>
      ) : undefined}
    >
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Dates clés */}
        <Section title="Planning">
          {!isGuide && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={fieldLabel}>Horaire</span>
              {crm ? (
                <input
                  key={ev.event_time || ''}
                  defaultValue={ev.event_time || ''}
                  placeholder={ev.event_type === 'jpo' ? '10h – 18h' : '18h30'}
                  onBlur={(e) => { if (e.target.value.trim() !== (ev.event_time || '')) onSaveTime(e.target.value.trim()) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  style={timeInput}
                  title="Modifier l’horaire"
                />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>{ev.event_time || '—'}</span>
              )}
            </div>
          )}
          {physical && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={fieldLabel}>Lieu</span>
              {crm ? (
                <input
                  key={ev.location || ''}
                  defaultValue={ev.location || ''}
                  placeholder="Adresse de l’événement (à renseigner)"
                  onBlur={(e) => { if (e.target.value.trim() !== (ev.location || '')) onSaveLocation(e.target.value.trim()) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  style={{ ...timeInput, flex: 1, minWidth: 0 }}
                  title="Modifier le lieu"
                />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: ev.location ? crmV2.text : crmV2.danger }}>{ev.location || 'Lieu à confirmer'}</span>
              )}
            </div>
          )}
          {isGuide ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <DateBox label="Guide + créas à livrer" day={ev.creas_deadline} />
              <DateBox label="Début de diffusion" day={ev.campaign_start} />
              <DateBox label="Fin de diffusion" day={ev.campaign_end} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <DateBox label="Créas à déposer" day={ev.creas_deadline} />
              <DateBox label="Allumage" day={ev.campaign_start} />
              <DateBox label={ev.campaign_end === ev.day ? `${eventLabel} · extinction` : 'Extinction'} day={ev.campaign_end} />
            </div>
          )}
        </Section>

        {/* Brief */}
        {(ev.accroche || ev.cible || ev.budget_target != null || ev.direction_crea) && (
          <Section title="Brief">
            {ev.accroche && <div style={quote}>{ev.accroche}</div>}
            {ev.direction_crea && (
              <div style={{ ...creaBox, marginTop: 10 }}>
                <div style={{ ...fieldLabel, color: crmV2.goldDark }}>Direction créa</div>
                <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5, marginTop: 2 }}>{ev.direction_crea}</div>
              </div>
            )}
            {ev.format_contenu && (
              <div style={{ marginTop: 10 }}>
                <div style={fieldLabel}>{isGuide ? 'Format et contenu' : 'Formats à produire'}</div>
                <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{ev.format_contenu}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: 12 }}>
              <Field label="Cible" value={ev.cible} />
              <Field label="Géo" value={ev.geo} />
              <Field label="Intervenant" value={ev.intervenant} />
              <Field label={isGuide ? 'Après le téléchargement' : 'CTA'} value={ev.cta} />
              <Field label="Webinaires liés" value={ev.linked_webinars} />
              <Field
                label="Budget"
                value={ev.budget_target != null
                  ? `${formatEuros(ev.budget_target)}${isGuide && days > 0 ? ` · ${formatEuros(ev.budget_target / days)}/jour` : ''}`
                  : null}
              />
              <Field
                label="CPL cible · leads"
                value={ev.cpl_target != null || ev.leads_expected != null
                  ? `${formatEuros(ev.cpl_target, 2)}${ev.cpl_ref != null ? ` (réf. ${formatEuros(ev.cpl_ref, 2)})` : ''} · ${ev.leads_expected ?? '—'} leads`
                  : null}
              />
            </div>
            {ev.to_check && (
              <div style={{ ...note, marginTop: 12 }}>
                <b>À vérifier :</b> {ev.to_check}
              </div>
            )}
            {details.some(([, v]) => v) && (
              <>
                <button type="button" onClick={() => setMore((v) => !v)} style={linkBtn}>
                  {more ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Plus de détails
                </button>
                {more && details.filter(([, v]) => v).map(([label, v]) => (
                  <div key={label} style={{ marginTop: 8 }}>
                    <div style={fieldLabel}>{label}</div>
                    <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5 }}>{v}</div>
                  </div>
                ))}
              </>
            )}
          </Section>
        )}

        {/* PDF du guide */}
        {isGuide && (
          <Section title="PDF du guide" icon={<FileText size={14} />} status={guidePdfStatus(ev, today)}>
            <GuidePdfLane
              ev={ev}
              token={token}
              author={author}
              fileUrl={fileUrl}
              onAdded={(item) => onItemAdded(ev, item)}
              onRemove={onRemove}
              flash={flash}
            />
          </Section>
        )}

        {/* Brief vidéo : 3 scripts */}
        <Section title="Brief vidéo · scripts" icon={<Clapperboard size={14} />} owner={settings?.video_owner_name}>
          <VideoScriptsLane ev={ev} crm={crm} token={token} author={author} onSaved={onScriptsSaved} flash={flash} />
        </Section>

        {/* Créas */}
        {(['static', 'video'] as const).map((role) => (
          <Section
            key={role}
            title={role === 'static' ? 'Créas statiques' : 'Créas vidéo'}
            icon={role === 'static' ? <ImageIcon size={14} /> : <Video size={14} />}
            owner={role === 'static' ? settings?.static_owner_name : settings?.video_owner_name}
            status={creativeStatus(ev, role, today)}
          >
            <FolderLane ev={ev} role={role} token={token} fileUrl={fileUrl} onAddFolder={onAddFolder} onRemove={onRemove} flash={flash} />
          </Section>
        ))}

        {/* Ads Manager */}
        <Section title="Ads Manager" icon={<Megaphone size={14} />} owner={settings?.ads_owner_name} status={adsStatus(ev, today)}>
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
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
            {ev.launched_at
              ? `Lancée le ${frDay(parisDay(ev.launched_at))}${ev.launched_by ? ` par ${ev.launched_by}` : ''}`
              : `${isGuide ? 'Début de diffusion' : 'À allumer'} le ${frDay(ev.campaign_start)}${author ? '' : ' · renseigne ton prénom en haut pour signer'}`}
          </div>
        </Section>
      </div>
    </CrmV2Drawer>
  )
}

/* ─── Petits composants ───────────────────────────────────────────── */

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Section({
  title, icon, owner, status, children,
}: {
  title: string
  icon?: ReactNode
  owner?: string | null
  status?: Status
  children: ReactNode
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {icon && <span style={{ color: crmV2.textMuted, display: 'inline-flex' }}>{icon}</span>}
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: crmV2.textMuted }}>{title}</span>
        {owner && <span style={{ fontSize: 12, color: crmV2.textFaint }}>· {owner}</span>}
        <div style={{ flex: 1 }} />
        {status && <StatusBadge s={status} />}
      </div>
      {children}
    </section>
  )
}

export function StatusBadge({ s }: { s: Status }) {
  const t = TONES[s.tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: t.color, whiteSpace: 'nowrap',
    }}>
      {s.tone === 'done'
        ? <Check size={13} strokeWidth={3} />
        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.tone === 'idle' ? crmV2.borderStrong : t.color, flexShrink: 0 }} />}
      {s.label}
    </span>
  )
}

function DateBox({ label, day }: { label: string; day: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: crmV2.radius, background: crmV2.bgHover, border: `1px solid ${crmV2.borderLight}` }}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, marginTop: 2 }}>{frDay(day)}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div style={{ minWidth: 0 }}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.45 }}>{value}</div>
    </div>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const fieldLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.textFaint,
}
const quote: CSSProperties = {
  fontSize: 13.5, lineHeight: 1.55, color: crmV2.text, fontStyle: 'italic',
  padding: '10px 14px', borderLeft: `3px solid ${crmV2.gold}`, background: crmV2.goldSoft, borderRadius: `0 ${crmV2.radius}px ${crmV2.radius}px 0`,
}
const timeInput: CSSProperties = {
  fontSize: 14, fontWeight: 700, color: crmV2.text, fontFamily: 'inherit', width: 150,
  padding: '6px 10px', borderRadius: crmV2.radiusSm, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
}
const creaBox: CSSProperties = {
  padding: '10px 12px', borderRadius: crmV2.radius, background: crmV2.bg, border: `1px dashed ${crmV2.goldBorder}`,
}
const note: CSSProperties = {
  fontSize: 12.5, lineHeight: 1.5, color: '#9a3412', background: TONES.warn.bg, border: `1px solid ${TONES.warn.border}`,
  padding: '8px 12px', borderRadius: crmV2.radius,
}
const linkBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, border: 'none', background: 'transparent',
  color: crmV2.link, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
}
const launchBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: crmV2.radius,
  border: `1.5px solid ${crmV2.border}`, background: crmV2.bg, cursor: 'pointer', fontSize: 13, color: crmV2.text,
}
const launchBoxOn: CSSProperties = { borderColor: TONES.done.border, background: TONES.done.bg, color: TONES.done.color }
