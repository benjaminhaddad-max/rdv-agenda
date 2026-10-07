'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { format, startOfToday } from 'date-fns'
import {
  X, Search, CheckCircle, Plus, Video, PhoneCall, MapPin, Link2, Phone, UserPlus, Check, ChevronLeft,
  CalendarPlus, Clock, Headset, Loader2, User,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import {
  ChoiceButton, CloserSheet, FieldLabel, Notice, SheetHeader, StepBar, closerInput,
} from '@/components/crm-v2/closer/ui'

// ─── Types ──────────────────────────────────────────────────────────────────

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
    teleprospecteur?: string // HubSpot user ID of télépro
  }
}

interface Telepro {
  id: string
  name: string
  hubspot_user_id?: string
}

interface CloserNewRdvModalProps {
  closerId: string
  closerName: string
  onClose: () => void
  onSuccess: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FORMATIONS = [
  { label: 'Terminale → PASS',  value: 'Terminale → PASS',  hs: 'PAS'  },
  { label: 'Terminale → LAS',   value: 'Terminale → LAS',   hs: 'LAS'  },
  { label: 'Terminale Santé',   value: 'Terminale Santé',   hs: 'PAS'  },
  { label: 'Première Élite',    value: 'Première Élite',    hs: 'PAS'  },
  { label: 'PASS (en cours)',   value: 'PASS',              hs: 'P-1'  },
  { label: 'LAS (en cours)',    value: 'LAS',               hs: 'LAS'  },
  { label: 'P2 (en cours)',     value: 'P2',                hs: 'P-2'  },
  { label: 'LSPS',             value: 'LSPS',              hs: 'LSPS' },
  { label: 'PAES FR/EU',       value: 'PAES FR/EU',        hs: 'PAES' },
  { label: 'Autre',            value: 'Autre',             hs: ''     },
]

const HOURS: string[] = []
for (let h = 8; h <= 22; h++) {
  HOURS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) HOURS.push(`${String(h).padStart(2, '0')}:30`)
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function CloserNewRdvModal({
  closerId,
  closerName,
  onClose,
  onSuccess,
}: CloserNewRdvModalProps) {
  // ── CRM lookup ──────────────────────────────────────────────────────────
  const [hsMode, setHsMode]       = useState<'url' | 'phone' | 'new'>('url')
  const [hsUrl, setHsUrl]         = useState('')
  const [hsPhone, setHsPhone]     = useState('')
  const [hsContact, setHsContact] = useState<HubSpotContact | null>(null)
  const [hsLoading, setHsLoading] = useState(false)
  const [hsError, setHsError]     = useState<string | null>(null)
  const [step, setStep]           = useState<'lookup' | 'form'>('lookup')

  // ── Form fields ─────────────────────────────────────────────────────────
  const [name,          setName]          = useState('')
  const [email,         setEmail]         = useState('')
  const [phone,         setPhone]         = useState('')
  const [emailParent,   setEmailParent]   = useState('')
  const [formation,     setFormation]     = useState('')
  const [department,    setDepartment]    = useState('')
  const [selectedDate,  setSelectedDate]  = useState('')
  const [selectedHour,  setSelectedHour]  = useState('')
  const [meetingType,   setMeetingType]   = useState<'visio' | 'telephone' | 'presentiel'>('visio')
  const [meetingLink,   setMeetingLink]   = useState(() => generateJitsiLink())

  // ── Télépro ─────────────────────────────────────────────────────────────
  const [hasTelePro,       setHasTelePro]       = useState<boolean | null>(null)
  const [telepros,         setTelepros]         = useState<Telepro[]>([])
  const [selectedTelepro,  setSelectedTelepro]  = useState('')

  // ── Submit ──────────────────────────────────────────────────────────────
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  // ── Load télépros ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/users?role=telepro')
      .then(r => r.json())
      .then((data: Telepro[]) => setTelepros(data))
      .catch(() => {})
  }, [])

  // ── Auto-gen visio link when switching to visio ──────────────────────────
  useEffect(() => {
    if (meetingType === 'visio' && !meetingLink) {
      setMeetingLink(generateJitsiLink())
    }
  }, [meetingType, meetingLink])

  // ── Fill form from CRM contact ───────────────────────────────────────────
  function fillFromContact(contact: HubSpotContact) {
    const p = contact.properties
    setName([p.firstname, p.lastname].filter(Boolean).join(' '))
    setEmail(p.email || '')
    setPhone(p.phone || '')
    setDepartment(p.departement || '')

    // Try to map HubSpot teleprospecteur → our DB telepro
    if (p.teleprospecteur) {
      const match = telepros.find(t => t.hubspot_user_id === p.teleprospecteur)
      if (match) {
        setHasTelePro(true)
        setSelectedTelepro(match.id)
      }
    }
  }

  function extractContactId(input: string): string | null {
    const trimmed = input.trim()
    if (/^\d+$/.test(trimmed)) return trimmed
    const recordMatch = trimmed.match(/\/record\/0-1\/(\d+)/)
    if (recordMatch) return recordMatch[1]
    const contactMatch = trimmed.match(/\/contact\/(\d+)/)
    if (contactMatch) return contactMatch[1]
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapCrmContact(c: any): HubSpotContact {
    return {
      id: c.hubspot_contact_id,
      properties: {
        email: c.email ?? '',
        firstname: c.firstname ?? '',
        lastname: c.lastname ?? '',
        phone: c.phone ?? '',
        departement: c.departement != null ? String(c.departement) : '',
        classe_actuelle: c.classe_actuelle ?? '',
        diploma_sante___formation_demandee: c.formation_demandee ?? '',
        teleprospecteur: c.telepro_user_id ?? undefined,
      },
    }
  }

  // ── CRM lookups ──────────────────────────────────────────────────────────
  async function lookupByUrl() {
    if (!hsUrl.trim()) return
    setHsLoading(true)
    setHsError(null)
    try {
      const id = extractContactId(hsUrl)
      if (!id) throw new Error('ID contact introuvable dans le lien.')
      const res = await fetch(`/api/crm/contacts/${id}/details?phase=core`)
      const data = await res.json()
      if (!res.ok || !data.contact) throw new Error('Contact introuvable')
      const mapped = mapCrmContact(data.contact)
      setHsContact(mapped)
      fillFromContact(mapped)
      setStep('form')
    } catch (e) {
      setHsError(e instanceof Error ? e.message : 'Erreur de recherche')
    } finally {
      setHsLoading(false)
    }
  }

  async function lookupByPhone() {
    if (!hsPhone.trim()) return
    setHsLoading(true)
    setHsError(null)
    try {
      const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(hsPhone.trim())}&limit=1&all_classes=1&show_external=1`)
      const data = await res.json()
      const row = data?.data?.[0]
      if (!res.ok || !row) throw new Error('Contact introuvable')
      const mapped = mapCrmContact(row)
      setHsContact(mapped)
      fillFromContact(mapped)
      setStep('form')
    } catch (e) {
      setHsError(e instanceof Error ? e.message : 'Erreur de recherche')
    } finally {
      setHsLoading(false)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !selectedDate || !selectedHour) {
      setSubmitError('Veuillez remplir tous les champs obligatoires (*)')
      return
    }
    if (hasTelePro === null) {
      setSubmitError('Répondez à la question sur le télépro')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const [yr, mo, dy] = selectedDate.split('-').map(Number)
      const [hh, mm]     = selectedHour.split(':').map(Number)
      const startAt = new Date(yr, mo - 1, dy, hh, mm || 0)
      const endAt   = new Date(startAt.getTime() + 60 * 60 * 1000) // +1h

      const formEntry = FORMATIONS.find(f => f.value === formation)

      const body = {
        commercial_id:      closerId,
        prospect_name:      name.trim(),
        prospect_email:     email.trim(),
        prospect_phone:     phone.trim() || null,
        email_parent:       emailParent.trim() || null,
        start_at:           startAt.toISOString(),
        end_at:             endAt.toISOString(),
        source:             'admin',
        formation_type:     formation || null,
        formation_hs_value: formEntry?.hs || null,
        departement:        department || null,
        meeting_type:       meetingType,
        meeting_link:       meetingType === 'visio' ? meetingLink : null,
        hubspot_contact_id: hsContact?.id || null,
        telepro_id:         (hasTelePro && selectedTelepro) ? selectedTelepro : null,
      }

      const res = await fetch('/api/appointments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la création du RDV')
      }

      onSuccess()
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  const minDate = format(startOfToday(), 'yyyy-MM-dd')
  const isMobile = useIsMobile()
  const inp = closerInput(isMobile)
  const missing = !name.trim() || !email.trim() || !selectedDate || !selectedHour || hasTelePro === null

  const card = (title: ReactNode, icon: ReactNode, children: ReactNode) => (
    <section style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: crmV2.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>
        <span style={{ display: 'inline-flex', color: crmV2.gold }}>{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <CloserSheet
      onClose={onClose}
      header={(
        <SheetHeader
          kicker="Nouveau RDV"
          icon={<CalendarPlus size={12} />}
          title="Nouveau RDV"
          subtitle={<>Assigné à <strong style={{ color: crmV2.goldDark }}>{closerName}</strong></>}
          onClose={onClose}
        >
          <StepBar labels={['Contact', 'Rendez-vous']} step={step === 'lookup' ? 1 : 2} done={[step === 'form', false]} />
        </SheetHeader>
      )}
      footer={step === 'form' ? (
        <>
          <CrmV2Button onClick={() => setStep('lookup')} icon={<ChevronLeft size={14} />} style={{ minHeight: 40 }}>
            Retour
          </CrmV2Button>
          <CrmV2Button
            variant="accent"
            onClick={handleSubmit}
            disabled={submitting || missing}
            icon={submitting ? <Loader2 size={14} style={{ animation: 'crm-v2-spin 0.9s linear infinite' }} /> : <Check size={14} />}
            style={{ flex: 1, minHeight: 40 }}
          >
            {submitting ? 'Création…' : 'Créer le RDV'}
          </CrmV2Button>
        </>
      ) : undefined}
    >
      <div style={{ padding: isMobile ? 12 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ══ ÉTAPE 1 : recherche du contact CRM ═════════════════════ */}
        {step === 'lookup' && card('Trouver le contact', <Search size={13} />, (
          <>
            <div style={{ fontSize: 13, color: crmV2.textMuted }}>
              Rechercher le contact du prospect dans le CRM (ou créer manuellement)
            </div>

            {/* Choix du mode de recherche */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {([
                { key: 'url',   label: 'ID / lien',       icon: <Link2 size={14} /> },
                { key: 'phone', label: 'Téléphone',       icon: <Phone size={14} /> },
                { key: 'new',   label: 'Nouveau contact', icon: <UserPlus size={14} /> },
              ] as const).map(m => (
                <ChoiceButton
                  key={m.key}
                  active={hsMode === m.key}
                  onClick={() => { setHsMode(m.key); setHsError(null) }}
                  style={{ padding: '0 8px', fontSize: 12, minWidth: 0 }}
                >
                  {m.icon}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                </ChoiceButton>
              ))}
            </div>

            {/* Recherche par ID / lien */}
            {hsMode === 'url' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={hsUrl}
                  onChange={e => setHsUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookupByUrl()}
                  placeholder="ID contact ou ancien lien de fiche"
                  style={inp}
                />
                <CrmV2Button
                  variant="primary"
                  onClick={lookupByUrl}
                  disabled={hsLoading || !hsUrl.trim()}
                  icon={<Search size={14} />}
                  style={{ minHeight: 40 }}
                >
                  {hsLoading ? 'Recherche…' : 'Rechercher'}
                </CrmV2Button>
              </div>
            )}

            {/* Recherche par téléphone */}
            {hsMode === 'phone' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={hsPhone}
                  onChange={e => setHsPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookupByPhone()}
                  placeholder="0601020304"
                  inputMode="tel"
                  style={inp}
                />
                <CrmV2Button
                  variant="primary"
                  onClick={lookupByPhone}
                  disabled={hsLoading || !hsPhone.trim()}
                  icon={<Search size={14} />}
                  style={{ minHeight: 40 }}
                >
                  {hsLoading ? 'Recherche…' : 'Rechercher'}
                </CrmV2Button>
              </div>
            )}

            {/* Nouveau contact */}
            {hsMode === 'new' && (
              <CrmV2Button
                onClick={() => { setHsContact(null); setStep('form') }}
                icon={<Plus size={14} />}
                style={{ minHeight: 40 }}
              >
                Saisir manuellement
              </CrmV2Button>
            )}

            {hsError && <Notice>{hsError}</Notice>}
          </>
        ))}

        {/* ══ ÉTAPE 2 : formulaire ════════════════════════════════════ */}
        {step === 'form' && (
          <>
            {/* Contact CRM lié */}
            {hsContact && (
              <div style={{
                background: crmV2.bg, border: '1px solid rgba(0,189,165,0.45)', borderRadius: crmV2.radiusLg,
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <CheckCircle size={16} style={{ color: crmV2.success, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>
                    Contact CRM lié
                  </div>
                  <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[hsContact.properties.firstname, hsContact.properties.lastname].filter(Boolean).join(' ')}
                    {' '}— ID {hsContact.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setHsContact(null); setStep('lookup') }}
                  title="Retirer le contact"
                  aria-label="Retirer le contact"
                  style={{
                    width: 32, height: 32, borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
                    color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Prospect */}
            {card('Prospect', <User size={13} />, (
              <div style={grid2}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel>Nom complet *</FieldLabel>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom Nom" style={inp} />
                </div>
                <div>
                  <FieldLabel>Email *</FieldLabel>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@exemple.com" style={inp} />
                </div>
                <div>
                  <FieldLabel>Téléphone</FieldLabel>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 01 02 03 04" inputMode="tel" style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel>Email parent (facultatif)</FieldLabel>
                  <input value={emailParent} onChange={e => setEmailParent(e.target.value)} type="email" placeholder="parent@exemple.com" style={inp} />
                </div>
                <div>
                  <FieldLabel>Formation</FieldLabel>
                  <select value={formation} onChange={e => setFormation(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">— Sélectionner —</option>
                    {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Département</FieldLabel>
                  <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="ex: 75" style={inp} />
                </div>
              </div>
            ))}

            {/* Date / heure + mode */}
            {card('Créneau et mode', <Clock size={13} />, (
              <>
                <div style={grid2}>
                  <div>
                    <FieldLabel>Date *</FieldLabel>
                    <input type="date" value={selectedDate} min={minDate} onChange={e => setSelectedDate(e.target.value)} style={{ ...inp, cursor: 'pointer' }} />
                  </div>
                  <div>
                    <FieldLabel>Heure de début *</FieldLabel>
                    <select value={selectedHour} onChange={e => setSelectedHour(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">— Heure —</option>
                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <FieldLabel>Type de RDV</FieldLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                    {([
                      { key: 'visio',      icon: <Video size={14} />,     label: 'Visio'      },
                      { key: 'telephone',  icon: <PhoneCall size={14} />, label: 'Téléphone'  },
                      { key: 'presentiel', icon: <MapPin size={14} />,    label: 'Présentiel' },
                    ] as const).map(m => (
                      <ChoiceButton key={m.key} active={meetingType === m.key} onClick={() => setMeetingType(m.key)} style={{ padding: '0 8px', fontSize: 12 }}>
                        {m.icon} {m.label}
                      </ChoiceButton>
                    ))}
                  </div>
                  {meetingType === 'visio' && (
                    <input
                      value={meetingLink}
                      onChange={e => setMeetingLink(e.target.value)}
                      placeholder="Lien visio…"
                      style={{ ...inp, marginTop: 8, fontSize: 12 }}
                    />
                  )}
                </div>
              </>
            ))}

            {/* Question télépro */}
            {card('Télépro', <Headset size={13} />, (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: crmV2.text }}>
                  Y a-t-il un télépro sur ce dossier ?
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <ChoiceButton active={hasTelePro === true} tone="#16a34a" onClick={() => setHasTelePro(true)}>
                    <Check size={14} /> Oui
                  </ChoiceButton>
                  <ChoiceButton active={hasTelePro === false} tone="#d13a41" onClick={() => { setHasTelePro(false); setSelectedTelepro('') }}>
                    <X size={14} /> Non
                  </ChoiceButton>
                </div>

                {hasTelePro === true && (
                  <div>
                    <FieldLabel>Sélectionner le télépro</FieldLabel>
                    <select value={selectedTelepro} onChange={e => setSelectedTelepro(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">— Sélectionner —</option>
                      {telepros.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {selectedTelepro && (
                      <div style={{ marginTop: 6, fontSize: 12, color: crmV2.successStrong, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={12} /> {telepros.find(t => t.id === selectedTelepro)?.name} sera lié à ce RDV
                      </div>
                    )}
                  </div>
                )}

                {hasTelePro === false && (
                  <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                    RDV sans télépro — dossier traité directement
                  </div>
                )}
              </>
            ))}

            {submitError && <Notice>{submitError}</Notice>}
          </>
        )}
      </div>
    </CloserSheet>
  )
}
