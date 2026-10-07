'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { format, addDays, startOfWeek, startOfToday, isBefore } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowRight, Ban, Briefcase, CalendarDays, Check, CheckCircle, ChevronLeft, ChevronRight, Clock, Copy,
  FileText, GraduationCap, Link, LifeBuoy, LogOut, Mail, MapPin, Phone, Plus, RefreshCw, Repeat2, RotateCcw, Save,
  Search, Tag, User, UserPlus, Video, X,
} from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import { AppointmentStatus, STATUS_CONFIG } from '@/components/StatusBadge'
import AppointmentModal from '@/components/AppointmentModal'
import RepopJournal from '@/components/RepopJournal'
import PlatformGuide from '@/components/PlatformGuide'
import ResourcesPanel from '@/components/ResourcesPanel'
import UserCRMView from '@/components/UserCRMView'
import { crmV2 } from '@/lib/crm-v2-theme'
import CRMGlobalSearchBar from '@/components/CRMGlobalSearchBar'
import { parseExtraParticipants } from '@/lib/appointment-participants'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Card, CrmV2Header, CrmV2KpiCard, CrmV2KpiGrid, CrmV2StatusPill, CrmV2Tabs, CrmV2Toggle, hexA,
} from '@/components/crm-v2/primitives'
import {
  TpMobileHeader, TpPlusSheet, TpRoundButton, useLogout, useSupportUnread, type TpMenuItem,
} from '@/components/telepro-v2/ui'
import {
  ChoiceButton, CloserTabBar, FieldLabel, GoldButton, Notice, StepBar, StepCard, SupportPill, closerInput,
  type CloserMobileTab,
} from '@/components/crm-v2/closer/ui'

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
  extra_participants?: unknown
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

