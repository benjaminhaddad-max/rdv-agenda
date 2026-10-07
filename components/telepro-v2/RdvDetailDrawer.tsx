'use client'

import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Ban, Calendar, Check, CircleCheck, CircleX, ExternalLink, FileText, Flame, GraduationCap, Mail, MapPin,
  PartyPopper, Phone, PhoneCall, RotateCcw, Tag, ThumbsDown, User, Video,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2CloseButton, CrmV2Drawer, CrmV2SectionLabel } from '@/components/crm-v2/primitives'
import MeetingModeSwitcher from '@/components/MeetingModeSwitcher'
import type { AppointmentStatus } from '@/components/StatusBadge'
import { formatAppointmentPlacementLabel } from '@/lib/appointment-display'
import type { MyAppointment } from './types'
import { RdvStatusPill, rdvStatusStyle } from './ui'

const RESULT_ACTIONS: { status: AppointmentStatus; label: string; icon: ReactNode; hint: string }[] = [
  { status: 'no_show',      label: 'No-show',      icon: <CircleX size={14} />,     hint: '→ A replanifier' },
  { status: 'annule',       label: 'Annulé',       icon: <Ban size={14} />,         hint: '→ A replanifier' },
  { status: 'a_travailler', label: 'A travailler', icon: <Mail size={14} />,        hint: '→ Mail PI + brochure' },
  { status: 'pre_positif',  label: 'Pré-positif',  icon: <Flame size={14} />,       hint: '→ Mail PI + brochure' },
  { status: 'positif',      label: 'POSITIF',      icon: <PartyPopper size={14} />, hint: '→ Pré-inscription' },
  { status: 'negatif',      label: 'Négatif',      icon: <ThumbsDown size={14} />,  hint: '→ Rien à faire' },
]

function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${crmV2.borderLight}` }}>
      <CrmV2SectionLabel icon={icon} style={{ marginBottom: 10 }}>{title}</CrmV2SectionLabel>
      {children}
    </div>
  )
}

function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: crmV2.textMuted, minWidth: 0 }}>
      <span style={{ color: crmV2.gold, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  )
}

const linkPill = {
  display: 'inline-flex', alignItems: 'center', gap: 5, background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`,
  borderRadius: 999, padding: '6px 12px', color: crmV2.goldDark, fontSize: 12, fontWeight: 700, textDecoration: 'none',
} as const

