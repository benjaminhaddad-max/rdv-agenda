'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format, addDays, startOfWeek, startOfToday, isBefore } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Calendar, Clock, Save, X, Plus, ChevronLeft, ChevronRight,
  Ban, CheckCircle, AlertCircle, User, Search, Phone, Tag,
  FileText, Video, PhoneCall, Copy, Check, Link, Mail,
  GraduationCap, MapPin, PlusCircle, RefreshCw, RotateCcw,
} from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import LogoutButton from '@/components/LogoutButton'
import StatusBadge, { AppointmentStatus, STATUS_CONFIG } from '@/components/StatusBadge'
import AppointmentModal from '@/components/AppointmentModal'
import RepopJournal from '@/components/RepopJournal'
import PlatformGuide from '@/components/PlatformGuide'
import ResourcesPanel from '@/components/ResourcesPanel'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'

// ─── Types ──────────────────────────────────────────────────────────────
type CloserUser = {
  id: string
  name: string
  slug: string
  avatar_color: string
  role: string
  hubspot_owner_id?: string
}

type HistRdv = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: string
  hubspot_deal_id: string | null
  hubspot_contact_id: string | null
  notes: string | null
  report_summary: string | null
  report_telepro_advice: string | null
  formation_type: string | null
  meeting_type: string | null
  meeting_link: string | null
  classe_actuelle: string | null
  departement: string | null
  telepro: { id: string; name: string } | null
  users?: { id: string; name: string; avatar_color: string; slug: string } | null
  telepro_suivi?: string | null
  telepro_suivi_at?: string | null
  hs_stage: string | null
  hs_stage_label: string | null
  hs_stage_color: string | null
  repop_form_date?: string | null
  repop_form_name?: string | null
}


type AvailabilityRule = {
  id?: string
  user_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

type BlockedDate = {
  id: string
  user_id: string
  blocked_date: string
  reason: string | null
  created_at: string
}

type Slot = { start: string; end: string; available?: boolean }

interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    departement?: string
    classe_actuelle?: string
    diploma_sante___formation_demandee?: string
  }
}

// ─── Constantes ─────────────────────────────────────────────────────────
const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
]

