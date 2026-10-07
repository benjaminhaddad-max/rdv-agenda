'use client'

import { useState, type ReactNode } from 'react'
import {
  addDays, addMonths, format, isAfter, isBefore, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  AlertTriangle, ArrowRight, Calendar, Check, ChevronLeft, ChevronRight, CircleCheck, Clock, Copy, FileText,
  GraduationCap, Mail, MapPin, Phone, Plus, RefreshCw, Search, Tag, User, Video, X,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Card, CrmV2SectionLabel } from '@/components/crm-v2/primitives'
import { CAMPUS_OPTIONS, CLASSES, FORMATIONS, generateJitsiLink } from './types'
import type { NewRdvForm } from './useNewRdvForm'
import { TpGoldButton, TpLabel, TpMobileHeader, TpStepBar, tpInput } from './ui'

const AVATAR_COLORS = ['#C9A84C', '#0091ae', '#516f90', '#00bda5', '#a855f7', '#4cabdb']

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function avatarColor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function Avatar({ name, seed, size = 40 }: { name: string; seed: string; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '36%', background: avatarColor(seed), color: '#fff',
      fontSize: Math.round(size * 0.35), fontWeight: 700, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials(name)}
    </span>
  )
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12,
      padding: '10px 14px', color: '#dc2626', fontSize: 13,
    }}>
      {children}
    </div>
  )
}

/* ─── Étape 1 : contact ─────────────────────────────────────────────────── */