function isWeeklyMigrationMissing(status: number, errorMessage?: string): boolean {
  const msg = (errorMessage || '').toLowerCase()
  return (
    status === 503 ||
    msg.includes('rdv_availability_weekly') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('migration v26')
  )
}

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
for (let h = 7; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
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

const CAMPUS_OPTIONS = [
  '100 quai de la Rapée 75012 Paris',
  '29 rue Lauriston 75116 Paris',
]

function generateJitsiLink() {
  // Nom historique — génère désormais une URL LiveKit sur notre domaine.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)]
  const base = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://rdv-agenda.vercel.app')
  return `${base}/visio/rdv-${id}`
}

type CloserTab = 'planning' | 'rdv' | 'dispos' | 'historique' | 'repop' | 'leads' | 'contacts'

// ─── Composant principal ────────────────────────────────────────────────
export default function CloserClient({ user }: { user: CloserUser }) {
  usePageTitle(user.name)
  const [activeTab, setActiveTab] = useState<CloserTab>('planning')
  const [leadsTotal, setLeadsTotal] = useState(0)
  const [contactsTotal, setContactsTotal] = useState(0)
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
    { value: 'ne_repond_plus', label: 'Ne répond plus', color: '#6b7280' },
    { value: 'a_travailler',   label: 'À travailler',   color: '#b8963e' },
    { value: 'pre_positif',    label: 'Pré-positif',    color: '#06b6d4' },
  ]

  const fetchHistorique = useCallback(async () => {
    if (!user.id) return
    setHistLoading(true)
    try {
      const res = await fetch(`/api/appointments/historique-closer?closer_id=${user.id}`)
      const data = await res.json()
      setHistRdvs(data)
    } catch { /* ignore */ }
    setHistLoading(false)
  }, [user.id])

  useEffect(() => {
    if (activeTab === 'historique' && histRdvs.length === 0 && !histLoading) {
      fetchHistorique()
    }
  }, [activeTab, histRdvs.length, histLoading, fetchHistorique])


  const uniqueStages = histRdvs.reduce<Array<{ label: string; color: string; count: number }>>((acc, r) => {
    if (!r.hs_stage_label) return acc
    const existing = acc.find(s => s.label === r.hs_stage_label)
    if (existing) { existing.count++ } else { acc.push({ label: r.hs_stage_label, color: r.hs_stage_color || crmV2.textMuted, count: 1 }) }
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
    setClosingDeal(rdv.id)
    try {
      const res = await fetch(`/api/appointments/${rdv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'negatif' }),
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
        const res = await fetch(`/api/crm/contacts/${rdv.hubspot_contact_id}/details?phase=core`)
        const data = await res.json()
        if (res.ok && data.contact) {
          const c = data.contact
          const shaped: HubSpotContact = {
            id: c.hubspot_contact_id,
            properties: {
              email: c.email ?? '',
              firstname: c.firstname ?? '',
              lastname: c.lastname ?? '',
              phone: c.phone ?? '',
              departement: c.departement != null ? String(c.departement) : '',
              classe_actuelle: c.classe_actuelle ?? '',
              diploma_sante___formation_demandee: c.formation_demandee ?? '',
            },
          }
          setContact(shaped)
          const ev = c.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
          if (c.phone) setPhone(c.phone)
          if (c.departement) setDepartement(String(c.departement))
          if (c.classe_actuelle) setClasseActuelle(c.classe_actuelle)
          if (c.formation_demandee) setFormation(c.formation_demandee)
        }
      } finally {
        setRebookLoading(null)
      }
    }
    setActiveTab('rdv')
  }

  // ── Availability rules (par semaine) ──
  // Helper local pour calculer le lundi ISO d'une date
  const mondayISO = (d: Date): string => {
    const x = new Date(d.getTime())
    const dow = x.getDay()
    const diff = dow === 0 ? -6 : 1 - dow
    x.setDate(x.getDate() + diff)
    x.setHours(0, 0, 0, 0)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const addWeeksISOLocal = (iso: string, n: number): string => {
    const d = new Date(iso + 'T00:00:00')
    d.setDate(d.getDate() + n * 7)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const weekLabelLocal = (iso: string): string => {
    const start = new Date(iso + 'T00:00:00')
    const end = new Date(start.getTime())
    end.setDate(end.getDate() + 6)
    const sameMonth = start.getMonth() === end.getMonth()
    if (sameMonth) {
      return `${format(start, 'd', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
    }
    return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
  }

  const [dispoWeekStart, setDispoWeekStart] = useState<string>(() => mondayISO(new Date()))
  const [rules, setRules] = useState<AvailabilityRule[]>(
    DAYS.map(d => ({
      user_id: user.id,
      day_of_week: d.value,
      start_time: '09:00',
      end_time: '18:00',
      is_active: false,
    }))
  )
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [rulesMigrationNeeded, setRulesMigrationNeeded] = useState(false)

  // ── Blocked dates ──
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [blockReason, setBlockReason] = useState('')
  const [blockingDate, setBlockingDate] = useState<string | null>(null)
  const [calendarWeekStart, setCalendarWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  // ── Booking form — contact ──
  const [lookupMode, setLookupMode] = useState<'search' | 'new'>('search')
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [contact, setContact] = useState<HubSpotContact | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([])
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
  const [meetingType, setMeetingType] = useState<'visio' | 'presentiel'>('visio')
  const [meetingLink, setMeetingLink] = useState(() => generateJitsiLink())
  const [meetingCampus, setMeetingCampus] = useState(CAMPUS_OPTIONS[0])
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
  // Mode par semaine : charge les regles de la semaine selectionnee.
  const loadRules = useCallback(async () => {
    const res = await fetch(`/api/availability?mode=rules&user_id=${user.id}&week_start=${dispoWeekStart}`)
    const json = await res.json().catch(() => null) as { error?: string; rules?: AvailabilityRule[] } | null
    if (isWeeklyMigrationMissing(res.status, json?.error)) {
      setRulesMigrationNeeded(true)
      setRulesError('Migration v26 manquante')
      return
    }
    setRulesMigrationNeeded(false)
    if (!res.ok) {
      setRulesError(json?.error || 'Erreur lors du chargement des disponibilites')
      return
    }
    setRulesError(null)
    const data: AvailabilityRule[] = Array.isArray(json) ? json : (json?.rules ?? [])
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
  }, [user.id, dispoWeekStart])

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
          week_start: dispoWeekStart,
          rules: rules.map(r => ({
            day_of_week: r.day_of_week,
            start_time: r.start_time,
            end_time: r.end_time,
            is_active: r.is_active,
          })),
        }),
      })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (isWeeklyMigrationMissing(res.status, data?.error)) {
        setRulesMigrationNeeded(true)
        setRulesError('Migration v26 manquante')
        return
      }
      if (res.ok) {
        setRulesSaved(true)
        setTimeout(() => setRulesSaved(false), 3000)
      } else {
        setRulesError(data?.error || 'Erreur lors de la sauvegarde')
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

  // ── Booking: recherche dans le CRM (Supabase) ──
  async function searchContact() {
    if (!lookupInput.trim()) return
    setLookupLoading(true); setLookupError(null); setSearchResults([])
    try {
      // all_classes=1 + show_external=1 : pas de filtre sur classes prioritaires
      // ni equipe externe pour retrouver tout contact existant dans le CRM.
      const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(lookupInput.trim())}&limit=10&all_classes=1&show_external=1`)
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error || 'Erreur'); return }
      const results = data.data ?? []
      if (results.length === 0) { setLookupError('Aucun contact trouvé dans le CRM.'); return }
      setSearchResults(results)
    } catch { setLookupError('Erreur réseau') }
    finally { setLookupLoading(false) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickSearchResult(c: any) {
    const shaped: HubSpotContact = {
      id: c.hubspot_contact_id,
      properties: {
        email: c.email ?? '',
        firstname: c.firstname ?? '',
        lastname: c.lastname ?? '',
        phone: c.phone ?? '',
        departement: c.departement != null ? String(c.departement) : '',
        classe_actuelle: c.classe_actuelle ?? '',
        diploma_sante___formation_demandee: c.formation_demandee ?? '',
      },
    }
    setContact(shaped)
    setSearchResults([])
    const ev = c.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
    if (c.phone) setPhone(c.phone)
    if (c.departement) setDepartement(String(c.departement))
    if (c.classe_actuelle) setClasseActuelle(c.classe_actuelle)
    if (c.formation_demandee) setFormation(c.formation_demandee)
  }

  async function createNewContact() {
    if (!newFirstname.trim() || !newLastname.trim() || !newEmail.trim()) return
    setCreating(true); setLookupError(null)
    try {
      const res = await fetch('/api/crm/contacts', {
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
    setContact(null); setLookupInput(''); setLookupError(null); setSearchResults([])
    setEmail(''); emailOriginalRef.current = ''; setEmailSynced(false)
    setPhone(''); setDepartement(''); setClasseActuelle(''); setFormation('')
    setMeetingType('visio'); setMeetingLink(generateJitsiLink()); setMeetingCampus(CAMPUS_OPTIONS[0]); setLinkCopied(false)
    setNotes(''); setSelectedDate(null); setSelectedSlot(null); setSubmitError(null)
    setNewFirstname(''); setNewLastname(''); setNewEmail(''); setNewPhone('')
    setNewFormation(''); setNewClasse(''); setNewDepartement('')
  }

  async function syncEmail() {
    if (!contact || !email.trim() || email.trim() === emailOriginalRef.current) return
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) { emailOriginalRef.current = email.trim(); setEmailSynced(true); setTimeout(() => setEmailSynced(false), 2000) }
    } catch { /* silencieux */ }
  }

  // ── Booking: submit ──
  const contactName = contact ? [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') : ''
  const contactEmail = email || contact?.properties.email || ''
  const canSubmit = contact && selectedSlot && phone && departement && classeActuelle && formation && (meetingType !== 'presentiel' || !!meetingCampus)

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
          meeting_link: meetingType === 'visio' ? meetingLink || null : (meetingType === 'presentiel' ? meetingCampus : null),
          telepro_id: user.id,
          call_notes: [
            `📚 Formation demandée : ${formationLabel}`,
            `📍 Département : ${departement}`,
            `🎓 Classe actuelle : ${classeActuelle}`,
            phone ? `📞 Téléphone : ${phone}` : '',
            meetingType === 'presentiel' ? `🏫 Campus : ${meetingCampus}` : '',
            notes.trim() ? `\n📝 Notes :\n${notes.trim()}` : '',
          ].filter(Boolean).join('\n'),
          booking_note: notes.trim() || null,
        }),
      })
      if (res.ok) {
        // Le serveur génère le vrai lien (Google Meet) et le renvoie : on
        // affiche celui-ci, pas le lien temporaire généré côté client.
        const created = await res.json().catch(() => null)
        if (created?.meeting_link) setMeetingLink(created.meeting_link)
        setRdvSuccess(true)
      }
      else { const data = await res.json(); setSubmitError(data.error || 'Erreur') }
    } finally { setSubmitting(false) }
  }


  // ─── Présentation V2 ──────────────────────────────────────────────────
  const isMobile = useIsMobile()
  const firstName = (user.name || '').trim().split(/\s+/)[0] || user.name
  const supportUnread = useSupportUnread()
  const logout = useLogout()
  const [plusOpen, setPlusOpen] = useState(false)
  const inp = closerInput(isMobile)

  function goTab(tab: CloserTab) {
    setActiveTab(tab)
    setPlusOpen(false)
  }

  // « Nouveau RDV » depuis l'en-tête ou la barre du bas : repart d'un formulaire vierge
  // si le RDV précédent vient d'être enregistré.
  function goNewRdv() {
    if (rdvSuccess) { setRdvSuccess(false); resetContact() }
    goTab('rdv')
  }

  const skin = (node: ReactNode, style?: React.CSSProperties) => (
    // Composants partagés encore au style d'origine : habillés par la skin V2
    <div className="crm-v2-skin" style={style}>{node}</div>
  )

  const fullHeight: React.CSSProperties = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
  const pagePad: React.CSSProperties = isMobile
    ? { padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }
    : { maxWidth: 1080, width: '100%', margin: '0 auto', padding: '20px 28px 32px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }

  const roundIconBtn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 999, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg,
    color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    flexShrink: 0, fontFamily: 'inherit',
  }

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // ── Nouveau RDV : écran de confirmation ──
  const successContent = (
    <div style={{ ...pagePad, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <CrmV2Card style={{ padding: isMobile ? 20 : '32px 32px 28px', maxWidth: 460, width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
        <span style={{
          width: 56, height: 56, borderRadius: '50%', background: 'rgba(22,163,74,0.10)', color: crmV2.successStrong,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <CheckCircle size={28} />
        </span>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>RDV enregistré</div>
        <div style={{ fontSize: 15, color: crmV2.textMuted, marginBottom: 4 }}>{contactName}</div>
        <div style={{ fontSize: 14, color: crmV2.successStrong, fontWeight: 700, textTransform: 'capitalize' }}>
          {selectedSlot && format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
        </div>
        {meetingType === 'visio' && meetingLink && (
          <div style={{
            background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 12,
            padding: '10px 12px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          }}>
            <Video size={14} style={{ color: crmV2.gold, flexShrink: 0 }} />
            <a href={meetingLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: crmV2.goldDark, wordBreak: 'break-all', flex: 1 }}>{meetingLink}</a>
            <CrmV2Button size="sm" variant={linkCopied ? 'secondary' : 'gold'} onClick={copyLink} icon={linkCopied ? <Check size={12} /> : <Copy size={12} />}>
              {linkCopied ? 'Copié' : 'Copier'}
            </CrmV2Button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <CrmV2Button variant="accent" icon={<Plus size={14} />} onClick={() => { setRdvSuccess(false); resetContact() }} style={{ flex: 1, minHeight: 42 }}>
            Nouveau RDV
          </CrmV2Button>
          <CrmV2Button icon={<CalendarDays size={14} />} onClick={() => { setRdvSuccess(false); resetContact(); setActiveTab('planning') }} style={{ flex: 1, minHeight: 42 }}>
            Mon planning
          </CrmV2Button>
        </div>
      </CrmV2Card>
    </div>
  )

  // ── Nouveau RDV : formulaire en 3 étapes ──
  const rdvStep = !contact ? 1 : !selectedSlot ? 2 : 3
  const rdvStepDone = [!!contact, !!selectedSlot, !!canSubmit]

  const contactStep = (
    <StepCard
      n={1}
      done={!!contact}
      title={contact ? 'Contact sélectionné' : 'Trouver le contact dans le CRM'}
      subtitle={contact ? undefined : 'Rechercher un contact existant ou en créer un nouveau'}
    >
      {contact ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: crmV2.bg, border: '1px solid rgba(0,189,165,0.45)', borderRadius: 12, padding: '10px 12px',
        }}>
          <span style={{
            width: 40, height: 40, borderRadius: '36%', background: hexA(user.avatar_color || crmV2.gold, 0.14),
            color: user.avatar_color || crmV2.gold, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <User size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {[contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || 'Sans nom'}
            </div>
            <div style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.properties.email}</div>
          </div>
          <CrmV2Button size="sm" variant="danger" icon={<X size={12} />} onClick={resetContact} style={{ minHeight: 34 }}>
            Changer
          </CrmV2Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Choix Rechercher / Nouveau contact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([
              { key: 'search' as const, label: isMobile ? 'Rechercher' : 'Rechercher dans le CRM', icon: <Search size={14} /> },
              { key: 'new' as const, label: 'Nouveau contact', icon: <UserPlus size={14} /> },
            ]).map(m => (
              <ChoiceButton key={m.key} active={lookupMode === m.key} onClick={() => { setLookupMode(m.key); setLookupError(null); setSearchResults([]) }}>
                {m.icon} {m.label}
              </ChoiceButton>
            ))}
          </div>

          {lookupMode === 'search' ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={lookupInput}
                  onChange={e => setLookupInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchContact()}
                  placeholder="Nom, prénom, email ou téléphone…"
                  style={{ ...inp, flex: 1 }}
                />
                <CrmV2Button
                  variant="primary"
                  onClick={searchContact}
                  disabled={lookupLoading || !lookupInput.trim()}
                  icon={<Search size={14} />}
                  style={{ minHeight: isMobile ? 44 : 40 }}
                >
                  {lookupLoading ? 'Recherche…' : 'Chercher'}
                </CrmV2Button>
              </div>
              {searchResults.length > 0 && (
                <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, background: crmV2.bg, maxHeight: 320, overflowY: 'auto' }}>
                  {searchResults.map(r => {
                    const fullName = [r.firstname, r.lastname].filter(Boolean).join(' ') || '(Sans nom)'
                    return (
                      <button key={r.hubspot_contact_id}
                        type="button"
                        onClick={() => pickSearchResult(r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', minHeight: 52, background: 'transparent', border: 'none', borderBottom: `1px solid ${crmV2.borderLight}`, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.background = crmV2.rowHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ width: 34, height: 34, borderRadius: '36%', background: hexA(user.avatar_color || crmV2.gold, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={15} style={{ color: user.avatar_color || crmV2.gold }} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
                          <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[r.email, r.phone, r.classe_actuelle].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <ChevronRight size={15} color={crmV2.textFaint} />
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
              <input value={newFirstname} onChange={e => setNewFirstname(e.target.value)} placeholder="Prénom *" style={inp} />
              <input value={newLastname} onChange={e => setNewLastname(e.target.value)} placeholder="Nom *" style={inp} />
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email *" style={{ ...inp, gridColumn: '1 / -1' }} />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone" inputMode="tel" style={inp} />
              <input value={newDepartement} onChange={e => setNewDepartement(e.target.value)} placeholder="Département" style={inp} />
              <CrmV2Button
                variant="primary"
                onClick={createNewContact}
                disabled={creating || !newFirstname.trim() || !newLastname.trim() || !newEmail.trim()}
                icon={<UserPlus size={14} />}
                style={{ gridColumn: '1 / -1', minHeight: 42 }}
              >
                {creating ? 'Création…' : 'Créer le contact'}
              </CrmV2Button>
            </div>
          )}

          {lookupError && <Notice>{lookupError}</Notice>}
        </div>
      )}
    </StepCard>
  )

  const slotStep = (
    <StepCard
      n={2}
      done={!!selectedSlot}
      title="Date et créneau"
      subtitle={selectedSlot
        ? <span style={{ textTransform: 'capitalize' }}>{format(new Date(selectedSlot.start), "EEEE d MMMM 'à' HH:mm", { locale: fr })}</span>
        : 'Mes créneaux libres sur les 10 prochains jours ouvrés'}
    >
      {/* Jours */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
        {bookingDays.map(day => {
          const isSelected = !!selectedDate && isBefore(day, addDays(selectedDate, 1)) && !isBefore(day, selectedDate)
          return (
            <button key={day.toISOString()} type="button" onClick={() => handleSelectDate(day)}
              style={{
                flexShrink: 0, minWidth: 58, padding: '8px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
                background: isSelected ? crmV2.primary : crmV2.bg,
                border: `1px solid ${isSelected ? crmV2.primary : crmV2.borderStrong}`,
                color: isSelected ? '#fff' : crmV2.text,
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: isSelected ? 'rgba(255,255,255,0.75)' : crmV2.textMuted }}>{format(day, 'EEE', { locale: fr })}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{format(day, 'd')}</div>
              <div style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.75)' : crmV2.textMuted }}>{format(day, 'MMM', { locale: fr })}</div>
            </button>
          )
        })}
      </div>

      {/* Créneaux */}
      {selectedDate ? (
        slotsLoading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: crmV2.textMuted, fontSize: 13 }}>Chargement des créneaux…</div>
        ) : slots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: crmV2.textMuted, fontSize: 13 }}>Aucun créneau disponible ce jour.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6, marginTop: 14 }}>
            {slots.map(slot => (
              <ChoiceButton key={slot.start} active={selectedSlot?.start === slot.start} onClick={() => setSelectedSlot(slot)} style={{ padding: '0 8px' }}>
                {format(new Date(slot.start), 'HH:mm')}
              </ChoiceButton>
            ))}
          </div>
        )
      ) : (
        <div style={{ fontSize: 13, color: crmV2.textFaint, marginTop: 12 }}>Choisis un jour pour voir les créneaux.</div>
      )}
    </StepCard>
  )

  const infosStep = (
    <StepCard n={3} done={!!canSubmit} title="Informations prospect" subtitle="Les champs marqués * sont obligatoires">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <div>
          <FieldLabel icon={<Mail size={12} />} extra={emailSynced ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: crmV2.successStrong, fontWeight: 700 }}><Check size={11} /> Synchronisé</span>
          ) : undefined}>Email</FieldLabel>
          <input value={email} onChange={e => setEmail(e.target.value)} onBlur={syncEmail} placeholder="email@exemple.com" style={inp} />
        </div>
        <div>
          <FieldLabel icon={<Phone size={12} />}>Téléphone *</FieldLabel>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33 6 00 00 00 00" inputMode="tel" style={inp} />
        </div>
        <div>
          <FieldLabel icon={<MapPin size={12} />}>Département *</FieldLabel>
          <input value={departement} onChange={e => setDepartement(e.target.value)} placeholder="ex: 75" style={inp} />
        </div>
        <div>
          <FieldLabel icon={<GraduationCap size={12} />}>Classe actuelle *</FieldLabel>
          <select value={classeActuelle} onChange={e => setClasseActuelle(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Sélectionner…</option>
            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel icon={<Tag size={12} />}>Formation demandée *</FieldLabel>
          <select value={formation} onChange={e => setFormation(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Sélectionner…</option>
            {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel icon={<Video size={12} />}>Type de réunion</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([
              { value: 'visio', label: 'Visio', icon: <Video size={14} /> },
              { value: 'presentiel', label: 'Présentiel', icon: <MapPin size={14} /> },
            ] as const).map(t => (
              <ChoiceButton key={t.value} active={meetingType === t.value} onClick={() => {
                setMeetingType(t.value)
                if (t.value === 'presentiel' && !meetingCampus) setMeetingCampus(CAMPUS_OPTIONS[0])
              }}>
                {t.icon} {t.label}
              </ChoiceButton>
            ))}
          </div>
        </div>
        {meetingType === 'presentiel' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel icon={<MapPin size={12} />}>Campus (présentiel)</FieldLabel>
            <select value={meetingCampus} onChange={e => setMeetingCampus(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {CAMPUS_OPTIONS.map(campus => (
                <option key={campus} value={campus}>{campus}</option>
              ))}
            </select>
          </div>
        )}
        {meetingType === 'visio' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel icon={<Link size={12} />}>Lien de visio</FieldLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} style={{ ...inp, flex: 1, fontSize: 12 }} />
              <CrmV2Button variant={linkCopied ? 'secondary' : 'gold'} onClick={copyLink} icon={linkCopied ? <Check size={14} /> : <Copy size={14} />} style={{ minHeight: isMobile ? 44 : 40 }}>
                {linkCopied ? 'Copié' : 'Copier'}
              </CrmV2Button>
            </div>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel icon={<FileText size={12} />}>Notes d&apos;appel</FieldLabel>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations, contexte particulier…" rows={3}
            style={{ ...inp, height: 'auto', minHeight: 84, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      </div>
    </StepCard>
  )

  const submitBlock = (
    <>
      {submitError && <Notice>{submitError}</Notice>}
      <GoldButton onClick={submitRdv} disabled={submitting || !canSubmit}>
        <CheckCircle size={16} />
        {submitting ? 'Enregistrement…' : 'Valider le RDV'}
      </GoldButton>
    </>
  )

  const newRdvContent = rdvSuccess ? successContent : isMobile ? (
    <>
      <TpMobileHeader title="Nouveau RDV" subtitle="Placer un RDV dans mon planning">
        <div style={{ marginTop: 12 }}>
          <StepBar labels={['Contact', 'Créneau', 'Infos']} step={rdvStep} done={rdvStepDone} />
        </div>
      </TpMobileHeader>
      <div style={pagePad}>
        {contactStep}
        {slotStep}
        {infosStep}
      </div>
      <div style={{ position: 'sticky', bottom: 0, padding: '10px 12px 12px', background: crmV2.bgSoft, borderTop: `1px solid ${crmV2.border}`, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        {submitBlock}
      </div>
    </>
  ) : (
    <div style={pagePad}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Nouveau RDV</div>
        <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>Placer un RDV dans mon planning</div>
        <div style={{ maxWidth: 520, marginTop: 12 }}>
          <StepBar labels={['Contact', 'Créneau', 'Infos']} step={rdvStep} done={rdvStepDone} />
        </div>
      </div>
      {contactStep}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {slotStep}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {infosStep}
          {submitBlock}
        </div>
      </div>
    </div>
  )

  // ── Mes disponibilités ──
  const todayStr = format(today, 'yyyy-MM-dd')
  const activeRules = rules.filter(r => r.is_active)
  const weekMinutes = activeRules.reduce((sum, r) => {
    const [sh, sm] = r.start_time.split(':').map(Number)
    const [eh, em] = r.end_time.split(':').map(Number)
    return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
  }, 0)
  const upcomingBlocked = blockedDates.filter(b => b.blocked_date >= todayStr).length
  const weekHoursLabel = `${Math.floor(weekMinutes / 60)} h${weekMinutes % 60 ? String(weekMinutes % 60).padStart(2, '0') : ''}`

  const timeSelect: React.CSSProperties = {
    ...inp, width: isMobile ? 76 : 96, height: 36, padding: '0 8px', fontSize: 13, cursor: 'pointer', flexShrink: 0,
  }

  const disposContent = (
    <>
      {isMobile && <TpMobileHeader title="Mes dispos" subtitle={weekLabelLocal(dispoWeekStart)} />}
      <div style={{ ...pagePad, maxWidth: isMobile ? undefined : 960 }}>
        <CrmV2KpiGrid>
          <CrmV2KpiCard label="Jours actifs" icon={<CalendarDays size={15} />} color={crmV2.text} value={`${activeRules.length}/7`} detail="sur la semaine affichée" />
          <CrmV2KpiCard label="Heures dispo" icon={<Clock size={15} />} color={crmV2.goldDark} value={weekHoursLabel} detail="ouvertes à la prise de RDV" />
          <CrmV2KpiCard label="Jours bloqués" icon={<Ban size={15} />} color={upcomingBlocked > 0 ? '#d13a41' : crmV2.textMuted} value={upcomingBlocked} detail="à venir" />
        </CrmV2KpiGrid>

        {/* Section 1 : planning par semaine */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Clock size={16} style={{ color: crmV2.gold }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>Planning de la semaine</div>
          </div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginBottom: 14 }}>Les créneaux ouverts chaque jour pour la prise de RDV.</div>

          {rulesMigrationNeeded && (
            <Notice tone="warning" style={{ marginBottom: 14 }}>
              <strong>Mode hebdomadaire pas encore activé.</strong>
              <br />Demande à l&apos;admin d&apos;appliquer la migration v26 (modale Disponibilités → bouton &quot;Activer le mode hebdomadaire&quot;).
            </Notice>
          )}

          {/* Sélecteur de semaine */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12,
            padding: 6, background: crmV2.bgSoft, borderRadius: 999, border: `1px solid ${crmV2.border}`,
          }}>
            <button type="button" onClick={() => setDispoWeekStart(addWeeksISOLocal(dispoWeekStart, -1))} title="Semaine précédente" aria-label="Semaine précédente"
              style={isMobile ? roundIconBtn : { ...roundIconBtn, width: 'auto', padding: '0 12px', gap: 4, fontSize: 12, fontWeight: 600, color: crmV2.text }}>
              <ChevronLeft size={14} />{!isMobile && 'Sem. précédente'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap' }}>{weekLabelLocal(dispoWeekStart)}</div>
              {dispoWeekStart !== mondayISO(new Date()) && (
                <CrmV2Button size="sm" variant="gold" onClick={() => setDispoWeekStart(mondayISO(new Date()))} style={{ padding: '4px 10px' }}>
                  Aujourd&apos;hui
                </CrmV2Button>
              )}
            </div>
            <button type="button" onClick={() => setDispoWeekStart(addWeeksISOLocal(dispoWeekStart, 1))} title="Semaine suivante" aria-label="Semaine suivante"
              style={isMobile ? roundIconBtn : { ...roundIconBtn, width: 'auto', padding: '0 12px', gap: 4, fontSize: 12, fontWeight: 600, color: crmV2.text }}>
              {!isMobile && 'Sem. suivante'}<ChevronRight size={14} />
            </button>
          </div>

          {/* Copier la semaine précédente */}
          <div style={{ marginBottom: 12 }}>
            <CrmV2Button
              size="sm"
              icon={<Copy size={13} />}
              onClick={async () => {
                const previousWeek = addWeeksISOLocal(dispoWeekStart, -1)
                const res = await fetch('/api/availability?action=copy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    user_id: user.id,
                    from_week_start: previousWeek,
                    to_week_start: dispoWeekStart,
                  }),
                })
                const data = await res.json().catch(() => null) as { error?: string } | null
                if (res.ok) loadRules()
                else if (isWeeklyMigrationMissing(res.status, data?.error)) {
                  setRulesMigrationNeeded(true)
                  setRulesError('Migration v26 manquante')
                }
              }}
            >
              Copier la semaine précédente
            </CrmV2Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DAYS.map(day => {
              const rule = rules.find(r => r.day_of_week === day.value)!
              return (
                <div key={day.value} style={{
                  display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '8px 10px' : '8px 14px', minHeight: 48, boxSizing: 'border-box',
                  background: rule.is_active ? crmV2.goldSoft : crmV2.bgHover,
                  border: `1px solid ${rule.is_active ? crmV2.goldBorder : crmV2.border}`, borderRadius: 12,
                }}>
                  <CrmV2Toggle checked={rule.is_active} onChange={v => updateRule(day.value, 'is_active', v)} />
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: rule.is_active ? crmV2.text : crmV2.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isMobile ? day.label.slice(0, 3) + '.' : day.label}
                  </div>
                  <select value={rule.start_time} onChange={e => updateRule(day.value, 'start_time', e.target.value)} disabled={!rule.is_active} style={{ ...timeSelect, opacity: rule.is_active ? 1 : 0.4 }}>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ArrowRight size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
                  <select value={rule.end_time} onChange={e => updateRule(day.value, 'end_time', e.target.value)} disabled={!rule.is_active} style={{ ...timeSelect, opacity: rule.is_active ? 1 : 0.4 }}>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <CrmV2Button variant="primary" onClick={saveRules} disabled={rulesSaving} icon={<Save size={14} />} style={{ minHeight: 40 }}>
              {rulesSaving ? 'Enregistrement…' : 'Enregistrer le planning'}
            </CrmV2Button>
            {rulesSaved && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: crmV2.successStrong, fontSize: 13, fontWeight: 600 }}><CheckCircle size={15} /> Enregistré</div>}
            {rulesError && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d13a41', fontSize: 13 }}><X size={15} /> {rulesError}</div>}
          </div>
        </CrmV2Card>

        {/* Section 2 : jours bloqués */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ban size={16} style={{ color: '#ef4444' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>Jours bloqués</div>
          </div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginBottom: 14 }}>Vacances, indisponibilités : clique sur une date pour la bloquer.</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button type="button" onClick={() => setCalendarWeekStart(prev => addDays(prev, -7))} style={roundIconBtn} title="Semaine précédente" aria-label="Semaine précédente">
              <ChevronLeft size={14} />
            </button>
            <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.textMuted, flex: isMobile ? 1 : undefined, textAlign: 'center' }}>
              {format(calendarWeekStart, 'd MMM', { locale: fr })} — {format(addDays(calendarWeekStart, 27), 'd MMM yyyy', { locale: fr })}
            </div>
            <button type="button" onClick={() => setCalendarWeekStart(prev => addDays(prev, 7))} style={roundIconBtn} title="Semaine suivante" aria-label="Semaine suivante">
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 16, maxWidth: 520 }}>
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: crmV2.textFaint, textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
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
                    type="button"
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
                    style={{
                      width: '100%', aspectRatio: '1', minHeight: 40, borderRadius: 10, fontFamily: 'inherit',
                      background: isBlocked ? 'rgba(239,68,68,0.12)' : isConfirming ? crmV2.goldSoft : isPast ? crmV2.bgHover : crmV2.bg,
                      border: `1px solid ${isBlocked ? 'rgba(239,68,68,0.40)' : isConfirming ? crmV2.gold : crmV2.border}`,
                      color: isPast ? crmV2.borderStrong : isBlocked ? '#d13a41' : isConfirming ? crmV2.goldDark : crmV2.text,
                      fontSize: 13, fontWeight: 600, cursor: isPast || isSunday ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s, border-color .12s',
                    }}>
                    {format(day, 'd')}
                  </button>
                </div>
              )
            })}
          </div>

          {blockingDate && (
            <div style={{
              background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 13, color: crmV2.goldDark, fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                Bloquer le {format(new Date(blockingDate + 'T00:00:00'), 'EEEE d MMMM', { locale: fr })}
              </div>
              <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Raison (optionnel)…" style={{ ...inp, height: 36, flex: 1, minWidth: 140, fontSize: 13 }} />
              <CrmV2Button variant="primary" size="sm" icon={<Plus size={12} />} onClick={() => blockDate(blockingDate)} style={{ minHeight: 36 }}>
                Bloquer
              </CrmV2Button>
              <button type="button" onClick={() => { setBlockingDate(null); setBlockReason('') }} style={roundIconBtn} title="Annuler" aria-label="Annuler">
                <X size={14} />
              </button>
            </div>
          )}

          {blockedDates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {blockedDates.map(b => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44,
                  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '6px 8px 6px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Ban size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                      {format(new Date(b.blocked_date + 'T00:00:00'), isMobile ? 'EEE d MMM yyyy' : 'EEEE d MMMM yyyy', { locale: fr })}
                    </span>
                    {b.reason && <span style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {b.reason}</span>}
                  </div>
                  <CrmV2Button size="sm" variant="danger" onClick={() => unblockDate(b.id)} style={{ flexShrink: 0 }}>
                    Débloquer
                  </CrmV2Button>
                </div>
              ))}
            </div>
          )}

          {blockedDates.length === 0 && !blockingDate && (
            <div style={{ fontSize: 13, color: crmV2.textFaint, textAlign: 'center', padding: '8px 0' }}>
              Aucun jour bloqué. Cliquez sur une date ci-dessus pour la bloquer.
            </div>
          )}
        </CrmV2Card>
      </div>
    </>
  )

  // ── Historique (onglet retiré de la navigation, conservé) ──
  const historiqueContent = (
    <div style={pagePad}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Historique RDV</div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>Diploma Santé 2026-2027 — Mes RDVs passés</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!histLoading && (
            <span style={{ fontSize: 13, color: crmV2.textMuted }}>{histRdvs.length} RDV{histRdvs.length > 1 ? 's' : ''}</span>
          )}
          <TpRoundButton onClick={fetchHistorique} title="Actualiser" spinning={histLoading}><RefreshCw size={14} /></TpRoundButton>
        </div>
      </div>

      {/* Filtres par étape */}
      {uniqueStages.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {stageFilter && (
            <button type="button" onClick={() => setStageFilter(null)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
              borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <X size={12} /> Tous ({histRdvs.length})
            </button>
          )}
          {uniqueStages.map(s => (
            <button key={s.label} type="button" onClick={() => setStageFilter(stageFilter === s.label ? null : s.label)} style={{
              background: stageFilter === s.label ? hexA(s.color, 0.12) : crmV2.bg,
              border: `1px solid ${stageFilter === s.label ? hexA(s.color, 0.4) : crmV2.border}`,
              borderRadius: 999, padding: '5px 12px', color: stageFilter === s.label ? s.color : crmV2.textMuted,
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
            }}>
              {s.label} <span style={{ opacity: 0.7 }}>{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {!histLoading && histRdvs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: crmV2.textMuted, fontSize: 13 }}>
          {user.hubspot_owner_id
            ? 'Aucun RDV trouvé sur la pipeline Diploma Santé 2026-2027.'
            : 'Aucun ID propriétaire configuré pour ce closer.'}
        </div>
      )}

      {filteredHistRdvs.length === 0 && stageFilter && !histLoading && (
        <div style={{ textAlign: 'center', padding: '30px 20px', color: crmV2.textMuted, fontSize: 13 }}>
          Aucun RDV avec le statut «&nbsp;{stageFilter}&nbsp;».
        </div>
      )}

      {filteredHistRdvs.map(rdv => {
        const RESULT_STATUSES = ['no_show', 'annule', 'a_travailler', 'pre_positif', 'positif', 'negatif']
        const resultCfg = RESULT_STATUSES.includes(rdv.status) ? STATUS_CONFIG[rdv.status as AppointmentStatus] : null
        const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: crmV2.textMuted, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '2px 9px' }
        return (
          <div key={rdv.id} onClick={() => setSelectedHistRdv(rdv)} style={{
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
            cursor: 'pointer', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: crmV2.textMuted, flexShrink: 0 }}>
                {new Date(rdv.start_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
              </div>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: crmV2.text, minWidth: 0 }}>
                {rdv.prospect_name}
                {rdv.telepro && <span style={{ marginLeft: 8, fontSize: 12, color: crmV2.textMuted, fontWeight: 500 }}>via {rdv.telepro.name}</span>}
              </div>
              {rdv.hs_stage_label && rdv.hs_stage_color && (
                <CrmV2StatusPill label={rdv.hs_stage_label} color={rdv.hs_stage_color} style={{ fontSize: 11 }} />
              )}
              {rdv.repop_form_date && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: crmV2.goldSoft, color: crmV2.goldDark, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                  <Repeat2 size={11} /> Repop {format(new Date(rdv.repop_form_date), 'd MMM', { locale: fr })}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {rdv.prospect_phone && <span style={chip}><Phone size={10} /> {rdv.prospect_phone}</span>}
              {rdv.formation_type && <span style={chip}><Tag size={10} color={crmV2.gold} /> Filière : <strong style={{ color: crmV2.text }}>{rdv.formation_type}</strong></span>}
              {resultCfg && <span style={{ ...chip, background: resultCfg.bg, color: resultCfg.color, border: `1px solid ${resultCfg.border}`, fontWeight: 700 }}>{resultCfg.label}</span>}
            </div>
            {rdv.hs_stage_label === 'À replanifier' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <CrmV2Button size="sm" variant="gold" icon={<RotateCcw size={12} />} disabled={rebookLoading === rdv.id}
                  onClick={e => { e.stopPropagation(); handleReprendre(rdv) }}>
                  {rebookLoading === rdv.id ? 'Chargement…' : 'Reprendre RDV'}
                </CrmV2Button>
                <CrmV2Button size="sm" variant="danger" icon={<X size={12} />} disabled={closingDeal === rdv.id}
                  onClick={e => { e.stopPropagation(); marquerPerdu(rdv) }}>
                  {closingDeal === rdv.id ? 'En cours…' : 'Marquer comme perdu'}
                </CrmV2Button>
              </div>
            )}
            {rdv.hs_stage_label === 'Délai de réflexion' && (
              <div onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Suivi post-RDV</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUIVI_OPTIONS.map(opt => {
                    const isActive = rdv.telepro_suivi === opt.value
                    return (
                      <button key={opt.value} type="button" onClick={() => saveSuivi(rdv, isActive ? null : opt.value)} disabled={savingSuivi === rdv.id} style={{
                        background: isActive ? hexA(opt.color, 0.12) : crmV2.bg, border: `1px solid ${isActive ? hexA(opt.color, 0.4) : crmV2.border}`,
                        borderRadius: 999, padding: '5px 12px', color: isActive ? opt.color : crmV2.textMuted,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {rdv.telepro_suivi && rdv.telepro_suivi_at && (
                  <p style={{ fontSize: 11, color: crmV2.textMuted, margin: '6px 0 0' }}>
                    Mis à jour le {new Date(rdv.telepro_suivi_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const noOwnerNotice = (
    <div style={{ padding: isMobile ? 12 : '20px 28px' }}>
      <Notice tone="warning">Ce compte n&apos;a pas d&apos;ID propriétaire configuré.</Notice>
    </div>
  )

  // Contenu de l'onglet actif (identique mobile / ordinateur, en-têtes mobiles en plus)
  function tabContent(): ReactNode {
    switch (activeTab) {
      case 'planning':
        return (
          <div style={{ ...fullHeight, minHeight: isMobile ? 0 : 560 }}>
            <WeekCalendar closerId={user.id} closerColor={user.avatar_color} closerName={user.name} teamView allowAssign />
          </div>
        )
      case 'rdv':
        return newRdvContent
      case 'dispos':
        return disposContent
      case 'historique':
        return historiqueContent
      case 'contacts':
        // Mes contacts (propriétaire du contact)
        return (
          <>
            {isMobile && <TpMobileHeader title="Mes contacts" />}
            {isMobile && skin(<CRMGlobalSearchBar />, { flexShrink: 0 })}
            {!user.hubspot_owner_id ? noOwnerNotice : skin(
              <UserCRMView
                ownerParam="contact_owner_hs_id"
                ownerId={user.hubspot_owner_id}
                mode="closer"
                assignedScopeOnly
                onTotalChange={setContactsTotal}
              />,
              { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
            )}
          </>
        )
      case 'leads':
        // Mes transactions — kanban filtré par contact_owner_hs_id
        return (
          <>
            {isMobile && <TpMobileHeader title="Mes transactions" />}
            {!user.hubspot_owner_id ? noOwnerNotice : (
              <div style={{ ...fullHeight, minHeight: isMobile ? 0 : 600 }}>
                <iframe
                  src={`/closer/${encodeURIComponent(user.slug)}/transactions?contact_owner=${encodeURIComponent(user.hubspot_owner_id)}&embed=1`}
                  style={{ width: '100%', flex: 1, minHeight: isMobile ? 480 : 600, border: 'none', display: 'block' }}
                  title="Kanban Mes Transactions"
                />
              </div>
            )}
          </>
        )
      case 'repop':
        return (
          <>
            {isMobile && <TpMobileHeader title="Repop" />}
            {skin(
              <RepopJournal
                hubspotOwnerId={user.hubspot_owner_id}
                scope="closer"
                scopeId={user.id}
              />,
            )}
          </>
        )
      default:
        return null
    }
  }

  const overlays = (
    <>
      {showGuide && <PlatformGuide role="closer" onClose={() => setShowGuide(false)} />}
      {showResources && <ResourcesPanel role="closer" onClose={() => setShowResources(false)} />}

      {/* Fiche RDV de l'historique */}
      {selectedHistRdv && (
        <AppointmentModal
          appointment={{
            ...selectedHistRdv,
            status: selectedHistRdv.status as AppointmentStatus,
            users: selectedHistRdv.users || undefined,
            extra_participants: parseExtraParticipants(selectedHistRdv.extra_participants),
          }}
          onClose={() => setSelectedHistRdv(null)}
          onUpdate={(updated) => {
            setHistRdvs(prev => prev.map(r => r.id === selectedHistRdv.id ? { ...r, ...updated } : r))
          }}
        />
      )}
    </>
  )

  const logo = (size: number) => (
    <span style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#241F3F', boxShadow: '0 0 0 2px rgba(94,188,227,0.35)', display: 'inline-block' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-hub-diploma-mark.png" alt="Hub Diploma" width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </span>
  )

  // ─── Mobile : en-têtes blancs + barre d'onglets navy en bas ────────────
  if (isMobile) {
    const mobileTab: CloserMobileTab = plusOpen ? 'plus'
      : activeTab === 'planning' ? 'planning'
      : activeTab === 'contacts' ? 'contacts'
      : activeTab === 'rdv' ? 'rdv'
      : activeTab === 'dispos' ? 'dispos'
      : 'plus'
    const plusItems: TpMenuItem[] = [
      { key: 'leads', label: 'Mes transactions', icon: <Briefcase size={18} />, onClick: () => goTab('leads'), active: activeTab === 'leads' },
      { key: 'repop', label: 'Repop', icon: <Repeat2 size={18} />, onClick: () => goTab('repop'), active: activeTab === 'repop' },
      { key: 'support', label: 'Service technique', icon: <LifeBuoy size={18} />, href: '/support', badge: supportUnread },
      { key: 'logout', label: 'Déconnexion', icon: <LogOut size={18} />, onClick: () => { void logout() }, danger: true },
    ]
    return (
      <div className="crm-v2" style={{
        height: '100dvh', display: 'flex', flexDirection: 'column', background: crmV2.bgSoft, color: crmV2.text,
        fontFamily: crmV2.font, overflow: 'hidden',
      }}>
        <main style={{ flex: 1, minHeight: 0, overflowY: activeTab === 'planning' ? 'hidden' : 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'planning' && (
            <div style={{
              background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, padding: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {logo(38)}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Bonjour {firstName}</div>
                  <div style={{ fontSize: 12, color: crmV2.textMuted }}>Mon espace closer</div>
                </div>
              </div>
              <SupportPill unread={supportUnread} compact />
            </div>
          )}
          {tabContent()}
        </main>
        <CloserTabBar
          active={mobileTab}
          onPlanning={() => goTab('planning')}
          onContacts={() => goTab('contacts')}
          onNew={goNewRdv}
          onDispos={() => goTab('dispos')}
          onPlus={() => setPlusOpen(true)}
        />
        <TpPlusSheet open={plusOpen} onClose={() => setPlusOpen(false)} title="Hub Diploma · Closer" items={plusItems} />
        {overlays}
      </div>
    )
  }

  // ─── Ordinateur : en-tête blanc + onglets soulignés ────────────────────
  const tabs = [
    { id: 'planning', label: 'Mon planning' },
    { id: 'rdv', label: 'Nouveau RDV' },
    { id: 'contacts', label: 'Mes contacts', count: contactsTotal > 0 ? contactsTotal : undefined },
    { id: 'leads', label: 'Mes transactions' },
    { id: 'repop', label: 'Repop' },
    { id: 'dispos', label: 'Mes dispos' },
  ]

  return (
    <div className="crm-v2" style={{
      height: '100vh', display: 'flex', flexDirection: 'column', background: crmV2.bgSoft, color: crmV2.text, fontFamily: crmV2.font,
    }}>
      <CrmV2Header
        title={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {logo(36)}
            Bonjour {firstName}
          </span>
        )}
        subtitle={`${user.name} · Mon espace closer`}
        actions={(
          <>
            <CrmV2Button variant="accent" icon={<Plus size={14} />} onClick={goNewRdv}>Nouveau RDV</CrmV2Button>
            <SupportPill unread={supportUnread} />
            <CrmV2Button variant="danger" icon={<LogOut size={14} />} onClick={() => { void logout() }}>Déconnexion</CrmV2Button>
          </>
        )}
      >
        <CrmV2Tabs bordered={false} items={tabs} value={activeTab === 'historique' ? '' : activeTab} onChange={id => setActiveTab(id as CloserTab)} />
      </CrmV2Header>

      {/* Recherche globale CRM — permet de retrouver et ouvrir n'importe quelle
          fiche (contact / transaction), même non attribuée au closer. */}
      {skin(<CRMGlobalSearchBar />, { flexShrink: 0 })}

      <main style={{ flex: 1, minHeight: 0, overflowY: activeTab === 'planning' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
        {tabContent()}
      </main>

      {overlays}
    </div>
  )
}