const TIME_OPTIONS: string[] = []
for (let h = 7; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

const FORMATIONS: { value: string; label: string }[] = [
  { value: 'PAS',         label: 'PASS' },
  { value: 'LSPS',        label: 'LSPS' },
  { value: 'LAS',         label: 'LAS' },
  { value: 'P-1',         label: 'Terminale Santé (P-1)' },
  { value: 'P-2',         label: 'Première Élite (P-2)' },
  { value: 'APES0',       label: 'PAES FR/EU' },
  { value: 'LAS 2 UPEC',  label: 'LSPS2 UPEC' },
  { value: 'LAS 3 Upec',  label: 'LSPS3 UPEC' },
]

const CLASSES = [
  'Troisième', 'Seconde', 'Première', 'Terminale',
  'PASS', 'LSPS 1', 'LSPS 2', 'LSPS 3',
  'LAS 1', 'LAS 2', 'LAS 3',
  'Etudes médicales', 'Etudes Sup.', 'Autre',
]

const inputStyle: React.CSSProperties = {
  background: '#243d5c',
  border: '1px solid #2d4a6b',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e8eaf0',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const fieldInputStyle: React.CSSProperties = {
  width: '100%', background: '#243d5c', border: '1px solid #2d4a6b',
  borderRadius: 10, padding: '11px 14px', color: '#e8eaf0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  fontWeight: 700, fontSize: 12, color: '#8b8fa8', marginBottom: 6,
  display: 'flex', alignItems: 'center', gap: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

function generateJitsiLink() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `https://meet.ffmuc.net/DiplomaSanteRDV${rand}`
}

// ─── Composant principal ────────────────────────────────────────────────
export default function CloserClient({ user }: { user: CloserUser }) {
  const [activeTab, setActiveTab] = useState<'planning' | 'rdv' | 'dispos' | 'historique' | 'repop' | 'leads'>('planning')
  const [leadsContacts, setLeadsContacts] = useState<CRMContact[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [leadsTotal, setLeadsTotal] = useState(0)
  const [showGuide, setShowGuide] = useState(false)
  const [showResources, setShowResources] = useState(false)

  // ── Historique ──
  const [histRdvs, setHistRdvs] = useState<HistRdv[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [selectedHistRdv, setSelectedHistRdv] = useState<HistRdv | null>(null)
  const [savingSuivi, setSavingSuivi] = useState<string | null>(null)
  const [closingDeal, setClosingDeal] = useState<string | null>(null)
  const [rebookLoading, setRebookLoading] = useState<string | null>(null)

  const SUIVI_OPTIONS = [
    { value: 'ne_repond_plus', label: '📵 Ne répond plus', color: '#6b7280' },
    { value: 'a_travailler',   label: '🔧 À travailler',   color: '#ccac71' },
    { value: 'pre_positif',    label: '⭐ Pré-positif',    color: '#06b6d4' },
  ]

  const fetchHistorique = useCallback(async () => {
    if (!user.hubspot_owner_id) return
    setHistLoading(true)
    try {
      const res = await fetch(`/api/appointments/historique-closer?hubspot_owner_id=${user.hubspot_owner_id}`)
      const data = await res.json()
      setHistRdvs(data)
    } catch { /* ignore */ }
    setHistLoading(false)
  }, [user.hubspot_owner_id])

  useEffect(() => {
    if (activeTab === 'historique' && histRdvs.length === 0 && !histLoading) {
      fetchHistorique()
    }
  }, [activeTab, histRdvs.length, histLoading, fetchHistorique])

  const fetchLeads = useCallback(async () => {
    if (!user.hubspot_owner_id) return
    setLeadsLoading(true)
    try {
      const res = await fetch(`/api/crm/contacts?closer_hs_id=${user.hubspot_owner_id}&limit=100`)
      if (res.ok) {
        const data = await res.json()
        setLeadsContacts(data.data ?? [])
        setLeadsTotal(data.total ?? 0)
      }
    } finally {
      setLeadsLoading(false)
    }
  }, [user.hubspot_owner_id])

  useEffect(() => {
    if (activeTab === 'leads' && leadsContacts.length === 0 && !leadsLoading) {
      fetchLeads()
    }
  }, [activeTab, leadsContacts.length, leadsLoading, fetchLeads])

  const uniqueStages = histRdvs.reduce<Array<{ label: string; color: string; count: number }>>((acc, r) => {
    if (!r.hs_stage_label) return acc
    const existing = acc.find(s => s.label === r.hs_stage_label)
    if (existing) { existing.count++ } else { acc.push({ label: r.hs_stage_label, color: r.hs_stage_color || '#8b8fa8', count: 1 }) }
    return acc
  }, [])

  const filteredHistRdvs = stageFilter ? histRdvs.filter(r => r.hs_stage_label === stageFilter) : histRdvs

  const saveSuivi = useCallback(async (rdv: HistRdv, suivi: string | null) => {
    setSavingSuivi(rdv.id)
    try {
      const res = await fetch('/api/closer-suivi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: rdv.id,
          deal_id: rdv.hubspot_deal_id,
          suivi,
          closer_name: user.name,
        }),
      })
      if (res.ok) {
        setHistRdvs(prev => prev.map(r =>
          r.id === rdv.id
            ? { ...r, telepro_suivi: suivi, telepro_suivi_at: suivi ? new Date().toISOString() : null }
            : r
        ))
      }
    } finally {
      setSavingSuivi(null)
    }
  }, [user.name])

  const marquerPerdu = useCallback(async (rdv: HistRdv) => {
    if (!rdv.hubspot_deal_id) return
    setClosingDeal(rdv.id)
    try {
      const res = await fetch(`/api/hubspot/deal/${rdv.hubspot_deal_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'fermePerdu' }),
      })
      if (res.ok) {
        setHistRdvs(prev => prev.map(r =>
          r.id === rdv.id
            ? { ...r, hs_stage_label: 'Fermé / Perdu', hs_stage_color: '#ef4444' }
            : r
        ))
      }
    } finally {
      setClosingDeal(null)
    }
  }, [])

  async function handleReprendre(rdv: HistRdv) {
    resetContact()
    if (rdv.hubspot_contact_id) {
      setRebookLoading(rdv.id)
      try {
        const res = await fetch(`/api/hubspot/contact?url=${rdv.hubspot_contact_id}`)
        const data = await res.json()
        if (res.ok && data.results?.length > 0) {
          const c = data.results[0]; setContact(c)
          const p = c.properties
          const ev = p.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
          if (p.phone) setPhone(p.phone)
          if (p.departement) setDepartement(String(p.departement))
          if (p.classe_actuelle) setClasseActuelle(p.classe_actuelle)
          if (p.diploma_sante___formation_demandee) setFormation(p.diploma_sante___formation_demandee)
        }
      } finally {
        setRebookLoading(null)
      }
    }
    setActiveTab('rdv')
  }

  // ── Availability rules ──
  const [rules, setRules] = useState<AvailabilityRule[]>(
    DAYS.map(d => ({
      user_id: user.id,
      day_of_week: d.value,
      start_time: '09:00',
      end_time: '18:00',
      is_active: d.value <= 5,
    }))
  )
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)

  // ── Blocked dates ──
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [blockReason, setBlockReason] = useState('')
  const [blockingDate, setBlockingDate] = useState<string | null>(null)
  const [calendarWeekStart, setCalendarWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  // ── Booking form — contact ──
  const [lookupMode, setLookupMode] = useState<'url' | 'phone' | 'new'>('url')
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [contact, setContact] = useState<HubSpotContact | null>(null)
  const [newFirstname, setNewFirstname] = useState('')
  const [newLastname, setNewLastname] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newFormation, setNewFormation] = useState('')
  const [newClasse, setNewClasse] = useState('')
  const [newDepartement, setNewDepartement] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Booking form — prospect fields ──
  const [email, setEmail] = useState('')
  const [emailSynced, setEmailSynced] = useState(false)
  const emailOriginalRef = useRef('')
  const [phone, setPhone] = useState('')
  const [departement, setDepartement] = useState('')
  const [classeActuelle, setClasseActuelle] = useState('')
  const [formation, setFormation] = useState('')
  const [meetingType, setMeetingType] = useState<'visio' | 'telephone' | 'presentiel'>('visio')
  const [meetingLink, setMeetingLink] = useState(() => generateJitsiLink())
  const [linkCopied, setLinkCopied] = useState(false)
  const [notes, setNotes] = useState('')

  // ── Booking form — slots ──
  const today = startOfToday()
  const bookingDays = Array.from({ length: 21 }, (_, i) => addDays(today, i))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6)
    .slice(0, 10)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // ── Booking form — submit ──
  const [submitting, setSubmitting] = useState(false)
  const [rdvSuccess, setRdvSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Load data ──
  const loadRules = useCallback(async () => {
    const res = await fetch(`/api/availability?mode=rules&user_id=${user.id}`)
    if (!res.ok) return
    const data: AvailabilityRule[] = await res.json()
    if (data.length > 0) {
      setRules(
        DAYS.map(d => {
          const existing = data.find(r => r.day_of_week === d.value)
          return existing || {
            user_id: user.id,
            day_of_week: d.value,
            start_time: '09:00',
            end_time: '18:00',
            is_active: false,
          }
        })
      )
    }
  }, [user.id])

  const loadBlockedDates = useCallback(async () => {
    const res = await fetch(`/api/blocked-dates?user_id=${user.id}`)
    if (res.ok) setBlockedDates(await res.json())
  }, [user.id])

  useEffect(() => {
    loadRules()
    loadBlockedDates()
  }, [loadRules, loadBlockedDates])

  // ── Save rules ──
  async function saveRules() {
    setRulesSaving(true)
    setRulesError(null)
    setRulesSaved(false)
    try {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          rules: rules.map(r => ({
            day_of_week: r.day_of_week,
            start_time: r.start_time,
            end_time: r.end_time,
            is_active: r.is_active,
          })),
        }),
      })
      if (res.ok) {
        setRulesSaved(true)
        setTimeout(() => setRulesSaved(false), 3000)
      } else {
        const data = await res.json()
        setRulesError(data.error || 'Erreur lors de la sauvegarde')
      }
    } finally {
      setRulesSaving(false)
    }
  }

  // ── Block/unblock date ──
  async function blockDate(dateStr: string) {
    const res = await fetch('/api/blocked-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, blocked_date: dateStr, reason: blockReason.trim() || null }),
    })
    if (res.ok) { setBlockReason(''); setBlockingDate(null); loadBlockedDates() }
  }

  async function unblockDate(id: string) {
    await fetch(`/api/blocked-dates?id=${id}`, { method: 'DELETE' })
    loadBlockedDates()
  }

  function updateRule(dayOfWeek: number, field: string, value: string | boolean) {
    setRules(prev => prev.map(r => r.day_of_week === dayOfWeek ? { ...r, [field]: value } : r))
  }

  // ── Calendar helpers ──
  const calendarDays = Array.from({ length: 28 }, (_, i) => addDays(calendarWeekStart, i))
  const blockedSet = new Set(blockedDates.map(b => b.blocked_date))

  // ── Booking: load slots ──
  async function loadSlots(date: Date) {
    setSlotsLoading(true)
    setSlots([])
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/availability?commercial_id=${user.id}&date=${dateStr}`)
      if (res.ok) {
        const data: Slot[] = await res.json()
        setSlots(data.filter(s => s.available !== false))
      }
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setSelectedSlot(null)
    loadSlots(date)
  }

  // ── Booking: HubSpot contact ──
  async function searchContact() {
    if (!lookupInput.trim()) return
    setLookupLoading(true); setLookupError(null); setContact(null)
    try {
      const param = lookupMode === 'url'
        ? `url=${encodeURIComponent(lookupInput.trim())}`
        : `phone=${encodeURIComponent(lookupInput.trim())}`
      const res = await fetch(`/api/hubspot/contact?${param}`)
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error || 'Erreur'); return }
      const found: HubSpotContact[] = data.results || []
      if (found.length === 0) { setLookupError('Aucun contact trouvé.'); return }
      const c = found[0]; setContact(c)
      const p = c.properties
      const ev = p.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
      if (p.phone) setPhone(p.phone)
      if (p.departement) setDepartement(String(p.departement))
      if (p.classe_actuelle) setClasseActuelle(p.classe_actuelle)
      if (p.diploma_sante___formation_demandee) setFormation(p.diploma_sante___formation_demandee)
    } catch { setLookupError('Erreur réseau') }
    finally { setLookupLoading(false) }
  }

  async function createNewContact() {
    if (!newFirstname.trim() || !newLastname.trim() || !newEmail.trim()) return
    setCreating(true); setLookupError(null)
    try {
      const res = await fetch('/api/hubspot/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstname: newFirstname.trim(), lastname: newLastname.trim(),
          email: newEmail.trim(), phone: newPhone.trim() || undefined,
          departement: newDepartement.trim() || undefined,
          classe_actuelle: newClasse || undefined, formation: newFormation || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error || 'Erreur'); return }
      setContact(data)
      setEmail(newEmail); emailOriginalRef.current = newEmail; setEmailSynced(false)
      if (newPhone) setPhone(newPhone)
      if (newDepartement) setDepartement(newDepartement)
      if (newClasse) setClasseActuelle(newClasse)
      if (newFormation) setFormation(newFormation)
    } catch { setLookupError('Erreur réseau') }
    finally { setCreating(false) }
  }

  function resetContact() {
    setContact(null); setLookupInput(''); setLookupError(null)
    setEmail(''); emailOriginalRef.current = ''; setEmailSynced(false)
    setPhone(''); setDepartement(''); setClasseActuelle(''); setFormation('')
    setMeetingType('visio'); setMeetingLink(generateJitsiLink()); setLinkCopied(false)
    setNotes(''); setSelectedDate(null); setSelectedSlot(null); setSubmitError(null)
    setNewFirstname(''); setNewLastname(''); setNewEmail(''); setNewPhone('')
    setNewFormation(''); setNewClasse(''); setNewDepartement('')
  }

  async function syncEmail() {
    if (!contact || !email.trim() || email.trim() === emailOriginalRef.current) return
    try {
      const res = await fetch('/api/hubspot/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, properties: { email: email.trim() } }),
      })
      if (res.ok) { emailOriginalRef.current = email.trim(); setEmailSynced(true); setTimeout(() => setEmailSynced(false), 2000) }
    } catch { /* silencieux */ }
  }

  // ── Booking: submit ──
  const contactName = contact ? [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') : ''
  const contactEmail = email || contact?.properties.email || ''
  const canSubmit = contact && selectedSlot && phone && departement && classeActuelle && formation

  async function submitRdv() {
    if (!canSubmit) { setSubmitError('Remplis tous les champs obligatoires (*)'); return }
    setSubmitting(true); setSubmitError(null)
    const formationLabel = FORMATIONS.find(f => f.value === formation)?.label || formation
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercial_id: user.id,
          prospect_name: contactName || contactEmail,
          prospect_email: contactEmail,
          prospect_phone: phone,
          start_at: selectedSlot!.start,
          end_at: selectedSlot!.end,
          source: 'telepro',
          formation_type: formationLabel,
          formation_hs_value: formation,
          hubspot_contact_id: contact!.id,
          departement,
          classe_actuelle: classeActuelle,
          meeting_type: meetingType,
          meeting_link: meetingType === 'visio' ? meetingLink || null : null,
          telepro_id: user.id,
          call_notes: [
            `📚 Formation demandée : ${formationLabel}`,
            `📍 Département : ${departement}`,
            `🎓 Classe actuelle : ${classeActuelle}`,
            phone ? `📞 Téléphone : ${phone}` : '',
            notes.trim() ? `\n📝 Notes :\n${notes.trim()}` : '',
          ].filter(Boolean).join('\n'),
        }),
      })
      if (res.ok) { setRdvSuccess(true) }
      else { const data = await res.json(); setSubmitError(data.error || 'Erreur') }
    } finally { setSubmitting(false) }
  }

  // ─── Success screen RDV ────────────────────────────────────────────────
  if (rdvSuccess) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b1624', color: '#e8eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#152438', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '48px 40px', textAlign: 'center', maxWidth: 440 }}>
          <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: 16 }} />
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>RDV enregistré !</div>
          <div style={{ fontSize: 15, color: '#8b8fa8', marginBottom: 4 }}>{contactName}</div>
          <div style={{ fontSize: 14, color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>
            {selectedSlot && format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
          </div>
          {meetingType === 'visio' && meetingLink && (
            <div style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Video size={14} style={{ color: '#ccac71', flexShrink: 0 }} />
              <a href={meetingLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#ccac71', wordBreak: 'break-all', flex: 1 }}>{meetingLink}</a>
              <button onClick={() => { navigator.clipboard.writeText(meetingLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                style={{ background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(204,172,113,0.15)', border: 'none', borderRadius: 6, padding: '5px 10px', color: linkCopied ? '#22c55e' : '#ccac71', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {linkCopied ? <><Check size={10} /> Copié</> : <><Copy size={10} /> Copier</>}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => { setRdvSuccess(false); resetContact() }} style={{ flex: 1, background: `${user.avatar_color}25`, color: user.avatar_color, border: `1px solid ${user.avatar_color}50`, borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              + Nouveau RDV
            </button>
            <button onClick={() => { setRdvSuccess(false); resetContact(); setActiveTab('planning') }} style={{ flex: 1, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Mon planning
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624', color: '#e8eaf0' }}>

      {/* Header */}
      <div style={{
        background: '#1d2f4b', borderBottom: '1px solid #2d4a6b',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `${user.avatar_color}20`,
            border: `1px solid ${user.avatar_color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={17} style={{ color: user.avatar_color }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: '#555870' }}>Mon espace closer</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#243d5c', borderRadius: 8, padding: 3, border: '1px solid #2d4a6b' }}>
          {([
            { key: 'planning' as const, label: 'Mon planning', icon: <Calendar size={13} /> },
            { key: 'rdv' as const, label: 'Nouveau RDV', icon: <PlusCircle size={13} /> },
            { key: 'leads' as const, label: 'Mes Leads', icon: <User size={13} /> },
            { key: 'historique' as const, label: 'Historique', icon: <Clock size={13} /> },
            { key: 'repop' as const, label: '🔁 Repop', icon: null },
            { key: 'dispos' as const, label: 'Mes dispos', icon: <Clock size={13} /> },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? user.avatar_color : 'transparent',
                border: 'none', borderRadius: 6, padding: '6px 16px',
                color: activeTab === tab.key ? 'white' : '#8b8fa8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowResources(true)}
            style={{
              background: 'rgba(107,135,255,0.1)', border: '1px solid rgba(107,135,255,0.3)',
              borderRadius: 8, padding: '6px 12px', color: '#6b87ff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            📦 Outils
          </button>
          <button
            onClick={() => setShowGuide(true)}
            style={{
              background: 'rgba(107,135,255,0.1)', border: '1px solid rgba(107,135,255,0.3)',
              borderRadius: 8, padding: '6px 12px', color: '#6b87ff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            📖 Guide
          </button>
          <LogoutButton />
        </div>
      </div>

      {showGuide && <PlatformGuide role="closer" onClose={() => setShowGuide(false)} />}
      {showResources && <ResourcesPanel role="closer" onClose={() => setShowResources(false)} />}

      {/* ── Tab: Mon planning ──────────────────────────────────────────── */}
      {activeTab === 'planning' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <WeekCalendar closerId={user.id} closerColor={user.avatar_color} closerName={user.name} />
        </div>
      )}

      {/* ── Tab: Nouveau RDV ───────────────────────────────────────────── */}
      {activeTab === 'rdv' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>

            {/* Step 1 — Contact HubSpot */}
            <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={16} style={{ color: user.avatar_color }} />
                {contact ? '✓ Contact HubSpot' : 'Étape 1 — Contact HubSpot'}
              </div>

              {contact ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {[contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || 'Sans nom'}
                    </div>
                    <div style={{ fontSize: 12, color: '#555870' }}>{contact.properties.email}</div>
                  </div>
                  <button onClick={resetContact} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 12px', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <X size={12} /> Changer
                  </button>
                </div>
              ) : (
                <>
                  {/* Mode selector */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {([
                      { key: 'url' as const, label: 'Lien HubSpot', icon: <Link size={11} /> },
                      { key: 'phone' as const, label: 'Téléphone', icon: <Phone size={11} /> },
                      { key: 'new' as const, label: 'Nouveau contact', icon: <Plus size={11} /> },
                    ]).map(m => (
                      <button key={m.key} onClick={() => { setLookupMode(m.key); setLookupError(null) }}
                        style={{ background: lookupMode === m.key ? `${user.avatar_color}20` : '#243d5c', border: `1px solid ${lookupMode === m.key ? `${user.avatar_color}50` : '#2d4a6b'}`, borderRadius: 8, padding: '6px 12px', color: lookupMode === m.key ? user.avatar_color : '#8b8fa8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>

                  {lookupMode !== 'new' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={lookupInput}
                        onChange={e => setLookupInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchContact()}
                        placeholder={lookupMode === 'url' ? 'https://app.hubspot.com/contacts/...' : '+33 6 00 00 00 00'}
                        style={{ ...fieldInputStyle, flex: 1 }}
                      />
                      <button onClick={searchContact} disabled={lookupLoading || !lookupInput.trim()}
                        style={{ background: user.avatar_color, color: 'white', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: lookupLoading || !lookupInput.trim() ? 0.6 : 1 }}>
                        <Search size={14} /> {lookupLoading ? 'Recherche…' : 'Chercher'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={newFirstname} onChange={e => setNewFirstname(e.target.value)} placeholder="Prénom *" style={{ ...fieldInputStyle }} />
                        <input value={newLastname} onChange={e => setNewLastname(e.target.value)} placeholder="Nom *" style={{ ...fieldInputStyle }} />
                      </div>
                      <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email *" style={{ ...fieldInputStyle }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone" style={{ ...fieldInputStyle }} />
                        <input value={newDepartement} onChange={e => setNewDepartement(e.target.value)} placeholder="Département" style={{ ...fieldInputStyle }} />
                      </div>
                      <button onClick={createNewContact} disabled={creating || !newFirstname.trim() || !newLastname.trim() || !newEmail.trim()}
                        style={{ background: user.avatar_color, color: 'white', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: creating || !newFirstname.trim() || !newLastname.trim() || !newEmail.trim() ? 0.6 : 1 }}>
                        {creating ? 'Création…' : 'Créer le contact HubSpot'}
                      </button>
                    </div>
                  )}

                  {lookupError && (
                    <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', color: '#ef4444', fontSize: 12 }}>
                      {lookupError}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Step 2 — Date + créneau */}
            <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={16} style={{ color: user.avatar_color }} />
                Étape 2 — Date &amp; créneau
              </div>

              {/* Date picker */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {bookingDays.map(day => {
                  const isSelected = selectedDate && isBefore(day, addDays(selectedDate, 1)) && !isBefore(day, selectedDate)
                  return (
                    <button key={day.toISOString()} onClick={() => handleSelectDate(day)}
                      style={{ background: isSelected ? `${user.avatar_color}25` : '#243d5c', border: `1px solid ${isSelected ? user.avatar_color : '#2d4a6b'}`, borderRadius: 10, padding: '8px 12px', color: isSelected ? user.avatar_color : '#8b8fa8', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase' }}>{format(day, 'EEE', { locale: fr })}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{format(day, 'd')}</div>
                      <div style={{ fontSize: 10 }}>{format(day, 'MMM', { locale: fr })}</div>
                    </button>
                  )
                })}
              </div>

              {/* Slots */}
              {selectedDate && (
                slotsLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#555870', fontSize: 13 }}>Chargement des créneaux…</div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#555870', fontSize: 13 }}>Aucun créneau disponible ce jour.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
                    {slots.map(slot => {
                      const isSelected = selectedSlot?.start === slot.start
                      return (
                        <button key={slot.start} onClick={() => setSelectedSlot(slot)}
                          style={{ background: isSelected ? `${user.avatar_color}25` : '#243d5c', border: `1px solid ${isSelected ? user.avatar_color : '#2d4a6b'}`, borderRadius: 8, padding: '8px 6px', color: isSelected ? user.avatar_color : '#e8eaf0', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                          {format(new Date(slot.start), 'HH:mm')}
                        </button>
                      )
                    })}
                  </div>
                )
              )}
            </div>

            {/* Step 3 — Détails */}
            <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: user.avatar_color }} />
                Étape 3 — Informations prospect
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Email */}
                <div>
                  <div style={labelStyle}><Mail size={11} /> Email</div>
                  <input value={email} onChange={e => setEmail(e.target.value)} onBlur={syncEmail}
                    placeholder="email@exemple.com" style={{ ...fieldInputStyle }} />
                  {emailSynced && <div style={{ fontSize: 10, color: '#22c55e', marginTop: 3 }}>✓ Synchronisé HubSpot</div>}
                </div>

                {/* Téléphone */}
                <div>
                  <div style={labelStyle}><Phone size={11} /> Téléphone *</div>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33 6 00 00 00 00" style={{ ...fieldInputStyle }} />
                </div>

                {/* Département */}
                <div>
                  <div style={labelStyle}><MapPin size={11} /> Département *</div>
                  <input value={departement} onChange={e => setDepartement(e.target.value)} placeholder="ex: 75" style={{ ...fieldInputStyle }} />
                </div>

                {/* Classe actuelle */}
                <div>
                  <div style={labelStyle}><GraduationCap size={11} /> Classe actuelle *</div>
                  <select value={classeActuelle} onChange={e => setClasseActuelle(e.target.value)} style={{ ...fieldInputStyle }}>
                    <option value="">Sélectionner…</option>
                    {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Formation */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}><Tag size={11} /> Formation demandée *</div>
                  <select value={formation} onChange={e => setFormation(e.target.value)} style={{ ...fieldInputStyle }}>
                    <option value="">Sélectionner…</option>
                    {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>

                {/* Type de réunion */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}><Video size={11} /> Type de réunion</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([
                      { value: 'visio', label: 'Visio', icon: <Video size={12} /> },
                      { value: 'telephone', label: 'Téléphone', icon: <PhoneCall size={12} /> },
                      { value: 'presentiel', label: 'Présentiel', icon: <User size={12} /> },
                    ] as const).map(t => (
                      <button key={t.value} onClick={() => setMeetingType(t.value)}
                        style={{ flex: 1, background: meetingType === t.value ? `${user.avatar_color}20` : '#243d5c', border: `1px solid ${meetingType === t.value ? `${user.avatar_color}60` : '#2d4a6b'}`, borderRadius: 8, padding: '9px', color: meetingType === t.value ? user.avatar_color : '#8b8fa8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lien visio */}
                {meetingType === 'visio' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={labelStyle}><Link size={11} /> Lien de visio</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} style={{ ...fieldInputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
                      <button onClick={() => { navigator.clipboard.writeText(meetingLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                        style={{ background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(204,172,113,0.15)', border: 'none', borderRadius: 8, padding: '0 14px', color: linkCopied ? '#22c55e' : '#ccac71', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        {linkCopied ? <><Check size={12} /> Copié</> : <><Copy size={12} /> Copier</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}><FileText size={11} /> Notes d&apos;appel</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations, contexte particulier…" rows={3}
                    style={{ ...fieldInputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
              </div>
            </div>

            {/* Submit */}
            {submitError && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 16px', color: '#ef4444', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} /> {submitError}
              </div>
            )}

            <button onClick={submitRdv} disabled={submitting || !canSubmit}
              style={{ width: '100%', background: canSubmit ? user.avatar_color : '#243d5c', color: canSubmit ? 'white' : '#555870', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}>
              <CheckCircle size={16} />
              {submitting ? 'Enregistrement…' : 'Valider le RDV'}
            </button>

          </div>
        </div>
      )}

      {/* ── Tab: Mes disponibilités ────────────────────────────────────── */}
      {activeTab === 'dispos' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

            {/* Section 1 : Planning hebdomadaire */}
            <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} style={{ color: '#b89450' }} />
                Planning hebdomadaire récurrent
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DAYS.map(day => {
                  const rule = rules.find(r => r.day_of_week === day.value)!
                  return (
                    <div key={day.value} style={{ display: 'grid', gridTemplateColumns: '120px 44px 1fr 20px 1fr', alignItems: 'center', gap: 12, padding: '10px 14px', background: rule.is_active ? 'rgba(204,172,113,0.05)' : '#243d5c', border: `1px solid ${rule.is_active ? 'rgba(204,172,113,0.2)' : '#2d4a6b'}`, borderRadius: 10, transition: 'all 0.15s' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: rule.is_active ? '#e8eaf0' : '#555870' }}>{day.label}</div>
                      <button onClick={() => updateRule(day.value, 'is_active', !rule.is_active)}
                        style={{ width: 44, height: 24, borderRadius: 12, background: rule.is_active ? '#b89450' : '#353849', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: rule.is_active ? 23 : 3, transition: 'left 0.2s' }} />
                      </button>
                      <select value={rule.start_time} onChange={e => updateRule(day.value, 'start_time', e.target.value)} disabled={!rule.is_active} style={{ ...inputStyle, opacity: rule.is_active ? 1 : 0.3 }}>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div style={{ textAlign: 'center', color: '#555870', fontSize: 13 }}>→</div>
                      <select value={rule.end_time} onChange={e => updateRule(day.value, 'end_time', e.target.value)} disabled={!rule.is_active} style={{ ...inputStyle, opacity: rule.is_active ? 1 : 0.3 }}>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <button onClick={saveRules} disabled={rulesSaving}
                  style={{ background: '#b89450', color: 'white', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: rulesSaving ? 0.7 : 1 }}>
                  <Save size={15} />
                  {rulesSaving ? 'Enregistrement…' : 'Enregistrer le planning'}
                </button>
                {rulesSaved && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 13, fontWeight: 600 }}><CheckCircle size={15} /> Enregistré</div>}
                {rulesError && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13 }}><AlertCircle size={15} /> {rulesError}</div>}
              </div>
            </div>

            {/* Section 2 : Jours bloqués */}
            <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ban size={16} style={{ color: '#ef4444' }} />
                Jours bloqués (vacances, indisponibilités)
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <button onClick={() => setCalendarWeekStart(prev => addDays(prev, -7))} style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                  <ChevronLeft size={14} />
                </button>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#8b8fa8' }}>
                  {format(calendarWeekStart, 'd MMM', { locale: fr })} — {format(addDays(calendarWeekStart, 27), 'd MMM yyyy', { locale: fr })}
                </div>
                <button onClick={() => setCalendarWeekStart(prev => addDays(prev, 7))} style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                  <ChevronRight size={14} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#555870', textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
                ))}
                {calendarDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const isBlocked = blockedSet.has(dateStr)
                  const isPast = isBefore(day, today)
                  const isSunday = day.getDay() === 0
                  const isConfirming = blockingDate === dateStr
                  return (
                    <div key={dateStr} style={{ position: 'relative' }}>
                      <button
                        onClick={() => {
                          if (isPast) return
                          if (isBlocked) {
                            const blocked = blockedDates.find(b => b.blocked_date === dateStr)
                            if (blocked) unblockDate(blocked.id)
                          } else {
                            setBlockingDate(isConfirming ? null : dateStr)
                          }
                        }}
                        disabled={isPast}
                        style={{ width: '100%', aspectRatio: '1', background: isBlocked ? 'rgba(239,68,68,0.15)' : isConfirming ? 'rgba(204,172,113,0.15)' : '#243d5c', border: `1px solid ${isBlocked ? 'rgba(239,68,68,0.4)' : isConfirming ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`, borderRadius: 8, color: isPast ? '#353849' : isBlocked ? '#ef4444' : isConfirming ? '#ccac71' : '#8b8fa8', fontSize: 13, fontWeight: 600, cursor: isPast || isSunday ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                        {format(day, 'd')}
                      </button>
                    </div>
                  )
                })}
              </div>

              {blockingDate && (
                <div style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 13, color: '#ccac71', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Bloquer le {format(new Date(blockingDate + 'T00:00:00'), 'EEEE d MMMM', { locale: fr })}
                  </div>
                  <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Raison (optionnel)…" style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
                  <button onClick={() => blockDate(blockingDate)} style={{ background: '#ccac71', color: '#152438', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <Plus size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Bloquer
                  </button>
                  <button onClick={() => { setBlockingDate(null); setBlockReason('') }} style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 8px', color: '#8b8fa8', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {blockedDates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {blockedDates.map(b => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8, padding: '8px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Ban size={13} style={{ color: '#ef4444' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0', textTransform: 'capitalize' }}>
                          {format(new Date(b.blocked_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
                        </span>
                        {b.reason && <span style={{ fontSize: 12, color: '#555870' }}>— {b.reason}</span>}
                      </div>
                      <button onClick={() => unblockDate(b.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Débloquer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {blockedDates.length === 0 && !blockingDate && (
                <div style={{ fontSize: 12, color: '#555870', textAlign: 'center', padding: '8px 0' }}>
                  Aucun jour bloqué. Cliquez sur une date ci-dessus pour la bloquer.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Tab: Historique ──────────────────────────────────────────── */}
      {activeTab === 'historique' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

            {/* En-tête */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={18} style={{ color: user.avatar_color }} />
                  Historique RDV
                </div>
                <div style={{ fontSize: 12, color: '#555870', marginTop: 2 }}>
                  Diploma Santé 2026-2027 — Mes RDVs passés
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {histLoading && (
                  <span style={{ fontSize: 12, color: '#555870', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
                  </span>
                )}
                <button onClick={fetchHistorique} style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                  <RefreshCw size={13} style={{ animation: histLoading ? 'spin 1s linear infinite' : 'none' }} />
                </button>
                {!histLoading && (
                  <span style={{ fontSize: 12, color: '#555870' }}>
                    {histRdvs.length} RDV{histRdvs.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Filtres par stage */}
            {uniqueStages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {stageFilter && (
                  <button
                    onClick={() => setStageFilter(null)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3d50', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#8b8fa8', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    ✕ Tous ({histRdvs.length})
                  </button>
                )}
                {uniqueStages.map(s => (
                  <button
                    key={s.label}
                    onClick={() => setStageFilter(stageFilter === s.label ? null : s.label)}
                    style={{
                      background: stageFilter === s.label ? `${s.color}22` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${stageFilter === s.label ? `${s.color}66` : '#3a3d50'}`,
                      borderRadius: 20, padding: '3px 10px',
                      color: stageFilter === s.label ? s.color : '#8b8fa8',
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >
                    {s.label} <span style={{ opacity: 0.7 }}>{s.count}</span>
                  </button>
                ))}
              </div>
            )}

            {!histLoading && histRdvs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#555870', fontSize: 13 }}>
                {user.hubspot_owner_id
                  ? 'Aucun RDV trouvé sur la pipeline Diploma Santé 2026-2027.'
                  : 'Aucun hubspot_owner_id configuré pour ce closer.'}
              </div>
            )}

            {filteredHistRdvs.length === 0 && stageFilter && !histLoading && (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: '#555870', fontSize: 13 }}>
                Aucun RDV avec le statut «&nbsp;{stageFilter}&nbsp;».
              </div>
            )}

            {filteredHistRdvs.map(rdv => {
              const RESULT_STATUSES = ['no_show', 'annule', 'a_travailler', 'pre_positif', 'positif', 'negatif']
              const resultCfg = RESULT_STATUSES.includes(rdv.status) ? STATUS_CONFIG[rdv.status as AppointmentStatus] : null

              return (
                <div
                  key={rdv.id}
                  onClick={() => setSelectedHistRdv(rdv)}
                  style={{
                    background: '#1d2f4b',
                    border: '1px solid #2d4a6b',
                    borderRadius: 12, marginBottom: 10, overflow: 'hidden',
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = user.avatar_color)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#2d4a6b')}
                >
                  {/* Ligne principale */}
                  <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 80, fontSize: 11, color: '#555870', flexShrink: 0 }}>
                      {new Date(rdv.start_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#e8eaf0', minWidth: 0 }}>
                      {rdv.prospect_name}
                      {rdv.telepro && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#555870', fontWeight: 400 }}>
                          via {rdv.telepro.name}
                        </span>
                      )}
                    </div>
                    {rdv.hs_stage_label && rdv.hs_stage_color && (
                      <span style={{
                        background: `${rdv.hs_stage_color}22`, border: `1px solid ${rdv.hs_stage_color}66`,
                        color: rdv.hs_stage_color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {rdv.hs_stage_label}
                      </span>
                    )}
                    {rdv.repop_form_date && (
                      <span style={{
                        background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.4)',
                        color: '#ccac71', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        🔁 Repop {format(new Date(rdv.repop_form_date), 'd MMM', { locale: fr })}
                      </span>
                    )}
                  </div>

                  {/* Infos prospect */}
                  <div style={{ padding: '0 20px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rdv.prospect_phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8b8fa8', background: '#243d5c', borderRadius: 5, padding: '2px 8px' }}>
                        <Phone size={10} /> {rdv.prospect_phone}
                      </span>
                    )}
                    {rdv.formation_type && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8b8fa8', background: '#243d5c', borderRadius: 5, padding: '2px 8px' }}>
                        <Tag size={10} style={{ color: '#ccac71' }} />
                        Filière : <strong style={{ color: '#e8eaf0' }}>{rdv.formation_type}</strong>
                      </span>
                    )}
                    {resultCfg && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: resultCfg.bg, color: resultCfg.color, border: `1px solid ${resultCfg.border}`, borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>
                        {resultCfg.label}
                      </span>
                    )}
                  </div>

                  {/* Boutons d'action pour "À replanifier" */}
                  {rdv.hs_stage_label === 'À replanifier' && (
                    <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleReprendre(rdv) }}
                        disabled={rebookLoading === rdv.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.35)',
                          borderRadius: 7, padding: '5px 12px', color: '#ccac71',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <RotateCcw size={12} />
                        {rebookLoading === rdv.id ? 'Chargement…' : 'Reprendre RDV'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); marquerPerdu(rdv) }}
                        disabled={closingDeal === rdv.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 7, padding: '5px 12px', color: '#ef4444',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <X size={12} />
                        {closingDeal === rdv.id ? 'En cours…' : 'Marquer comme perdu'}
                      </button>
                    </div>
                  )}

                  {/* Suivi post-RDV pour "Délai de réflexion" */}
                  {rdv.hs_stage_label === 'Délai de réflexion' && (
                    <div style={{ padding: '0 20px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#555870', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Suivi post-RDV
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {SUIVI_OPTIONS.map(opt => {
                          const isActive = rdv.telepro_suivi === opt.value
                          return (
                            <button
                              key={opt.value}
                              onClick={() => saveSuivi(rdv, isActive ? null : opt.value)}
                              disabled={savingSuivi === rdv.id}
                              style={{
                                background: isActive ? `${opt.color}22` : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${isActive ? `${opt.color}66` : '#3a3d50'}`,
                                borderRadius: 7, padding: '5px 12px',
                                color: isActive ? opt.color : '#8b8fa8',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                      {rdv.telepro_suivi && rdv.telepro_suivi_at && (
                        <p style={{ fontSize: 11, color: '#555870', margin: '6px 0 0' }}>
                          Mis à jour le {new Date(rdv.telepro_suivi_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Mes Leads ──────────────────────────────────────────── */}
      {activeTab === 'leads' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <User size={18} style={{ color: user.avatar_color }} />
                  Mes Leads — Pipeline HubSpot
                </div>
                <div style={{ fontSize: 12, color: '#555870', marginTop: 2 }}>
                  {leadsTotal > 0 ? `${leadsTotal} contacts synchronisés` : 'Contacts + transactions associés depuis HubSpot'}
                </div>
              </div>
              <button
                onClick={fetchLeads}
                disabled={leadsLoading}
                style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8, padding: '7px 14px', color: '#8b8fa8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'inherit' }}
              >
                <RefreshCw size={12} style={{ animation: leadsLoading ? 'spin 1s linear infinite' : 'none' }} />
                {leadsLoading ? 'Chargement…' : 'Actualiser'}
              </button>
            </div>
            {!user.hubspot_owner_id ? (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '16px 20px', color: '#ef4444', fontSize: 13 }}>
                ⚠ Ce compte n&apos;a pas d&apos;identifiant HubSpot Owner ID configuré.
              </div>
            ) : (
              <CRMContactsTable
                contacts={leadsContacts}
                loading={leadsLoading}
                mode="closer"
                onRefresh={fetchLeads}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Repop ───────────────────────────────────────────────── */}
      {activeTab === 'repop' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <RepopJournal
            hubspotOwnerId={user.hubspot_owner_id}
            scope="closer"
            scopeId={user.id}
          />
        </div>
      )}

      {/* Modal AppointmentModal pour l'historique */}
      {selectedHistRdv && (
        <AppointmentModal
          appointment={{
            ...selectedHistRdv,
            status: selectedHistRdv.status as AppointmentStatus,
            users: selectedHistRdv.users || undefined,
          }}
          onClose={() => setSelectedHistRdv(null)}
          onUpdate={(updated) => {
            setHistRdvs(prev => prev.map(r => r.id === selectedHistRdv.id ? { ...r, ...updated } : r))
          }}
        />
      )}

    </div>
  )
}