/** Fiche RDV du planning télépro (lecture seule + retour prospect + note interne éditable). */
export default function RdvDetailDrawer({
  rdv, noteValue, onNoteChange, onNoteSave, saving, saved, onClose, onConfirm, confirming, onCancel, cancelling, onReset,
  onMeetingModeUpdated,
}: {
  rdv: MyAppointment
  noteValue: string
  onNoteChange: (val: string) => void
  onNoteSave: () => void
  saving: boolean
  saved: boolean
  onClose: () => void
  onConfirm?: () => void
  confirming?: boolean
  onCancel?: () => void
  cancelling?: boolean
  onReset?: () => void
  onMeetingModeUpdated?: (updated: { meeting_type: string; meeting_link: string | null }) => void
}) {
  const start = new Date(rdv.start_at)
  const end = new Date(rdv.end_at)
  const meetingColor = rdv.meeting_type === 'telephone' ? '#16a34a' : crmV2.gold
  const meetingLabel = rdv.meeting_type === 'visio' ? 'Visio' : rdv.meeting_type === 'telephone' ? 'Téléphone' : 'Présentiel'

  const header = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <RdvStatusPill status={rdv.status} style={{ fontSize: 12, padding: '3px 10px' }} />
        <CrmV2CloseButton onClick={onClose} />
      </div>
      <h2 style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: crmV2.text }}>{rdv.prospect_name}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13, color: crmV2.textMuted, textTransform: 'capitalize' }}>
        <Calendar size={13} color={crmV2.gold} />
        {format(start, 'EEEE d MMMM', { locale: fr })} · {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
      </div>
    </div>
  )

  const toggleBtn = (active: boolean, color: string, bg: string) => ({
    flex: 1, minHeight: 40, borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13,
    background: active ? bg : crmV2.bg, border: `1px solid ${active ? color : crmV2.borderStrong}`,
    color: active ? color : crmV2.textMuted, fontWeight: active ? 700 : 600,
  } as const)

  const footer = (
    <button type="button" onClick={onNoteSave} disabled={saving} style={{
      flex: 1, height: 42, borderRadius: 999, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
      background: saved ? crmV2.successStrong : crmV2.primary, color: '#fff', cursor: saving ? 'wait' : 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      <Check size={15} /> {saved ? 'Note enregistrée' : saving ? 'Enregistrement…' : 'Enregistrer la note'}
    </button>
  )

  return (
    <CrmV2Drawer open onClose={onClose} header={header} footer={footer}>
      {/* Infos prospect */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${crmV2.borderLight}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <InfoLine icon={<Mail size={14} />}>{rdv.prospect_email}</InfoLine>
        {rdv.prospect_phone && (
          <InfoLine icon={<Phone size={14} />}>
            <a href={`tel:${rdv.prospect_phone.replace(/\s/g, '')}`} style={{ color: crmV2.link, textDecoration: 'none', fontWeight: 600 }}>{rdv.prospect_phone}</a>
          </InfoLine>
        )}
        {rdv.formation_type && (
          <InfoLine icon={<Tag size={14} />}>Filière : <strong style={{ color: crmV2.text }}>{rdv.formation_type}</strong></InfoLine>
        )}
        {rdv.classe_actuelle && (
          <InfoLine icon={<GraduationCap size={14} />}>Classe actuelle : <strong style={{ color: crmV2.text }}>{rdv.classe_actuelle}</strong></InfoLine>
        )}
        {rdv.source && (
          <InfoLine icon={<User size={14} />}>{formatAppointmentPlacementLabel(rdv)}</InfoLine>
        )}
        {rdv.rdv_users && (
          <InfoLine icon={<User size={14} />}>Closer : <strong style={{ color: crmV2.text }}>{rdv.rdv_users.name}</strong></InfoLine>
        )}
        {(rdv.hubspot_contact_id || rdv.hubspot_deal_id) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            {rdv.hubspot_contact_id && (
              <a href={`/admin/crm/contacts/${rdv.hubspot_contact_id}`} target="_blank" rel="noopener noreferrer" style={linkPill}>
                <ExternalLink size={12} /> Ouvrir le contact
              </a>
            )}
            {rdv.hubspot_deal_id && (
              <a href={`/admin/crm/deals/${rdv.hubspot_deal_id}`} target="_blank" rel="noopener noreferrer" style={linkPill}>
                <ExternalLink size={12} /> Ouvrir la transaction
              </a>
            )}
          </div>
        )}
      </div>

      {/* Mode du RDV */}
      {rdv.meeting_type && (
        <Section title="Mode du RDV">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', color: meetingColor }}>
              {rdv.meeting_type === 'visio' ? <Video size={14} /> : rdv.meeting_type === 'telephone' ? <PhoneCall size={14} /> : <MapPin size={14} />}
            </span>
            <span style={{ color: meetingColor, fontWeight: 700 }}>{meetingLabel}</span>
            {rdv.meeting_type === 'presentiel' && rdv.meeting_link && !/^https?:\/\//i.test(rdv.meeting_link) && (
              <span style={{ color: crmV2.text, fontWeight: 600 }}>— {rdv.meeting_link}</span>
            )}
            {rdv.meeting_type === 'visio' && rdv.meeting_link && (
              <a href={rdv.meeting_link} target="_blank" rel="noopener noreferrer" style={linkPill}>
                <Video size={12} /> Rejoindre
              </a>
            )}
          </div>
          {onMeetingModeUpdated && (
            <div style={{ marginTop: 10 }}>
              <MeetingModeSwitcher
                appointmentId={rdv.id}
                meetingType={rdv.meeting_type}
                meetingLink={rdv.meeting_link}
                status={rdv.status}
                onUpdated={onMeetingModeUpdated}
              />
            </div>
          )}
        </Section>
      )}

      {/* Retour prospect */}
      {(rdv.status === 'confirme' || rdv.status === 'confirme_prospect' || rdv.status === 'annule') && (
        <Section title="Retour prospect">
          <div style={{ display: 'flex', gap: 8 }}>
            {onConfirm && (
              <button type="button" onClick={onConfirm} disabled={confirming || cancelling}
                style={{ ...toggleBtn(rdv.status === 'confirme_prospect', '#10b981', 'rgba(16,185,129,0.12)'), opacity: confirming ? 0.7 : 1 }}>
                <CircleCheck size={15} /> {confirming ? 'Confirmation…' : 'Prospect confirmé'}
              </button>
            )}
            {onCancel && (
              <button type="button" onClick={onCancel} disabled={cancelling || confirming}
                style={{ ...toggleBtn(rdv.status === 'annule', '#6b7280', 'rgba(107,114,128,0.12)'), opacity: cancelling ? 0.7 : 1 }}>
                <Ban size={15} /> {cancelling ? 'Annulation…' : 'Prospect a annulé'}
              </button>
            )}
          </div>
          {(rdv.status === 'confirme_prospect' || rdv.status === 'annule') && onReset && (
            <button type="button" onClick={onReset} disabled={confirming || cancelling} style={{
              marginTop: 8, background: 'none', border: 'none', color: crmV2.link, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: (confirming || cancelling) ? 0.5 : 1,
            }}>
              <RotateCcw size={12} /> Remettre en attente de confirmation
            </button>
          )}
        </Section>
      )}

      {/* Issue du RDV (lecture seule) */}
      <Section title="Issue du RDV">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {RESULT_ACTIONS.map(action => {
            const s = rdvStatusStyle(action.status)
            const isActive = rdv.status === action.status
            return (
              <div key={action.status} style={{
                background: isActive ? s.bg : crmV2.bg, border: `1px solid ${isActive ? s.border : crmV2.border}`,
                borderRadius: 12, padding: '9px 12px', opacity: isActive ? 1 : 0.45,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? s.color : crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {action.icon} {action.label}
                  {isActive && <Check size={13} style={{ marginLeft: 'auto' }} />}
                </div>
                <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 2 }}>{action.hint}</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Rapport closer (lecture seule) */}
      {(rdv.report_summary || rdv.report_telepro_advice) && (
        <Section title="Rapport du RDV">
          {rdv.report_summary && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: crmV2.goldDark, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Résumé du RDV</div>
              <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 10, padding: '10px 14px' }}>{rdv.report_summary}</div>
            </div>
          )}
          {rdv.report_telepro_advice && (
            <div>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conseil pour toi</div>
              <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 14px' }}>{rdv.report_telepro_advice}</div>
            </div>
          )}
        </Section>
      )}

      {/* Note interne — éditable */}
      <div style={{ padding: '14px 18px 18px' }}>
        <CrmV2SectionLabel icon={<FileText size={12} color={crmV2.gold} />} style={{ marginBottom: 10 }}>Note interne</CrmV2SectionLabel>
        <textarea
          value={noteValue}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Tes notes d'appel…"
          rows={4}
          style={{
            width: '100%', minHeight: 90, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '10px 12px',
            fontSize: 14, color: crmV2.text, background: crmV2.bg, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            resize: 'vertical', lineHeight: 1.5,
          }}
        />
      </div>
    </CrmV2Drawer>
  )
}
