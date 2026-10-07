'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  Mail,
  MessageSquare,
  Save,
  Send,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  CrmV2Button,
  CrmV2StatusPill,
  CrmV2Table,
  CrmV2Td,
  CrmV2Th,
  CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  EvCard,
  EvLabel,
  EvNotice,
  EvStat,
  EvSubBlock,
} from '@/components/crm-v2/marketing2/event-detail/EventDetailUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  DEFAULT_TIMESLOT_COPY,
  TIMESLOT_DRIP_SMS_AUJOURDHUI,
  TIMESLOT_DRIP_SMS_DEMAIN,
  TIMESLOT_SLOTS,
  TIMESLOT_SURVEY_SMS_VARIANTS,
  isSalonEtudesMedecineTimeslotEvent,
  type TimeslotCapacities,
  type TimeslotSurveyCopy,
} from '@/lib/event-timeslot-survey'

type SlotRow = {
  value: string
  label: string
  count: number
  places: number | null
  remaining: number | null
}

type CampaignState = {
  id: string
  status: string
  recipients: number
  sent_at: string | null
}

type Audience = {
  registrations: number
  ready: number
  unmatched: number
  no_phone: number
}

type SendResult = {
  sent: number
  valid: number
  failed: number
  skipped: number
  segments_used: number
}

type DripState = {
  enabled: boolean
  delayMinutes: number
  smsDemain: string
  smsAujourdhui: string
}

type Payload = {
  enabled: boolean
  public_url?: string
  copy?: TimeslotSurveyCopy
  capacities?: TimeslotCapacities
  stats?: { total: number; unique_contacts: number; by_slot: SlotRow[] }
  campaign_id?: string | null
  campaign?: CampaignState | null
  send_result?: SendResult
  drip?: (DripState & { cutoffAt?: string }) | null
  drip_sent?: number
  drip_variant?: 'demain' | 'aujourdhui'
  jour_j?: JourJState | null
  jour_j_sms_template?: string
  jour_j_email_subject?: string
  jour_j_email_body?: string
}

type JourJState = {
  smsAvecCreneau: string
  smsSansCreneau: string
  emailAvecCreneau: string
  emailSansCreneau: string
}

const DEFAULT_JOUR_J: JourJState = {
  smsAvecCreneau: 'Vous êtes attendu(e) entre {creneau_debut} et {creneau_fin}.',
  smsSansCreneau: 'Le salon est ouvert de 10h à 18h.',
  emailAvecCreneau:
    'Vous avez choisi le créneau {creneau_debut} – {creneau_fin} : vous pouvez arriver à partir de {creneau_debut}.',
  emailSansCreneau: 'Vous pouvez arriver à partir de 10h, le salon reste ouvert jusqu’à 18h.',
}

