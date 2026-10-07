'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, Phone, Mail, MapPin, BookOpen, GraduationCap, Calendar, Users } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Avatar, CrmV2SectionLabel, CrmV2StatusPill } from './crm-v2/primitives'
import { CrmV2ModalHeader, CrmV2ModalShell } from './crm-v2/modals/ModalShell'
import InlineEditField from './InlineEditField'
import { isAllowedManualTransition, MANUAL_LOCK_MESSAGE } from '@/lib/dealstage-rules'

// ── Types ────────────────────────────────────────────────────────────────────

interface User { id: string; name: string; role: string; avatar_color: string; hubspot_owner_id?: string; hubspot_user_id?: string }

export interface TransactionDetail {
  hubspot_deal_id: string
  dealname: string | null
  dealstage: string | null
  formation: string | null
  closedate: string | null
  createdate: string | null
  description: string | null
  hubspot_owner_id?: string | null
  teleprospecteur?: string | null
  closer: { id: string; name: string; avatar_color: string } | null
  telepro: { id: string; name: string; avatar_color: string } | null
  contact: {
    hubspot_contact_id: string
    firstname: string | null
    lastname: string | null
    email: string | null
    phone: string | null
    classe_actuelle: string | null
    zone_localite: string | null
    departement: string | null
    parcoursup_verdict?: { status: string | null; label: string | null } | null
  } | null
}

