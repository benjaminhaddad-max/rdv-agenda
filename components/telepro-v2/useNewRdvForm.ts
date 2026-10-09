'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, startOfMonth, startOfToday } from 'date-fns'
import { fetchRecentContacts, saveRecentContact, clearRecentContactsRemote } from '@/lib/recent-contacts'
import { validateEmailDomain } from '@/lib/email-validation'
import {
  CAMPUS_OPTIONS, FORMATIONS, generateJitsiLink,
  type HubSpotContact, type Slot, type TeleproUser,
} from './types'

/**
 * État et logique de la prise de RDV télépro (recherche / création de contact,
 * créneaux, champs prospect, envoi). Repris tel quel de TeleproClient ; seul
 * l'affichage a été découpé en étapes (NewRdvFlow).
 */
export function useNewRdvForm({ teleproUser, isLinovaBrandUser }: { teleproUser: TeleproUser; isLinovaBrandUser: boolean }) {
  const today = startOfToday()
  // Date maximale de prise de RDV : 31 août (de la saison en cours).
  // Robuste si on est déjà après août → bascule sur l'année suivante.
  const maxBookingDate = useMemo(() => {
    const y = today.getMonth() > 7 ? today.getFullYear() + 1 : today.getFullYear()
    return new Date(y, 7, 31)
  }, [today])

  // ── Recherche contact dans le CRM ──────────────────────────────────────
  const [lookupInput, setLookupInput] = useState('')
  const [lookupMode, setLookupMode] = useState<'search' | 'new'>('search')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [contact, setContact] = useState<HubSpotContact | null>(null)
  const [showLinovaModal, setShowLinovaModal] = useState(false)
  // Résultats de recherche dans le CRM (Supabase)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([])

  // ── Historique de recherche (par télépro) ─────────────────────────────
  // Mémorise les derniers contacts ouverts pour y revenir d'un clic, sans
  // relancer une recherche globale. Synchronisé en base (suit le compte sur
  // tous les appareils) ; localStorage sert de cache instantané + repli.
  const RECENT_LOOKUP_MAX = 5
  const recentLookupContext = 'telepro-lookup'
  const recentLookupKey = `telepro-recent-contacts-${teleproUser.id || 'anon'}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recentLookups, setRecentLookups] = useState<any[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function cacheRecentLookups(list: any[]) {
    try { localStorage.setItem(recentLookupKey, JSON.stringify(list)) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(recentLookupKey)
      if (saved) setRecentLookups(JSON.parse(saved))
    } catch {
      // ignore
    }
    let cancelled = false
    fetchRecentContacts(recentLookupContext).then(remote => {
      if (cancelled || remote === null) return
      setRecentLookups(remote)
      cacheRecentLookups(remote)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentLookupKey])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function recordRecentLookup(c: any) {
    const entry = {
      hubspot_contact_id: c.hubspot_contact_id,
      firstname: c.firstname ?? null,
      lastname: c.lastname ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      departement: c.departement ?? null,
      classe_actuelle: c.classe_actuelle ?? null,
      formation_demandee: c.formation_demandee ?? null,
      telepro: c.telepro ?? null,
    }
    setRecentLookups(prev => {
      const next = [entry, ...prev.filter(p => p.hubspot_contact_id !== entry.hubspot_contact_id)].slice(0, RECENT_LOOKUP_MAX)
      cacheRecentLookups(next)
      return next
    })
    void saveRecentContact(recentLookupContext, entry)
  }

  function clearRecentLookups() {
    setRecentLookups([])
    cacheRecentLookups([])
    void clearRecentContactsRemote(recentLookupContext)
  }

  // ── Nouveau contact ──────────────────────────────────────────────────
  const [newFirstname, setNewFirstname] = useState('')
  const [newLastname, setNewLastname] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newFormation, setNewFormation] = useState('')
  const [newClasse, setNewClasse] = useState('')
  const [newDepartement, setNewDepartement] = useState('')
  const [creating, setCreating] = useState(false)
  // Validation live de l'email du nouveau contact
  const [newEmailFormatError, setNewEmailFormatError] = useState<string | null>(null)
  const [newEmailChecking, setNewEmailChecking] = useState(false)
  const [newEmailExisting, setNewEmailExisting] = useState<{
    id: string; firstname: string; lastname: string; email: string;
  } | null>(null)

  useEffect(() => {
    const email = newEmail.trim()
    setNewEmailExisting(null)
    if (!email) { setNewEmailFormatError(null); setNewEmailChecking(false); return }
    const err = validateEmailDomain(email)
    if (err) { setNewEmailFormatError(err); setNewEmailChecking(false); return }
    setNewEmailFormatError(null); setNewEmailChecking(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/contacts/check?email=${encodeURIComponent(email)}`, { signal: ctrl.signal })
        const data = await res.json()
        if (data.exists && data.contact) setNewEmailExisting(data.contact)
        else setNewEmailExisting(null)
      } catch { /* ignore */ }
      finally { setNewEmailChecking(false) }
    }, 400)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [newEmail])

  // ── Télépro actuellement assigné au contact (read-only display) ───────
  // Affiché en grisé sur le form UNIQUEMENT si différent du télépro courant.
  // Sert aussi à signaler un doublon télépro à arbitrer par Pascal.
  const [existingTeleproId, setExistingTeleproId] = useState<string | null>(null)
  const [existingTeleproName, setExistingTeleproName] = useState<string | null>(null)

  // ── Champs prospect ───────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [emailSynced, setEmailSynced] = useState(false)
  const emailOriginalRef = useRef('')
  const [emailParent, setEmailParent] = useState('')
  const [phone, setPhone] = useState('')
  const [departement, setDepartement] = useState('')
  const [classeActuelle, setClasseActuelle] = useState('')
  const [formation, setFormation] = useState('')
  const [meetingType, setMeetingType] = useState<'visio' | 'presentiel'>('visio')
  const [meetingLink, setMeetingLink] = useState(() => generateJitsiLink())
  const [meetingCampus, setMeetingCampus] = useState(CAMPUS_OPTIONS[0])
  const [linkCopied, setLinkCopied] = useState(false)
  const [notes, setNotes] = useState('')

  // ── Date / Heure ──────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  // Mois actuellement affiché dans le calendrier de prise de RDV.
  const [calMonth, setCalMonth] = useState<Date>(startOfMonth(startOfToday()))

  // ── Submit ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Slots ─────────────────────────────────────────────────────────────
  async function loadPoolSlots(date: Date) {
    setSlotsLoading(true)
    setSlots([])
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/availability/pool?date=${dateStr}`)
      if (res.ok) setSlots(await res.json())
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setSelectedSlot(null)
    loadPoolSlots(date)
  }

  // ── Recherche dans le CRM (Supabase) ──────────────────────────────────
  async function searchContact() {
    if (!lookupInput.trim()) return
    setLookupLoading(true); setLookupError(null); setSearchResults([])
    try {
      // global_search=1 : un telepro doit pouvoir retrouver N'IMPORTE QUEL
      // contact de la base CRM (pas seulement ses propres leads assignés), car
      // il prend parfois des RDV pour des contacts d'autres télépros.
      // all_classes=1 + show_external=1 pour ne PAS filtrer le lookup sur les
      // classes prioritaires / l'equipe externe.
      const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(lookupInput.trim())}&limit=10&all_classes=1&show_external=1&global_search=1`)
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error || 'Erreur'); return }
      const results = data.data ?? []
      if (results.length === 0) { setLookupError('Aucun contact trouvé dans le CRM.'); return }
      setSearchResults(results)
    } catch { setLookupError('Erreur réseau') }
    finally { setLookupLoading(false) }
  }

  // Sélectionne un contact dans la liste des résultats CRM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickSearchResult(c: any) {
    // Convertit la ligne CRM en shape HubSpotContact pour le reste du code
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
    recordRecentLookup(c)
    const ev = c.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
    if (c.phone) setPhone(c.phone)
    if (c.departement) setDepartement(String(c.departement))
    if (c.classe_actuelle) setClasseActuelle(c.classe_actuelle)
    if (c.formation_demandee) setFormation(c.formation_demandee)
    // Récupère le télépro déjà assigné au contact.
    // L'API joint déjà l'objet rdv_users sous c.telepro ({ id, name, ... }).
    // c.telepro_user_id est en réalité le hubspot_user_id (number) — pas l'UUID Supabase.
    // On utilise donc c.telepro.id (UUID) pour comparer avec teleproUser.id.
    if (c.telepro?.id) {
      setExistingTeleproId(c.telepro.id)
      setExistingTeleproName(c.telepro.name || null)
    } else {
      setExistingTeleproId(null)
      setExistingTeleproName(null)
    }
  }

  // Charge le contact existant (email déjà connu) DANS le flow télépro
  async function loadExistingEmailContact() {
    if (!newEmailExisting) return
    try {
      const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(newEmailExisting.email)}&limit=1&all_classes=1&show_external=1&global_search=1`)
      const data = await res.json()
      const found = (data?.data ?? [])[0]
      if (found) {
        pickSearchResult(found)
        setLookupMode('search')
        setNewFirstname(''); setNewLastname(''); setNewEmail(''); setNewPhone('')
        setNewDepartement(''); setNewClasse(''); setNewFormation('')
        setNewEmailExisting(null); setNewEmailFormatError(null)
      } else {
        setLookupError('Contact introuvable.')
      }
    } catch {
      setLookupError('Erreur lors du chargement du contact.')
    }
  }

  // ── Créer nouveau contact (100 % Supabase) ────────────────────────────
  async function createNewContact() {
    if (
      !newFirstname.trim() || !newLastname.trim() || !newEmail.trim() ||
      !newPhone.trim() || !newClasse.trim()
    ) return
    if (newEmailFormatError || newEmailExisting) return
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
    setExistingTeleproId(null); setExistingTeleproName(null)
    setEmail(''); emailOriginalRef.current = ''; setEmailSynced(false)
    setPhone(''); setDepartement(''); setClasseActuelle(''); setFormation('')
    setMeetingType('visio'); setMeetingLink(generateJitsiLink()); setMeetingCampus(CAMPUS_OPTIONS[0]); setLinkCopied(false)
    setNotes(''); setSelectedDate(null); setSelectedSlot(null); setError(null)
    setNewFirstname(''); setNewLastname(''); setNewEmail(''); setNewPhone('')
    setNewFormation(''); setNewClasse(''); setNewDepartement('')
  }

  async function syncEmail() {
    if (!contact || !email.trim() || email.trim() === emailOriginalRef.current) return
    setEmailSynced(false)
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) { emailOriginalRef.current = email.trim(); setEmailSynced(true); setTimeout(() => setEmailSynced(false), 2000) }
    } catch { /* silencieux */ }
  }

  /** Pré-remplit le formulaire depuis un contact CRM (« Reprendre RDV »). */
  async function prefillFromContactId(contactId: string) {
    const res = await fetch(`/api/crm/contacts/${contactId}/details?phase=core`)
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
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const contactName = contact ? [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') : ''
  const contactEmail = email || contact?.properties.email || ''
  // Obligatoires : téléphone, email, classe, formation (+ contact et créneau).
  // Le reste (département, email parent, notes…) est facultatif.
  const missingFields = [
    !contact && 'contact',
    !selectedSlot && 'créneau',
    !phone.trim() && 'téléphone',
    !contactEmail.trim() && 'email',
    !classeActuelle && 'classe',
    !formation && 'formation',
    meetingType === 'presentiel' && !meetingCampus && 'campus',
  ].filter(Boolean) as string[]
  const canSubmit = missingFields.length === 0

  async function submit() {
    if (isLinovaBrandUser) {
      setError('Prise de RDV classique desactivee pour la marque LINOVA. Utilise le flux Linova depuis le CRM.')
      return
    }
    if (!canSubmit) { setError(`Il manque : ${missingFields.join(', ')}`); return }
    setSubmitting(true); setError(null)
    const formationLabel = FORMATIONS.find(f => f.value === formation)?.label || formation
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: contactName || contactEmail,
          prospect_email: contactEmail, prospect_phone: phone,
          email_parent: emailParent.trim() || null,
          start_at: selectedSlot!.start, end_at: selectedSlot!.end,
          source: 'telepro', formation_type: formationLabel, formation_hs_value: formation,
          hubspot_contact_id: contact!.id, departement: departement || null, classe_actuelle: classeActuelle,
          meeting_type: meetingType,
          meeting_link: meetingType === 'visio' ? meetingLink || null : (meetingType === 'presentiel' ? meetingCampus : null),
          telepro_id: teleproUser.id,
          call_notes: [
            `📚 Formation demandée : ${formationLabel}`,
            departement ? `📍 Département : ${departement}` : '',
            `🎓 Classe actuelle : ${classeActuelle}`,
            phone ? `📞 Téléphone : ${phone}` : '',
            meetingType === 'presentiel' ? `🏫 Campus : ${meetingCampus}` : '',
            notes.trim() ? `\n📝 Notes d'appel :\n${notes.trim()}` : '',
          ].filter(Boolean).join('\n'),
          booking_note: notes.trim() || null,
        }),
      })
      if (res.ok) {
        // Le serveur génère le vrai lien (Google Meet) et le renvoie : on
        // affiche celui-ci, pas le lien temporaire généré côté client.
        const created = await res.json().catch(() => null)
        if (created?.meeting_link) setMeetingLink(created.meeting_link)
        setSuccess(true)
      }
      else { const data = await res.json(); setError(data.error || 'Erreur') }
    } finally { setSubmitting(false) }
  }

  function reset() { setSuccess(false); resetContact() }

  function copyMeetingLink() {
    navigator.clipboard.writeText(meetingLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  function chooseMeetingType(t: 'visio' | 'presentiel') {
    setMeetingType(t)
    if (t === 'visio' && !meetingLink) setMeetingLink(generateJitsiLink())
    if (t === 'presentiel' && !meetingCampus) setMeetingCampus(CAMPUS_OPTIONS[0])
    setLinkCopied(false)
  }

  return {
    today, maxBookingDate,
    // recherche
    lookupInput, setLookupInput, lookupMode, setLookupMode, lookupLoading, lookupError, setLookupError,
    contact, searchResults, setSearchResults, recentLookups, clearRecentLookups,
    searchContact, pickSearchResult, loadExistingEmailContact,
    showLinovaModal, setShowLinovaModal,
    // nouveau contact
    newFirstname, setNewFirstname, newLastname, setNewLastname, newEmail, setNewEmail, newPhone, setNewPhone,
    newFormation, setNewFormation, newClasse, setNewClasse, newDepartement, setNewDepartement,
    creating, newEmailFormatError, newEmailChecking, newEmailExisting, createNewContact,
    existingTeleproId, existingTeleproName,
    // champs prospect
    email, setEmail, emailSynced, syncEmail, emailParent, setEmailParent, phone, setPhone,
    departement, setDepartement, classeActuelle, setClasseActuelle, formation, setFormation,
    meetingType, chooseMeetingType, meetingLink, setMeetingLink, meetingCampus, setMeetingCampus,
    linkCopied, copyMeetingLink, notes, setNotes,
    // créneau
    selectedDate, selectedSlot, setSelectedSlot, slots, slotsLoading, calMonth, setCalMonth, handleSelectDate,
    // envoi
    contactName, contactEmail, canSubmit: !!canSubmit, missingFields, submitting, success, error, setError, submit, reset,
    resetContact, prefillFromContactId,
  }
}

export type NewRdvForm = ReturnType<typeof useNewRdvForm>