/** Rend un texte jour J comme le fera le cron, pour un exemple 14h – 16h. */
function previewJourJ(template: string, phrase: string, withSlot: boolean) {
  const filled = withSlot
    ? phrase.replaceAll('{creneau_debut}', '14h').replaceAll('{creneau_fin}', '16h').replaceAll('{creneau}', '14h – 16h')
    : phrase
  return template
    .replaceAll('{prenom}', 'Aaron')
    .replaceAll('{creneau_phrase}', filled)
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const DEFAULT_DRIP: DripState = {
  enabled: true,
  delayMinutes: 5,
  smsDemain: TIMESLOT_DRIP_SMS_DEMAIN,
  smsAujourdhui: TIMESLOT_DRIP_SMS_AUJOURDHUI,
}

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM7_EXT = '^{}\\[~]|€'

/** Un SMS sans caractere hors GSM-7 tient 160 caracteres au lieu de 70. */
function smsSegments(text: string) {
  let len = 0
  let unicode = false
  for (const ch of text) {
    if (GSM7.includes(ch)) len += 1
    else if (GSM7_EXT.includes(ch)) len += 2
    else {
      unicode = true
      break
    }
  }
  if (unicode) {
    const raw = [...text].length
    return raw <= 70 ? 1 : Math.ceil(raw / 67)
  }
  return len <= 160 ? 1 : Math.ceil(len / 153)
}

function previewSms(template: string) {
  return template
    .replaceAll('{prenom}', 'Aaron')
    .replaceAll('{lien1}', 'https://smsf.st/xxxxx')
}

const STEP_LABELS = ['Texte enregistré', 'Destinataires prêts', 'Envoi'] as const

export default function EventTimeslotSurveyCard({
  eventId,
  eventName,
  eventDate,
  inputStyle,
}: {
  eventId: string
  eventName: string
  eventDate: string
  inputStyle: CSSProperties
}) {
  const eligible = isSalonEtudesMedecineTimeslotEvent({ id: eventId, name: eventName, event_date: eventDate })
  const [data, setData] = useState<Payload | null>(null)
  const [copy, setCopy] = useState<TimeslotSurveyCopy>(DEFAULT_TIMESLOT_COPY)
  const [places, setPlaces] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [audience, setAudience] = useState<Audience | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [dirty, setDirty] = useState(false)
  const [drip, setDrip] = useState<DripState>(DEFAULT_DRIP)
  const [jourJ, setJourJ] = useState<JourJState>(DEFAULT_JOUR_J)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    const res = await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erreur')
    setData(json)
    if (json.copy) setCopy(json.copy)
    if (json.jour_j) setJourJ({ ...DEFAULT_JOUR_J, ...json.jour_j })
    if (json.drip) {
      setDrip({
        enabled: !!json.drip.enabled,
        delayMinutes: json.drip.delayMinutes ?? 5,
        smsDemain: json.drip.smsDemain || TIMESLOT_DRIP_SMS_DEMAIN,
        smsAujourdhui: json.drip.smsAujourdhui || TIMESLOT_DRIP_SMS_AUJOURDHUI,
      })
    }
    const next: Record<string, string> = {}
    for (const slot of TIMESLOT_SLOTS) {
      const n = json.capacities?.[slot.value]
      next[slot.value] = n ? String(n) : ''
    }
    setPlaces(next)
    setDirty(false)
  }, [eventId])

  useEffect(() => {
    if (!eligible) return
    load().catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [eligible, load])

  useEffect(() => {
    if (!eligible) return
    fetch(`/api/events-studio/events/${eventId}/timeslot-survey?audience=1`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setAudience(j))
      .catch(() => {})
  }, [eligible, eventId])

  const editCopy = useCallback((patch: Partial<TimeslotSurveyCopy>) => {
    setCopy((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }, [])

  const capacitiesPayload = useMemo(() => {
    const out: TimeslotCapacities = {}
    for (const slot of TIMESLOT_SLOTS) {
      const raw = places[slot.value]?.trim()
      const n = raw ? parseInt(raw, 10) : NaN
      out[slot.value] = Number.isFinite(n) && n > 0 ? n : null
    }
    return out
  }, [places])

  const rows: SlotRow[] = TIMESLOT_SLOTS.map((slot) => {
    const stat = data?.stats?.by_slot.find((s) => s.value === slot.value)
    const cap = capacitiesPayload[slot.value]
    const count = stat?.count ?? 0
    return {
      value: slot.value,
      label: slot.label,
      count,
      places: cap,
      remaining: cap == null ? null : cap - count,
    }
  })

  const hasLien = copy.sms.includes('{lien1}')
  const hasPrenom = copy.sms.includes('{prenom}')
  const rendered = previewSms(copy.sms)
  const segments = smsSegments(rendered)
  const uniqueContacts = data?.stats?.unique_contacts ?? 0
  const campaign = data?.campaign ?? null
  const alreadySent = !!campaign && campaign.status !== 'draft'
  const readyToSend = !!campaign && campaign.status === 'draft' && campaign.recipients > 0 && !dirty
  const currentStep = alreadySent ? 3 : readyToSend ? 2 : dirty || !campaign ? 0 : 1

  if (!eligible) return null

  function showToast(label: string) {
    setToast(label)
    setTimeout(() => setToast(null), 2200)
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => showToast(label))
  }

  async function save(dripOverride?: DripState) {
    const dripPayload = dripOverride ?? drip
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ copy, capacities: capacitiesPayload, drip: dripPayload, jourJ }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setData(json)
      if (json.copy) setCopy(json.copy)
      showToast('Enregistré')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function prepareCampaign() {
    if (!hasLien) {
      setError('Ajoutez {lien1} dans le SMS : c’est le lien unique de chaque contact.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'prepare_campaign', copy, capacities: capacitiesPayload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setData(json)
      if (json.copy) setCopy(json.copy)
      if (json.audience) setAudience(json.audience)
      setDirty(false)
      showToast('Destinataires prêts — aucun SMS envoyé')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function sendCampaign() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send_campaign', expected_recipients: campaign?.recipients }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setData(json)
      if (json.copy) setCopy(json.copy)
      if (json.send_result) setSendResult(json.send_result)
      setConfirmSend(false)
      showToast('Campagne envoyée')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const field = { ...inputStyle, marginTop: 0 }
  const twoCols = isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)'
  const codeStyle: CSSProperties = {
    fontSize: 11.5,
    background: crmV2.chipBg,
    border: `1px solid ${crmV2.chipBorder}`,
    borderRadius: 6,
    padding: '0 4px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minWidth: 0 }}>
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: isMobile ? 12 : 24,
            left: isMobile ? 12 : undefined,
            bottom: isMobile ? 84 : 24,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: crmV2.radiusPill,
            background: crmV2.primary,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: crmV2.shadowPanel,
          }}
        >
          <CheckCircle2 size={16} color={crmV2.success} /> {toast}
        </div>
      )}
      {error && <EvNotice tone="danger">{error}</EvNotice>}

      {/* ——— Créneaux : réponses et places ——— */}
      <EvCard
        title="Créneaux & SMS"
        icon={<CalendarClock size={16} />}
        subtitle={
          <span style={{ display: 'block', lineHeight: 1.5, maxWidth: 720 }}>
            Chaque SMS part avec un lien personnel. La personne n’a rien à ressaisir, et sa réponse est collée à sa fiche.
            Les places par créneau sont suivies ici uniquement — elles n’apparaissent pas sur la page publique.
          </span>
        }
        style={{ padding: 0, overflow: 'hidden' }}
      >
        <div style={{ borderTop: `1px solid ${crmV2.border}` }}>
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Créneau</CrmV2Th>
                <CrmV2Th>Réponses</CrmV2Th>
                <CrmV2Th>Places</CrmV2Th>
                <CrmV2Th>Restantes</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const over = row.remaining != null && row.remaining < 0
                return (
                  <CrmV2Tr key={row.value}>
                    <CrmV2Td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.label}</CrmV2Td>
                    <CrmV2Td>{row.count}</CrmV2Td>
                    <CrmV2Td>
                      <input
                        type="number"
                        min={1}
                        placeholder="—"
                        value={places[row.value] || ''}
                        onChange={(e) => {
                          setPlaces((prev) => ({ ...prev, [row.value]: e.target.value }))
                          setDirty(true)
                        }}
                        style={{ ...field, width: 88, padding: '6px 10px' }}
                      />
                    </CrmV2Td>
                    <CrmV2Td
                      style={{
                        color: over ? '#d13a41' : crmV2.text,
                        fontWeight: 600,
                      }}
                    >
                      {row.remaining == null ? '—' : row.remaining}
                    </CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: crmV2.thBg }}>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>{uniqueContacts}</td>
                <td colSpan={2} style={{ padding: '10px 14px', fontSize: 12, color: crmV2.textFaint }}>
                  Compteurs invisibles sur la page de choix
                </td>
              </tr>
            </tfoot>
          </CrmV2Table>
        </div>
      </EvCard>

      {/* ——— Texte du SMS + page publique ——— */}
      <EvCard title="SMS de choix du créneau" icon={<MessageSquare size={16} />}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(240px, 0.85fr)',
            gap: 16,
            marginBottom: 16,
          }}
          className="event-timeslot-sms-grid"
        >
          <div style={{ minWidth: 0 }}>
            <EvLabel>Texte du SMS — vous avez la main complète</EvLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {TIMESLOT_SURVEY_SMS_VARIANTS.map((v) => {
                const active = copy.sms === v.text
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => editCopy({ sms: v.text })}
                    style={{
                      padding: '6px 12px',
                      borderRadius: crmV2.radiusPill,
                      border: `1px solid ${active ? crmV2.goldBorder : crmV2.borderStrong}`,
                      background: active ? crmV2.goldSoft : crmV2.bg,
                      color: active ? crmV2.goldDark : crmV2.text,
                      fontSize: 12,
                      fontWeight: active ? 700 : 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {v.label}
                  </button>
                )
              })}
            </div>
            <textarea
              rows={5}
              value={copy.sms}
              onChange={(e) => editCopy({ sms: e.target.value })}
              style={{ ...field, minHeight: 120, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '4px 8px',
                flexWrap: 'wrap',
                marginTop: 6,
                fontSize: 12,
                color: crmV2.textMuted,
              }}
            >
              <span>
                Variables : {'{prenom}'} et {'{lien1}'} (obligatoire)
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {[...rendered].length} car. lien inclus · {segments} SMS
              </span>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>Aperçu pour Aaron</div>
            <div
              style={{
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 12,
                background: crmV2.bgSoft,
                border: `1px solid ${crmV2.border}`,
                fontSize: 13,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {rendered}
            </div>
            {segments > 1 && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: crmV2.textMuted, lineHeight: 1.45 }}>
                {segments} segments facturés par personne. Avec accents la limite est de 70 caractères par segment (160
                sans accents).
              </p>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${crmV2.goldBorder}`,
              background: crmV2.goldSoft,
              alignSelf: 'start',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>À l’envoi, chaque personne reçoit</div>
            {[
              { ok: hasPrenom, label: 'Son prénom via {prenom}' },
              { ok: hasLien, label: 'Un lien unique via {lien1}' },
              { ok: true, label: 'La page déjà rattachée à sa fiche' },
              { ok: true, label: 'Pas de nom / email à ressaisir' },
              { ok: true, label: 'Sa réponse tracée dans le tableau' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 12.5, color: crmV2.text }}>
                {item.ok ? (
                  <CheckCircle2 size={15} color={crmV2.success} style={{ flex: 'none', marginTop: 1 }} />
                ) : (
                  <XCircle size={15} color={crmV2.danger} style={{ flex: 'none', marginTop: 1 }} />
                )}
                {item.label}
              </div>
            ))}
            <p style={{ margin: '10px 0 0', fontSize: 12, color: crmV2.textMuted, lineHeight: 1.45 }}>
              Le lien <code style={codeStyle}>{'{lien1}'}</code> est signé automatiquement pour chaque contact au moment de
              l’envoi. Rien à préparer dans SMS Factor.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {data?.public_url && (
            <>
              <CrmV2Button variant="secondary" onClick={() => copyText(data.public_url!, 'URL copiée')} icon={<Copy size={14} />}>
                Copier l’URL publique
              </CrmV2Button>
              <a href={data.public_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />}>
                  Voir la page
                </CrmV2Button>
              </a>
            </>
          )}
          <CrmV2Button variant="secondary" onClick={() => copyText(copy.sms, 'SMS copié')} icon={<Copy size={14} />}>
            Copier le SMS
          </CrmV2Button>
        </div>

        <EvSubBlock title="Page publique de choix">
          <div style={{ display: 'grid', gridTemplateColumns: twoCols, gap: '12px 16px' }}>
            <div>
              <EvLabel>Titre de la page</EvLabel>
              <input style={field} value={copy.title} onChange={(e) => editCopy({ title: e.target.value })} />
            </div>
            <div>
              <EvLabel>Note (sans chiffres de places)</EvLabel>
              <input style={field} value={copy.note} onChange={(e) => editCopy({ note: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <EvLabel>Texte d’intro</EvLabel>
              <textarea
                rows={2}
                style={{ ...field, minHeight: 64, resize: 'vertical' }}
                value={copy.intro}
                onChange={(e) => editCopy({ intro: e.target.value })}
              />
            </div>
          </div>
        </EvSubBlock>
      </EvCard>

      {/* ——— Envoi de la campagne ——— */}
      <EvCard title="Envoi de la campagne SMS" icon={<Send size={16} />}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {STEP_LABELS.map((label, i) => {
            const done = currentStep > i
            const active = currentStep === i
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px 5px 6px',
                  borderRadius: crmV2.radiusPill,
                  border: `1px solid ${done ? 'rgba(0,189,165,0.35)' : active ? crmV2.goldBorder : crmV2.border}`,
                  background: done ? 'rgba(0,189,165,0.08)' : active ? crmV2.goldSoft : crmV2.bg,
                  fontSize: 12,
                  fontWeight: 600,
                  color: done ? '#00866f' : active ? crmV2.goldDark : crmV2.textMuted,
                }}
              >
                {done ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      background: active ? crmV2.gold : crmV2.bgSoft,
                      color: active ? '#fff' : crmV2.textMuted,
                    }}
                  >
                    {i + 1}
                  </span>
                )}
                {label}
              </div>
            )
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { label: 'Préinscrits', value: audience ? audience.registrations : '…' },
            { label: 'Joignables par SMS', value: audience ? audience.ready : '…', strong: true },
            { label: 'Sans fiche CRM', value: audience ? audience.unmatched : '…' },
            { label: 'Sans numéro valide', value: audience ? audience.no_phone : '…' },
          ].map((cell) => (
            <EvStat key={cell.label} label={cell.label} value={cell.value} color={cell.strong ? crmV2.goldDark : crmV2.text} />
          ))}
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5 }}>
          Les destinataires sont les préinscrits du salon rattachés à une fiche CRM avec un numéro valide. Chacun reçoit
          son prénom et son propre lien signé : rien à ressaisir, et la réponse retombe sur sa fiche.
          {audience && segments > 1
            ? ` Coût estimé : ${audience.ready * segments} segments (${segments} par personne).`
            : null}
        </p>

        {alreadySent ? (
          <EvNotice tone="success">
            <strong>Campagne {campaign?.status}.</strong>{' '}
            {sendResult
              ? `${sendResult.sent}/${sendResult.valid} envoyés, ${sendResult.failed} échecs, ${sendResult.skipped} ignorés, ${sendResult.segments_used} segments facturés.`
              : 'Détail des envois dans SMS Factor.'}{' '}
            <a href="/admin/crm/sms-factor" target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600 }}>
              Voir le suivi
            </a>
          </EvNotice>
        ) : confirmSend ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: '1px solid rgba(242,84,91,0.35)',
              background: crmV2.dangerSoft,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              <AlertTriangle size={16} color="#d13a41" />
              Envoyer maintenant à {campaign?.recipients} personnes ?
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5 }}>
              Action irréversible. Les SMS partent immédiatement, {segments} segment{segments > 1 ? 's' : ''} par
              personne.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <CrmV2Button variant="secondary" disabled={busy} onClick={() => setConfirmSend(false)}>
                Annuler
              </CrmV2Button>
              <CrmV2Button variant="primary" disabled={busy} onClick={sendCampaign} icon={<Send size={14} />}>
                {busy ? 'Envoi en cours…' : 'Oui, envoyer maintenant'}
              </CrmV2Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Button variant="gold" disabled={busy} onClick={() => void save()} icon={<Save size={14} />}>
                Enregistrer le texte
              </CrmV2Button>
              <CrmV2Button variant="secondary" disabled={busy || !hasLien} onClick={prepareCampaign} icon={<Users size={14} />}>
                {campaign ? 'Mettre à jour les destinataires' : 'Préparer les destinataires'}
              </CrmV2Button>
              <CrmV2Button
                variant="primary"
                disabled={!readyToSend || busy}
                onClick={() => setConfirmSend(true)}
                icon={<Send size={14} />}
              >
                Envoyer la campagne{campaign?.recipients ? ` (${campaign.recipients})` : ''}
              </CrmV2Button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: crmV2.textMuted, lineHeight: 1.45 }}>
              {!campaign
                ? 'Le bouton d’envoi s’active après « Préparer les destinataires ».'
                : dirty
                  ? 'Texte modifié : enregistrez puis remettez les destinataires à jour avant d’envoyer.'
                  : campaign.recipients === 0
                    ? 'Aucun destinataire enregistré dans la campagne.'
                    : `Prêt : ${campaign.recipients} destinataires. Une confirmation sera demandée.`}
            </p>
          </>
        )}
      </EvCard>

      {/* ——— Envoi automatique aux nouveaux inscrits ——— */}
      <EvCard
        title="Nouveaux inscrits — envoi automatique"
        icon={<Zap size={16} />}
        actions={
          <CrmV2StatusPill
            label={drip.enabled ? 'Actif' : 'En pause'}
            color={drip.enabled ? '#00866f' : crmV2.textFaint}
            bg={drip.enabled ? 'rgba(0,189,165,0.12)' : crmV2.chipBg}
          />
        }
      >
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5, maxWidth: 720 }}>
          Toute personne qui s’inscrit désormais au salon reçoit le SMS {drip.delayMinutes} minutes après son
          inscription, avec son lien personnel. Le texte bascule tout seul sur la version « aujourd’hui » le jour du
          salon.{' '}
          {typeof data?.drip_sent === 'number' && data.drip_sent > 0
            ? `${data.drip_sent} nouvel${data.drip_sent > 1 ? 's' : ''} inscrit${data.drip_sent > 1 ? 's' : ''} déjà notifié${data.drip_sent > 1 ? 's' : ''}.`
            : 'Aucun envoi automatique pour l’instant.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: twoCols, gap: '12px 16px' }}>
          <div style={{ minWidth: 0 }}>
            <EvLabel style={{ color: data?.drip_variant === 'demain' ? crmV2.goldDark : crmV2.textMuted }}>
              Texte la veille {data?.drip_variant === 'demain' ? '— utilisé actuellement' : ''}
            </EvLabel>
            <textarea
              rows={3}
              style={{ ...field, minHeight: 74, resize: 'vertical', marginBottom: 4, lineHeight: 1.5 }}
              value={drip.smsDemain}
              onChange={(e) => setDrip((p) => ({ ...p, smsDemain: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: crmV2.textMuted }}>
              {smsSegments(previewSms(drip.smsDemain))} segment
              {smsSegments(previewSms(drip.smsDemain)) > 1 ? 's' : ''} par personne
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <EvLabel style={{ color: data?.drip_variant === 'aujourdhui' ? crmV2.goldDark : crmV2.textMuted }}>
              Texte le jour du salon {data?.drip_variant === 'aujourdhui' ? '— utilisé actuellement' : ''}
            </EvLabel>
            <textarea
              rows={3}
              style={{ ...field, minHeight: 74, resize: 'vertical', marginBottom: 4, lineHeight: 1.5 }}
              value={drip.smsAujourdhui}
              onChange={(e) => setDrip((p) => ({ ...p, smsAujourdhui: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: crmV2.textMuted }}>
              {smsSegments(previewSms(drip.smsAujourdhui))} segment
              {smsSegments(previewSms(drip.smsAujourdhui)) > 1 ? 's' : ''} par personne
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <CrmV2Button variant="gold" disabled={busy} onClick={() => void save()} icon={<Save size={14} />}>
            Enregistrer les textes automatiques
          </CrmV2Button>
          <CrmV2Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              const next = { ...drip, enabled: !drip.enabled }
              setDrip(next)
              void save(next)
            }}
          >
            {drip.enabled ? 'Mettre en pause' : 'Réactiver l’envoi auto'}
          </CrmV2Button>
        </div>
      </EvCard>

      {/* ——— Rappel du jour J ——— */}
      <EvCard title="Rappel du jour J (8h) — personnalisé par créneau" icon={<CalendarClock size={16} />}>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5, maxWidth: 720 }}>
          Le SMS et l’email de 8h partent à tous les inscrits. La phrase <code style={codeStyle}>{'{creneau_phrase}'}</code> change
          selon que la personne a choisi son créneau ou non.{' '}
          {data?.stats && audience
            ? `Aujourd’hui : ${uniqueContacts} avec créneau, ${Math.max(0, audience.registrations - uniqueContacts)} sans.`
            : null}
        </p>

        <div className="event-timeslot-sms-grid" style={{ display: 'grid', gridTemplateColumns: twoCols, gap: 14 }}>
          <EvSubBlock title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MessageSquare size={13} /> SMS</span>}>
            <EvLabel>Si créneau choisi</EvLabel>
            <input
              style={{ ...field, marginBottom: 10 }}
              value={jourJ.smsAvecCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, smsAvecCreneau: e.target.value }))}
            />
            <EvLabel>Sans créneau</EvLabel>
            <input
              style={{ ...field, marginBottom: 10 }}
              value={jourJ.smsSansCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, smsSansCreneau: e.target.value }))}
            />
            {data?.jour_j_sms_template ? (
              <div style={{ fontSize: 11.5, color: crmV2.textMuted, lineHeight: 1.45 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong style={{ color: crmV2.text }}>Aperçu avec créneau :</strong>{' '}
                  {previewJourJ(data.jour_j_sms_template, jourJ.smsAvecCreneau, true)}
                </div>
                <div>
                  <strong style={{ color: crmV2.text }}>Aperçu sans :</strong>{' '}
                  {previewJourJ(data.jour_j_sms_template, jourJ.smsSansCreneau, false)}
                </div>
              </div>
            ) : null}
          </EvSubBlock>
          <EvSubBlock title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={13} /> Email</span>}>
            <EvLabel>Si créneau choisi</EvLabel>
            <input
              style={{ ...field, marginBottom: 10 }}
              value={jourJ.emailAvecCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, emailAvecCreneau: e.target.value }))}
            />
            <EvLabel>Sans créneau</EvLabel>
            <input
              style={{ ...field, marginBottom: 10 }}
              value={jourJ.emailSansCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, emailSansCreneau: e.target.value }))}
            />
            {data?.jour_j_email_body ? (
              <div style={{ fontSize: 11.5, color: crmV2.textMuted, lineHeight: 1.45 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong style={{ color: crmV2.text }}>Objet :</strong> {data.jour_j_email_subject}
                </div>
                <div>
                  <strong style={{ color: crmV2.text }}>Aperçu avec créneau :</strong>{' '}
                  {previewJourJ(data.jour_j_email_body, jourJ.emailAvecCreneau, true)}
                </div>
              </div>
            ) : null}
          </EvSubBlock>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, justifyContent: 'flex-end' }}>
          <CrmV2Button variant="primary" disabled={busy} onClick={() => void save()} icon={<Save size={14} />}>
            Enregistrer les phrases du jour J
          </CrmV2Button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: crmV2.textMuted, lineHeight: 1.5 }}>
          Le texte complet du SMS et de l’email se modifie dans les communications de l’événement (étape « Jour J »).
          Variables : <code style={codeStyle}>{'{creneau_debut}'}</code>, <code style={codeStyle}>{'{creneau_fin}'}</code>,{' '}
          <code style={codeStyle}>{'{creneau}'}</code>.
        </p>
      </EvCard>
      <style>{`
        @media (max-width: 860px) {
          .event-timeslot-sms-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