interface Props {
  deal: TransactionDetail
  onClose: () => void
  onUpdate: () => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb' },
  '3165428981': { label: 'Délai Réflexion',       color: '#b8963e' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#7c98b6' },
}

const FORMATION_OPTIONS = [
  { value: 'PASS', label: 'PASS' }, { value: 'LSPS', label: 'LSPS' },
  { value: 'LAS', label: 'LAS' }, { value: 'P-1', label: 'P-1' },
  { value: 'P-2', label: 'P-2' }, { value: 'PAES FR', label: 'PAES FR' },
  { value: 'PAES EU', label: 'PAES EU' }, { value: 'LSPS2 UPEC', label: 'LSPS2 UPEC' },
  { value: 'LSPS3 UPEC', label: 'LSPS3 UPEC' },
]

const CLASSE_OPTIONS = [
  { value: 'Terminale', label: 'Terminale' }, { value: 'Première', label: 'Première' },
  { value: 'Seconde', label: 'Seconde' }, { value: 'Troisième', label: 'Troisième' },
  { value: 'PASS', label: 'PASS' }, { value: 'LSPS 1', label: 'LSPS 1' },
  { value: 'LSPS 2', label: 'LSPS 2' }, { value: 'LSPS 3', label: 'LSPS 3' },
  { value: 'LAS 1', label: 'LAS 1' }, { value: 'LAS 2', label: 'LAS 2' },
  { value: 'LAS 3', label: 'LAS 3' }, { value: 'Etudes médicales', label: 'Études médicales' },
  { value: 'Etudes Sup.', label: 'Études Sup.' }, { value: 'Autres', label: 'Autres' },
]

const STAGE_OPTIONS = Object.entries(STAGE_MAP).map(([id, s]) => ({
  value: id, label: s.label,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <CrmV2SectionLabel icon={icon} style={{ marginBottom: 10, marginTop: 20 }}>
      {children}
    </CrmV2SectionLabel>
  )
}

function FieldRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, borderBottom: `1px solid ${crmV2.borderLight}` }}>
      <div style={{ width: 110, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, color: crmV2.textFaint }}>
        {icon}
        <span style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TransactionDetailPanel({ deal, onClose, onUpdate }: Props) {
  // On charge TOUS les utilisateurs (closers, admins, managers, télépros…)
  // pour que les dropdowns Closer et Télépro du panel se comportent comme
  // la propriété "Owner" de HubSpot (tout utilisateur créé apparaît).
  const [allUsers, setAllUsers] = useState<User[]>([])

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setAllUsers(Array.isArray(d) ? d : []))
  }, [])

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Save helpers
  async function saveDeal(field: string, value: string) {
    // Lock dealstage : la plateforme Diploma pilote les stages aval. Seules les
    // transitions amont -> amont, et amont -> Ferme Perdu sont autorisees.
    if (field === 'dealstage' && !isAllowedManualTransition(deal.dealstage, value)) {
      alert(MANUAL_LOCK_MESSAGE)
      return
    }
    await fetch(`/api/crm/deals/${deal.hubspot_deal_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    onUpdate()
  }

  async function saveContact(field: string, value: string) {
    if (!deal.contact) return
    await fetch(`/api/crm/contacts/${deal.contact.hubspot_contact_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    onUpdate()
  }

  const contactName = [deal.contact?.firstname, deal.contact?.lastname].filter(Boolean).join(' ') || '—'
  const zone = deal.contact?.zone_localite || deal.contact?.departement || null

  const closerOptions = allUsers
    .filter(c => c.hubspot_owner_id)
    .map(c => ({ value: c.hubspot_owner_id!, label: c.name }))

  const teleproOptions = allUsers
    .filter(t => t.hubspot_user_id)
    .map(t => ({ value: t.hubspot_user_id!, label: t.name }))

  const stage = STAGE_MAP[deal.dealstage ?? '']

  return (
    <CrmV2ModalShell
      variant="drawer"
      onClose={onClose}
      zIndex={999}
      bodyStyle={{ paddingTop: 0 }}
      header={
        <CrmV2ModalHeader
          title={<span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.dealname || '(sans nom)'}</span>}
          subtitle={contactName}
          onClose={onClose}
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {stage && <CrmV2StatusPill label={stage.label} color={stage.color} />}
              {deal.formation && <CrmV2StatusPill label={deal.formation} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} />}
              <span style={{ flex: 1 }} />
              <a
                href={`/admin/crm/deals/${deal.hubspot_deal_id}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 12px',
                  border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text,
                  fontSize: 12, fontWeight: 600, textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} /> Ouvrir la fiche
              </a>
            </div>
          }
        />
      }
    >
      {/* ── Transaction ────────────────────────────────────────────────── */}
      <SectionTitle>Transaction</SectionTitle>

      <FieldRow icon={<GraduationCap size={14} />} label="Nom">
        <InlineEditField value={deal.dealname} onSave={v => saveDeal('dealname', v)} fontWeight={600} />
      </FieldRow>

      <FieldRow icon={<BookOpen size={14} />} label="Formation">
        <InlineEditField value={deal.formation} onSave={v => saveDeal('formation', v)} type="select" options={FORMATION_OPTIONS} color={crmV2.goldDark} fontWeight={700} />
      </FieldRow>

      <FieldRow label="Étape">
        <InlineEditField
          value={deal.dealstage}
          onSave={v => saveDeal('dealstage', v)}
          type="select"
          options={STAGE_OPTIONS.filter(opt =>
            opt.value === deal.dealstage || isAllowedManualTransition(deal.dealstage, opt.value)
          )}
          color={stage?.color ?? crmV2.textMuted}
          fontWeight={700}
        />
      </FieldRow>

      <FieldRow icon={<Calendar size={14} />} label="Date RDV">
        <InlineEditField value={deal.closedate?.split('T')[0] ?? null} onSave={v => saveDeal('closedate', v)} type="date" />
      </FieldRow>

      <FieldRow label="Description">
        <InlineEditField value={deal.description} onSave={v => saveDeal('description', v)} placeholder="Ajouter une description…" fontSize={13} color={crmV2.textMuted} />
      </FieldRow>

      {/* ── Équipe ─────────────────────────────────────────────────────── */}
      <SectionTitle icon={<Users size={14} color={crmV2.gold} />}>Équipe</SectionTitle>

      <FieldRow label="Closer">
        {closerOptions.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {deal.closer && <CrmV2Avatar name={deal.closer.name} color={deal.closer.avatar_color || crmV2.goldGradient} size={22} />}
            <InlineEditField
              value={deal.hubspot_owner_id ?? null}
              onSave={v => saveDeal('hubspot_owner_id', v)}
              type="select"
              options={closerOptions}
              color={crmV2.text}
            />
          </div>
        ) : (
          <span style={{ color: crmV2.textFaint, fontSize: 13 }}>Chargement…</span>
        )}
      </FieldRow>

      <FieldRow label="Télépro">
        {teleproOptions.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {deal.telepro && <CrmV2Avatar name={deal.telepro.name} color={deal.telepro.avatar_color || crmV2.goldGradient} size={22} />}
            <InlineEditField
              value={deal.teleprospecteur ?? null}
              onSave={v => saveDeal('teleprospecteur', v)}
              type="select"
              options={teleproOptions}
              color={crmV2.text}
            />
          </div>
        ) : (
          <span style={{ color: crmV2.textFaint, fontSize: 13 }}>Chargement…</span>
        )}
      </FieldRow>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      {deal.contact && (
        <>
          <SectionTitle>Contact</SectionTitle>

          <FieldRow label="Prénom">
            <InlineEditField value={deal.contact.firstname} onSave={v => saveContact('firstname', v)} fontWeight={600} />
          </FieldRow>

          <FieldRow label="Nom">
            <InlineEditField value={deal.contact.lastname} onSave={v => saveContact('lastname', v)} fontWeight={600} />
          </FieldRow>

          <FieldRow icon={<Phone size={14} />} label="Téléphone">
            <InlineEditField value={deal.contact.phone} onSave={v => saveContact('phone', v)} color={crmV2.link} />
          </FieldRow>

          {deal.contact.email && (
            <FieldRow icon={<Mail size={14} />} label="Email">
              <a href={`mailto:${deal.contact.email}`} style={{ color: crmV2.link, fontSize: 13, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {deal.contact.email}
              </a>
            </FieldRow>
          )}

          <FieldRow icon={<BookOpen size={14} />} label="Classe">
            <InlineEditField value={deal.contact.classe_actuelle} onSave={v => saveContact('classe_actuelle', v)} type="select" options={CLASSE_OPTIONS} />
          </FieldRow>

          <FieldRow icon={<MapPin size={14} />} label="Zone">
            <InlineEditField value={zone} onSave={v => saveContact('zone_localite', v)} />
          </FieldRow>
        </>
      )}
    </CrmV2ModalShell>
  )
}
