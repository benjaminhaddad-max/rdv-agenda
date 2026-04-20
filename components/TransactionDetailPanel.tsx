'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, Phone, Mail, MapPin, BookOpen, GraduationCap, Calendar, Users } from 'lucide-react'
import InlineEditField from './InlineEditField'

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
  } | null
}

interface Props {
  deal: TransactionDetail
  onClose: () => void
  onUpdate: () => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, { label: string; color: string; emoji: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444', emoji: '🔴' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb', emoji: '🔵' },
  '3165428981': { label: 'Délai Réflexion',       color: '#ccac71', emoji: '🟡' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e', emoji: '🟢' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7', emoji: '🟣' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a', emoji: '✅' },
  '3165428985': { label: 'Fermé Perdu',           color: '#7c98b6', emoji: '⚫' },
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
]

const STAGE_OPTIONS = Object.entries(STAGE_MAP).map(([id, s]) => ({
  value: id, label: `${s.emoji} ${s.label}`,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, marginTop: 20 }}>
      {children}
    </div>
  )
}

function FieldRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, minHeight: 28 }}>
      <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {icon}
        <span style={{ fontSize: 11, color: '#7c98b6', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color || '#4f6ef7',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TransactionDetailPanel({ deal, onClose, onUpdate }: Props) {
  const [closers, setClosers] = useState<User[]>([])
  const [telepros, setTelepros] = useState<User[]>([])

  useEffect(() => {
    fetch('/api/users?role=commercial').then(r => r.json()).then(d => setClosers(Array.isArray(d) ? d : []))
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => setTelepros(Array.isArray(d) ? d : []))
  }, [])

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Save helpers
  async function saveDeal(field: string, value: string) {
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

  const closerOptions = closers
    .filter(c => c.hubspot_owner_id)
    .map(c => ({ value: c.hubspot_owner_id!, label: c.name }))

  const teleproOptions = telepros
    .filter(t => t.hubspot_user_id)
    .map(t => ({ value: t.hubspot_user_id!, label: t.name }))

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '100vw',
        background: '#0d1a28', borderLeft: '1px solid #cbd6e2', zIndex: 1000,
        display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        animation: 'slideIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #cbd6e2',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#33475b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deal.dealname || '(sans nom)'}
            </div>
            <div style={{ fontSize: 12, color: '#7c98b6', marginTop: 2 }}>{contactName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={`https://app.hubspot.com/contacts/43296174/deal/${deal.hubspot_deal_id}`}
              target="_blank" rel="noopener noreferrer"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 6, padding: '4px 8px', color: '#f97316', fontSize: 11, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ExternalLink size={10} /> HS
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>

          {/* ── Transaction ────────────────────────────────────────────────── */}
          <SectionTitle>Transaction</SectionTitle>

          <FieldRow icon={<GraduationCap size={11} style={{ color: '#7c98b6' }} />} label="Nom">
            <InlineEditField value={deal.dealname} onSave={v => saveDeal('dealname', v)} fontWeight={600} />
          </FieldRow>

          <FieldRow icon={<BookOpen size={11} style={{ color: '#7c98b6' }} />} label="Formation">
            <InlineEditField value={deal.formation} onSave={v => saveDeal('formation', v)} type="select" options={FORMATION_OPTIONS} color="#ccac71" fontWeight={700} />
          </FieldRow>

          <FieldRow label="Étape">
            <InlineEditField
              value={deal.dealstage}
              onSave={v => saveDeal('dealstage', v)}
              type="select"
              options={STAGE_OPTIONS}
              color={STAGE_MAP[deal.dealstage ?? '']?.color ?? '#516f90'}
              fontWeight={700}
            />
          </FieldRow>

          <FieldRow icon={<Calendar size={11} style={{ color: '#7c98b6' }} />} label="Date RDV">
            <InlineEditField value={deal.closedate?.split('T')[0] ?? null} onSave={v => saveDeal('closedate', v)} type="date" fontSize={12} />
          </FieldRow>

          <FieldRow label="Description">
            <InlineEditField value={deal.description} onSave={v => saveDeal('description', v)} placeholder="Ajouter une description…" fontSize={12} color="#516f90" />
          </FieldRow>

          {/* ── Équipe ─────────────────────────────────────────────────────── */}
          <SectionTitle><Users size={11} style={{ display: 'inline', marginRight: 4 }} />Équipe</SectionTitle>

          <FieldRow label="Closer">
            {closerOptions.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {deal.closer && <Avatar name={deal.closer.name} color={deal.closer.avatar_color} size={22} />}
                <InlineEditField
                  value={deal.hubspot_owner_id ?? null}
                  onSave={v => saveDeal('hubspot_owner_id', v)}
                  type="select"
                  options={closerOptions}
                  color="#ccac71"
                />
              </div>
            ) : (
              <span style={{ color: '#3a5070', fontSize: 12 }}>Chargement…</span>
            )}
          </FieldRow>

          <FieldRow label="Télépro">
            {teleproOptions.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {deal.telepro && <Avatar name={deal.telepro.name} color={deal.telepro.avatar_color} size={22} />}
                <InlineEditField
                  value={deal.teleprospecteur ?? null}
                  onSave={v => saveDeal('teleprospecteur', v)}
                  type="select"
                  options={teleproOptions}
                  color="#4cabdb"
                />
              </div>
            ) : (
              <span style={{ color: '#3a5070', fontSize: 12 }}>Chargement…</span>
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

              <FieldRow icon={<Phone size={11} style={{ color: '#7c98b6' }} />} label="Téléphone">
                <InlineEditField value={deal.contact.phone} onSave={v => saveContact('phone', v)} color="#22c55e" />
              </FieldRow>

              {deal.contact.email && (
                <FieldRow icon={<Mail size={11} style={{ color: '#7c98b6' }} />} label="Email">
                  <a href={`mailto:${deal.contact.email}`} style={{ color: '#4cabdb', fontSize: 13, textDecoration: 'none' }}>
                    {deal.contact.email}
                  </a>
                </FieldRow>
              )}

              <FieldRow icon={<BookOpen size={11} style={{ color: '#7c98b6' }} />} label="Classe">
                <InlineEditField value={deal.contact.classe_actuelle} onSave={v => saveContact('classe_actuelle', v)} type="select" options={CLASSE_OPTIONS} />
              </FieldRow>

              <FieldRow icon={<MapPin size={11} style={{ color: '#7c98b6' }} />} label="Zone">
                <InlineEditField value={zone} onSave={v => saveContact('zone_localite', v)} color="#516f90" fontSize={12} />
              </FieldRow>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