function ContactStep({ form, isMobile, linova }: { form: NewRdvForm; isMobile: boolean; linova: boolean }) {
  const {
    contact, contactName, contactEmail, lookupMode, setLookupMode, lookupInput, setLookupInput, lookupLoading,
    lookupError, setLookupError, searchResults, setSearchResults, recentLookups, clearRecentLookups,
    searchContact, pickSearchResult, resetContact,
  } = form

  if (contact) {
    const name = linova
      ? [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || '(Sans nom)'
      : contactName || '(Sans nom)'
    const mail = linova ? (contact.properties.email || '—') : contactEmail
    return (
      <CrmV2Card style={{ padding: 12, borderColor: 'rgba(0,189,165,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={name} seed={contact.id} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mail} · CRM #{contact.id}</div>
          </div>
          <span style={{
            width: 26, height: 26, borderRadius: '50%', background: crmV2.gold, color: '#fff', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={14} strokeWidth={3} />
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={resetContact} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 999,
            background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.35)', color: '#d13a41',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            <X size={14} /> Changer de contact
          </button>
          {linova && (
            <button type="button" onClick={() => form.setShowLinovaModal(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 999,
              background: crmV2.gold, border: 'none', color: '#2d3e50',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              <Calendar size={14} /> Programmer RDV Linova
            </button>
          )}
        </div>
      </CrmV2Card>
    )
  }

  const modes = [
    { key: 'search' as const, icon: <Search size={13} />, label: linova ? 'Contact existant CRM' : 'Rechercher dans le CRM' },
    { key: 'new' as const, icon: <Plus size={13} />, label: 'Nouveau contact' },
  ]

  const resultRow = (r: { hubspot_contact_id: string; firstname?: string; lastname?: string; email?: string; phone?: string; classe_actuelle?: string; formation_demandee?: string }, recent: boolean) => {
    const fullName = [r.firstname, r.lastname].filter(Boolean).join(' ') || '(Sans nom)'
    const meta = [r.phone, r.classe_actuelle, r.formation_demandee].filter(Boolean).join(' · ')
    return (
      <button
        key={r.hubspot_contact_id}
        type="button"
        onClick={() => pickSearchResult(r)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 12, minHeight: 56,
          background: 'transparent', border: 'none', borderBottom: `1px solid ${crmV2.borderLight}`,
          textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = crmV2.rowHover)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {recent
          ? <span style={{ width: 40, height: 40, borderRadius: '36%', background: crmV2.goldSoft, color: crmV2.gold, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Clock size={16} /></span>
          : <Avatar name={fullName} seed={r.hubspot_contact_id} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email || '—'}</div>
          {meta && <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>}
        </div>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Choix Rechercher / Nouveau contact */}
      <div style={{ display: 'flex', gap: 2, background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 999, padding: 3 }}>
        {modes.map(m => {
          const on = lookupMode === m.key
          return (
            <button key={m.key} type="button"
              onClick={() => { setLookupMode(m.key); setLookupInput(''); setLookupError(null); setSearchResults([]) }}
              style={{
                flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: 'none', borderRadius: 999, padding: '9px 6px', minHeight: 38, cursor: 'pointer', fontFamily: 'inherit',
                background: on ? 'rgba(201,168,76,0.15)' : 'transparent', color: on ? crmV2.goldDark : crmV2.textMuted,
                fontSize: 13, fontWeight: on ? 700 : 600, whiteSpace: 'nowrap',
              }}>
              {m.icon} {m.label}
            </button>
          )
        })}
      </div>

      {lookupMode === 'search' && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: crmV2.bg, border: `1.5px solid ${lookupInput ? crmV2.gold : crmV2.borderStrong}`,
            borderRadius: 12, padding: '0 6px 0 14px', height: 48, boxSizing: 'border-box',
          }}>
            <Search size={16} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
            <input
              value={lookupInput}
              onChange={e => setLookupInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchContact()}
              placeholder="Nom, prénom, email ou téléphone…"
              autoFocus={!isMobile}
              enterKeyHint="search"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: crmV2.text, fontFamily: 'inherit', height: '100%' }}
            />
            <button type="button" onClick={searchContact} disabled={lookupLoading || !lookupInput.trim()}
              style={{
                height: 36, padding: '0 14px', borderRadius: 999, border: 'none', flexShrink: 0, fontFamily: 'inherit',
                background: lookupInput.trim() ? crmV2.gold : crmV2.bgSoft, color: lookupInput.trim() ? '#2d3e50' : crmV2.textFaint,
                fontSize: 13, fontWeight: 700, cursor: lookupInput.trim() ? 'pointer' : 'default',
              }}>
              {lookupLoading ? '…' : 'Rechercher'}
            </button>
          </div>
          {!linova && (
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>Recherche dans la base contacts du CRM (nom, email, téléphone).</div>
          )}

          {/* Derniers contacts ouverts — tant qu'aucune recherche n'est en cours */}
          {!lookupInput.trim() && searchResults.length === 0 && recentLookups.length > 0 && (
            <CrmV2Card style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${crmV2.borderLight}` }}>
                <CrmV2SectionLabel icon={<Clock size={12} />}>Recherches récentes</CrmV2SectionLabel>
                <button type="button" onClick={clearRecentLookups} style={{ background: 'none', border: 'none', color: crmV2.link, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
                  Effacer
                </button>
              </div>
              {recentLookups.map(r => resultRow(r, true))}
            </CrmV2Card>
          )}

          {searchResults.length > 0 && (
            <CrmV2Card style={{ overflow: 'hidden', maxHeight: isMobile ? undefined : 360, overflowY: isMobile ? undefined : 'auto' }}>
              {searchResults.map(r => resultRow(r, false))}
            </CrmV2Card>
          )}
        </>
      )}

      {lookupMode === 'new' && <NewContactFields form={form} isMobile={isMobile} />}

      {lookupError && <ErrorBox>{lookupError}</ErrorBox>}
    </div>
  )
}

function NewContactFields({ form, isMobile }: { form: NewRdvForm; isMobile: boolean }) {
  const {
    newFirstname, setNewFirstname, newLastname, setNewLastname, newEmail, setNewEmail, newPhone, setNewPhone,
    newClasse, setNewClasse, newDepartement, setNewDepartement, creating, newEmailFormatError, newEmailChecking,
    newEmailExisting, createNewContact, loadExistingEmailContact,
  } = form
  const allFilled =
    newFirstname.trim() && newLastname.trim() && newEmail.trim() &&
    newPhone.trim() && newDepartement.trim() && newClasse.trim()
  const canCreate = !!allFilled && !newEmailFormatError && !newEmailExisting && !newEmailChecking && !creating
  const inp = tpInput(isMobile)
  return (
    <CrmV2Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Email en premier */}
      <div style={{ position: 'relative' }}>
        <input
          type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email *" autoFocus={!isMobile}
          style={{ ...inp, borderColor: newEmailFormatError ? '#ef4444' : newEmailExisting ? '#e6d3a6' : crmV2.borderStrong, paddingRight: newEmailChecking ? 96 : 12 }}
        />
        {newEmailChecking && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: crmV2.textFaint }}>
            vérification…
          </span>
        )}
      </div>
      {newEmailFormatError && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: -4 }}>{newEmailFormatError}</div>}
      {newEmailExisting && (
        <div style={{ background: '#f7efdc', border: '1px solid #e6d3a6', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: crmV2.goldDark, fontSize: 13, marginBottom: 4 }}>
            <AlertTriangle size={14} /> Ce contact existe déjà
          </div>
          <div style={{ fontSize: 13, color: '#6b5630', lineHeight: 1.5, marginBottom: 10 }}>
            Un contact avec cet email est déjà dans le CRM
            {newEmailExisting.firstname || newEmailExisting.lastname
              ? <> au nom de <strong>{[newEmailExisting.firstname, newEmailExisting.lastname].filter(Boolean).join(' ')}</strong></>
              : null}.
          </div>
          <button type="button" onClick={loadExistingEmailContact} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 999,
            background: crmV2.gold, border: 'none', color: '#2d3e50', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Utiliser ce contact pour le RDV <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input value={newFirstname} onChange={e => setNewFirstname(e.target.value)} placeholder="Prénom *" style={inp} />
        <input value={newLastname} onChange={e => setNewLastname(e.target.value)} placeholder="Nom *" style={inp} />
      </div>
      <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone *" style={inp} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input type="text" inputMode="numeric" value={newDepartement} onChange={e => setNewDepartement(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Département * (ex : 75)" maxLength={3} style={inp} />
        <select value={newClasse} onChange={e => setNewClasse(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
          <option value="">Classe actuelle *</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <button type="button" onClick={createNewContact} disabled={!canCreate} style={{
        height: isMobile ? 46 : 40, borderRadius: 999, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
        background: canCreate ? crmV2.successStrong : crmV2.bgSoft, color: canCreate ? '#fff' : crmV2.textFaint,
        cursor: !canCreate ? 'not-allowed' : creating ? 'wait' : 'pointer',
      }}>
        {creating ? 'Création…' : 'Créer le contact'}
      </button>
    </CrmV2Card>
  )
}

/* ─── Étape 2 : créneau ─────────────────────────────────────────────────── */

function CalendarBlock({ form }: { form: NewRdvForm }) {
  const { calMonth, setCalMonth, today, maxBookingDate, selectedDate, handleSelectDate } = form
  const monthStart = startOfMonth(calMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const canPrev = isAfter(monthStart, startOfMonth(today))
  const canNext = isBefore(monthStart, startOfMonth(maxBookingDate))
  const nav = (enabled: boolean) => ({
    width: 36, height: 36, borderRadius: 999, background: crmV2.bg, cursor: enabled ? 'pointer' : 'not-allowed',
    border: `1px solid ${enabled ? crmV2.borderStrong : crmV2.border}`, color: enabled ? crmV2.text : crmV2.borderStrong,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  } as const)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" aria-label="Mois précédent" disabled={!canPrev} onClick={() => canPrev && setCalMonth(subMonths(monthStart, 1))} style={nav(canPrev)}>
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, textTransform: 'capitalize' }}>
          {format(monthStart, 'MMMM yyyy', { locale: fr })}
        </span>
        <button type="button" aria-label="Mois suivant" disabled={!canNext} onClick={() => canNext && setCalMonth(addMonths(monthStart, 1))} style={nav(canNext)}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
        {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#a4844c', textTransform: 'uppercase', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {gridDays.map(day => {
          const inMonth = isSameMonth(day, monthStart)
          const disabled = !inMonth || isBefore(day, today) || isAfter(day, maxBookingDate)
          const sel = !!selectedDate && isSameDay(day, selectedDate)
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && handleSelectDate(day)}
              style={{
                height: 38, borderRadius: 10, fontFamily: 'inherit', padding: 0,
                background: sel ? 'rgba(204,172,113,0.18)' : disabled ? 'transparent' : crmV2.bg,
                border: `1px solid ${sel ? 'rgba(204,172,113,0.55)' : disabled ? 'transparent' : crmV2.border}`,
                color: sel ? crmV2.goldDark : disabled ? '#cbbf9e' : crmV2.text,
                fontSize: 14, fontWeight: sel ? 700 : 500, cursor: disabled ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !inMonth ? 0 : 1,
              }}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SlotsBlock({ form, isMobile }: { form: NewRdvForm; isMobile: boolean }) {
  const { selectedDate, slots, slotsLoading, selectedSlot, setSelectedSlot } = form
  if (!selectedDate) {
    return <div style={{ fontSize: 13, color: crmV2.textMuted }}>Choisis une date pour voir les créneaux disponibles.</div>
  }
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <TpLabel
          icon={<Clock size={12} color="#22c55e" />}
          extra={slots.length > 0 ? <span style={{ fontSize: 10, color: '#16a34a', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{slots.length} dispo</span> : null}
        >
          Créneau * · {format(selectedDate, 'EEE d MMM', { locale: fr })}
        </TpLabel>
      </div>
      {slotsLoading ? (
        <div style={{ color: crmV2.textMuted, fontSize: 13, padding: '8px 0' }}>Chargement…</div>
      ) : slots.length === 0 ? (
        <ErrorBox>Aucun créneau disponible.</ErrorBox>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)', gap: 6 }}>
          {slots.map(slot => {
            const sel = selectedSlot?.start === slot.start
            return (
              <button key={slot.start} type="button" onClick={() => setSelectedSlot(slot)}
                style={{
                  height: 40, borderRadius: 10, fontFamily: 'inherit', position: 'relative', cursor: 'pointer',
                  background: sel ? 'rgba(34,197,94,0.12)' : crmV2.bgHover, border: `1px solid ${sel ? 'rgba(34,197,94,0.45)' : crmV2.border}`,
                  color: sel ? '#15803d' : crmV2.text, fontSize: 14, fontWeight: sel ? 700 : 500,
                }}>
                {format(new Date(slot.start), 'HH:mm')}
                {slot.count && slot.count > 1 && (
                  <span style={{ position: 'absolute', top: 2, right: 5, fontSize: 9, color: crmV2.textFaint }}>{slot.count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Étape 3 : infos ───────────────────────────────────────────────────── */

function InfosFields({ form, isMobile, teleproUserId }: { form: NewRdvForm; isMobile: boolean; teleproUserId: string }) {
  const {
    phone, setPhone, email, setEmail, emailSynced, syncEmail, emailParent, setEmailParent, existingTeleproId,
    existingTeleproName, departement, setDepartement, classeActuelle, setClasseActuelle, formation, setFormation,
    meetingType, chooseMeetingType, meetingCampus, setMeetingCampus, meetingLink, setMeetingLink, linkCopied,
    copyMeetingLink, notes, setNotes,
  } = form
  const inp = tpInput(isMobile)
  const field = (label: ReactNode, control: ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>{label}{control}</label>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {field(
        <TpLabel icon={<Phone size={12} color={crmV2.gold} />}>Téléphone *</TpLabel>,
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex : 0612345678" style={inp} />,
      )}
      {field(
        <TpLabel icon={<Mail size={12} color="#06b6d4" />} extra={emailSynced ? <span style={{ fontSize: 10, color: '#16a34a', textTransform: 'none', letterSpacing: 0 }}>Mis à jour</span> : null}>Email</TpLabel>,
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={syncEmail} placeholder="email@exemple.com" style={inp} />,
      )}
      {field(
        <TpLabel icon={<Mail size={12} color="#a78bfa" />} extra={<span style={{ fontSize: 10, color: crmV2.textFaint, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(facultatif)</span>}>Email parent</TpLabel>,
        <input type="email" value={emailParent} onChange={e => setEmailParent(e.target.value)} placeholder="parent@exemple.com" style={inp} />,
      )}
      {/* Téléprospecteur déjà assigné — affiché en grisé UNIQUEMENT si ≠ télépro courant
          (signale qu'au Valider, le contact sera réassigné au télépro courant) */}
      {existingTeleproId && existingTeleproId !== teleproUserId && field(
        <TpLabel icon={<User size={12} color={crmV2.textFaint} />} extra={<span style={{ fontSize: 10, color: crmV2.goldDark, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(sera réassigné à vous au Valider)</span>}>Téléprospecteur actuel du contact</TpLabel>,
        <input type="text" value={existingTeleproName || 'Télépro inconnu'} disabled style={{ ...inp, background: crmV2.bgSoft, color: crmV2.textMuted, cursor: 'not-allowed' }} />,
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {field(
          <TpLabel icon={<MapPin size={12} color={crmV2.gold} />}>Département *</TpLabel>,
          <input type="text" inputMode="numeric" value={departement} onChange={e => setDepartement(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ex : 75" maxLength={3} style={inp} />,
        )}
        {field(
          <TpLabel icon={<GraduationCap size={12} color="#a855f7" />}>Classe *</TpLabel>,
          <select value={classeActuelle} onChange={e => setClasseActuelle(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Sélectionner…</option>
            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>,
        )}
      </div>
      {field(
        <TpLabel icon={<Tag size={12} color="#22c55e" />}>Formation souhaitée *</TpLabel>,
        <select value={formation} onChange={e => setFormation(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
          <option value="">Sélectionner…</option>
          {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>,
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <TpLabel icon={<Video size={12} color={crmV2.gold} />}>Type de RDV</TpLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { key: 'visio' as const, icon: <Video size={14} />, label: 'Visio' },
            { key: 'presentiel' as const, icon: <MapPin size={14} />, label: 'Présentiel' },
          ]).map(t => {
            const on = meetingType === t.key
            return (
              <button key={t.key} type="button" onClick={() => chooseMeetingType(t.key)} style={{
                flex: 1, height: 42, borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: on ? 'rgba(201,168,76,0.12)' : crmV2.bg, border: `1px solid ${on ? 'rgba(201,168,76,0.4)' : crmV2.border}`,
                color: on ? crmV2.goldDark : crmV2.textMuted, fontSize: 14, fontWeight: on ? 700 : 500,
              }}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>
        {meetingType === 'presentiel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <TpLabel icon={<MapPin size={12} color={crmV2.gold} />}>Campus (présentiel)</TpLabel>
            <select value={meetingCampus} onChange={e => setMeetingCampus(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {CAMPUS_OPTIONS.map(campus => <option key={campus} value={campus}>{campus}</option>)}
            </select>
          </div>
        )}
        {meetingType === 'visio' && meetingLink && (
          <div style={{
            marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.22)', borderRadius: 12, padding: '6px 6px 6px 12px',
          }}>
            <Video size={14} color={crmV2.gold} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: crmV2.goldDark, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meetingLink}</span>
            <button type="button" onClick={copyMeetingLink} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px', borderRadius: 999, border: 'none',
              background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(201,168,76,0.18)', color: linkCopied ? '#15803d' : crmV2.goldDark,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
              {linkCopied ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
            </button>
            <button type="button" title="Générer un nouveau lien" aria-label="Générer un nouveau lien" onClick={() => setMeetingLink(generateJitsiLink())} style={{
              width: 32, height: 32, borderRadius: 999, border: 'none', background: 'transparent', color: crmV2.textMuted,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}>
              <RefreshCw size={13} />
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <TpLabel icon={<FileText size={12} color="#06b6d4" />} extra={<span style={{ fontSize: 10, color: crmV2.textFaint, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>→ transaction</span>}>Notes d&apos;appel</TpLabel>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Situation, motivations, objections…" rows={4}
          style={{ ...inp, height: 'auto', minHeight: 80, padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }} />
      </div>
    </div>
  )
}

/* ─── T5 : RDV enregistré ───────────────────────────────────────────────── */

export function RdvSuccess({ form, onNew, onPlanning, isMobile }: {
  form: NewRdvForm
  onNew: () => void
  onPlanning: () => void
  isMobile: boolean
}) {
  const { contactName, selectedSlot, meetingType, meetingLink, linkCopied, copyMeetingLink } = form
  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6, width: '100%' }}>
      <span style={{
        width: 72, height: 72, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', color: '#22c55e', marginBottom: 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CircleCheck size={40} />
      </span>
      <div style={{ fontSize: 22, fontWeight: 700, color: crmV2.text }}>RDV enregistré !</div>
      <div style={{ fontSize: 15, color: crmV2.textMuted }}>{contactName}</div>
      <div style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>
        {selectedSlot && format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
      </div>
      {meetingType === 'visio' && meetingLink && (
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(204,172,113,0.08)',
          border: '1px solid rgba(204,172,113,0.2)', borderRadius: 12, padding: '8px 8px 8px 14px', marginTop: 12, boxSizing: 'border-box',
        }}>
          <Video size={14} color={crmV2.gold} style={{ flexShrink: 0 }} />
          <a href={meetingLink} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 12, color: crmV2.goldDark, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}>
            {meetingLink}
          </a>
          <button type="button" onClick={copyMeetingLink} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px', borderRadius: 999, border: 'none', flexShrink: 0,
            background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(204,172,113,0.15)', color: linkCopied ? '#15803d' : crmV2.goldDark,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {linkCopied ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
          </button>
        </div>
      )}
      <div style={{
        width: '100%', fontSize: 12, color: crmV2.textMuted, padding: '10px 16px', background: 'rgba(204,172,113,0.08)',
        borderRadius: 12, border: '1px solid rgba(204,172,113,0.15)', boxSizing: 'border-box', lineHeight: 1.5, margin: '12px 0 16px',
      }}>
        Le RDV est dans la file d&apos;attente.<br />Pascal va l&apos;assigner à un closer.<br />
        <span style={{ color: crmV2.goldDark }}>Les notes sont enregistrées sur la transaction.</span>
      </div>
      <TpGoldButton onClick={onNew}><Plus size={16} /> Nouveau RDV</TpGoldButton>
      <button type="button" onClick={onPlanning} style={{
        width: '100%', height: 48, borderRadius: 999, marginTop: 6, background: 'rgba(34,197,94,0.12)', color: '#15803d',
        border: '1px solid rgba(34,197,94,0.3)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        Voir mon planning
      </button>
    </div>
  )
  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: '100%', background: crmV2.bgSoft, padding: '24px 16px', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}>
        {content}
      </div>
    )
  }
  return (
    <div style={{ padding: '40px 28px', display: 'flex', justifyContent: 'center' }}>
      <CrmV2Card style={{ padding: '40px 36px', width: '100%', maxWidth: 460, boxSizing: 'border-box' }}>{content}</CrmV2Card>
    </div>
  )
}

/* ─── Parcours complet (T2–T4) ──────────────────────────────────────────── */

export default function NewRdvFlow({
  form, isMobile, teleproUserId, linova = false,
}: {
  form: NewRdvForm
  isMobile: boolean
  teleproUserId: string
  /** Marque Linova : seule l'étape contact, puis le modal Linova */
  linova?: boolean
}) {
  // Étape mémorisée pour un contact donné : changer de contact revient à l'étape 1
  const [stepState, setStepState] = useState<{ contactId: string | null; step: 1 | 2 | 3 }>({ contactId: null, step: 1 })
  const { contact, selectedSlot, contactName, formation, classeActuelle, submit, submitting, canSubmit, error } = form

  // Retour à l'étape 1 si le contact est retiré (« Changer », reset après succès…)
  const step: 1 | 2 | 3 = contact && stepState.contactId === contact.id ? stepState.step : 1
  const setStep = (n: 1 | 2 | 3) => setStepState({ contactId: contact?.id ?? null, step: n })

  const done: [boolean, boolean, boolean] = [!!contact, !!selectedSlot, false]
  const formationLabel = FORMATIONS.find(f => f.value === formation)?.label || formation
  const slotLabel = selectedSlot ? format(new Date(selectedSlot.start), 'EEE d MMM HH:mm', { locale: fr }) : ''

  const submitButton = (
    <TpGoldButton onClick={submit} disabled={submitting || !canSubmit}>
      <Check size={16} /> {submitting ? 'Enregistrement…' : 'Valider le RDV'}
    </TpGoldButton>
  )

  /* ── Mobile : 3 écrans ── */
  if (isMobile) {
    const subtitle = linova
      ? 'Choisir un contact'
      : step === 1 ? 'Placer un RDV pour un contact'
      : step === 2 ? [contactName || '(Sans nom)', formationLabel, classeActuelle].filter(Boolean).join(' · ')
      : selectedSlot ? format(new Date(selectedSlot.start), "EEE d MMMM 'à' HH:mm", { locale: fr }) : ''
    const back = !linova && step > 1 ? (
      <button type="button" onClick={() => setStep(step > 1 ? (step - 1) as 1 | 2 : step)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, height: 36, padding: '0 12px', borderRadius: 999,
        border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text, fontSize: 13, fontWeight: 600,
        fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0,
      }}>
        <ChevronLeft size={14} /> Retour
      </button>
    ) : undefined
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <TpMobileHeader title={linova ? 'Nouveau RDV Linova' : 'Nouveau RDV'} subtitle={<span style={{ textTransform: step === 3 ? 'capitalize' : undefined }}>{subtitle}</span>} action={back}>
          {!linova && <TpStepBar step={step} done={done} />}
        </TpMobileHeader>
        <div style={{ flex: 1, background: crmV2.bgSoft, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(linova || step === 1) && <ContactStep form={form} isMobile linova={linova} />}
          {!linova && step === 2 && (
            <>
              <CrmV2Card style={{ padding: 12 }}><CalendarBlock form={form} /></CrmV2Card>
              <CrmV2Card style={{ padding: 12 }}><SlotsBlock form={form} isMobile /></CrmV2Card>
            </>
          )}
          {!linova && step === 3 && (
            <>
              <InfosFields form={form} isMobile teleproUserId={teleproUserId} />
              {error && <ErrorBox>{error}</ErrorBox>}
            </>
          )}
        </div>
        {!linova && (
          <div style={{ position: 'sticky', bottom: 0, padding: '10px 12px 12px', background: crmV2.bgSoft, borderTop: `1px solid ${crmV2.border}` }}>
            {step === 1 && (
              <TpGoldButton disabled={!contact} onClick={() => setStep(2)}>Continuer <ArrowRight size={16} /></TpGoldButton>
            )}
            {step === 2 && (
              <TpGoldButton disabled={!selectedSlot} onClick={() => setStep(3)}>
                Continuer{slotLabel ? ` · ${slotLabel}` : ''} <ArrowRight size={16} />
              </TpGoldButton>
            )}
            {step === 3 && submitButton}
          </div>
        )}
      </div>
    )
  }

  /* ── Ordinateur : contact, puis créneau et infos côte à côte ── */
  const deskStep: 1 | 2 | 3 = !contact ? 1 : !selectedSlot ? 2 : 3
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 28px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{linova ? 'Nouveau RDV Linova' : 'Nouveau RDV'}</div>
        <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>
          {linova ? 'Choisir un contact, puis programmer le RDV Linova' : 'Placer un RDV pour un contact'}
        </div>
        {!linova && <div style={{ maxWidth: 520 }}><TpStepBar step={deskStep} done={done} /></div>}
      </div>

      <CrmV2Card style={{ padding: 18 }}>
        <CrmV2SectionLabel style={{ marginBottom: 12 }} icon={<Search size={13} color={crmV2.gold} />}>
          {linova ? 'Choisir un contact' : '1. Trouver le contact dans le CRM'}
        </CrmV2SectionLabel>
        <ContactStep form={form} isMobile={false} linova={linova} />
      </CrmV2Card>

      {!linova && contact && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <CrmV2Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <CrmV2SectionLabel icon={<Calendar size={13} color={crmV2.gold} />}>2. Date et créneau *</CrmV2SectionLabel>
            <CalendarBlock form={form} />
            <SlotsBlock form={form} isMobile={false} />
          </CrmV2Card>
          <CrmV2Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CrmV2SectionLabel icon={<User size={13} color={crmV2.gold} />}>3. Infos du prospect</CrmV2SectionLabel>
            <InfosFields form={form} isMobile={false} teleproUserId={teleproUserId} />
            {error && <ErrorBox>{error}</ErrorBox>}
            {selectedSlot && (
              <div style={{
                background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.22)', borderRadius: 12,
                padding: '9px 14px', color: crmV2.goldDark, fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
              }}>
                {format(new Date(selectedSlot.start), "EEEE d MMMM 'à' HH:mm", { locale: fr })}
              </div>
            )}
            {submitButton}
          </CrmV2Card>
        </div>
      )}
    </div>
  )
}
