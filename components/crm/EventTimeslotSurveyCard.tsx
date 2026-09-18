'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CheckCircle2, Copy, ExternalLink, Save, Send, Users, Zap } from 'lucide-react'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
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

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Créneaux & SMS</div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5, maxWidth: 720 }}>
        Chaque SMS part avec un lien personnel. La personne n’a rien à ressaisir, et sa réponse est collée à sa fiche.
        Les places par créneau sont suivies ici uniquement — elles n’apparaissent pas sur la page publique.
      </p>

      {toast && <div style={{ fontSize: 12, color: crmV2.success, marginBottom: 10 }}>{toast}</div>}
      {error && <div style={{ fontSize: 13, color: crmV2.danger, marginBottom: 10 }}>{error}</div>}

      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: crmV2.textMuted, fontSize: 12 }}>
              <th style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}`, fontWeight: 700 }}>Créneau</th>
              <th style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}`, fontWeight: 700 }}>Réponses</th>
              <th style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}`, fontWeight: 700 }}>Places</th>
              <th style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}`, fontWeight: 700 }}>Restantes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const over = row.remaining != null && row.remaining < 0
              return (
                <tr key={row.value}>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}`, fontWeight: 600 }}>{row.label}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}` }}>{row.count}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${crmV2.border}` }}>
                    <input
                      type="number"
                      min={1}
                      placeholder="—"
                      value={places[row.value] || ''}
                      onChange={(e) => {
                        setPlaces((prev) => ({ ...prev, [row.value]: e.target.value }))
                        setDirty(true)
                      }}
                      style={{ ...field, width: 88, padding: '6px 8px' }}
                    />
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      borderBottom: `1px solid ${crmV2.border}`,
                      color: over ? crmV2.danger : crmV2.text,
                      fontWeight: 600,
                    }}
                  >
                    {row.remaining == null ? '—' : row.remaining}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: '8px 10px', fontWeight: 700 }}>Total</td>
              <td style={{ padding: '8px 10px', fontWeight: 700 }}>{uniqueContacts}</td>
              <td colSpan={2} style={{ padding: '8px 10px', fontSize: 12, color: crmV2.textFaint }}>
                Compteurs invisibles sur la page de choix
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(240px, 0.85fr)',
          gap: 16,
          marginBottom: 14,
        }}
        className="event-timeslot-sms-grid"
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
            Texte du SMS — vous avez la main complète
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {TIMESLOT_SURVEY_SMS_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => editCopy({ sms: v.text })}
                style={{
                  padding: '5px 11px',
                  borderRadius: crmV2.radiusPill,
                  border: `1px solid ${copy.sms === v.text ? crmV2.gold : crmV2.border}`,
                  background: copy.sms === v.text ? crmV2.goldSoft : crmV2.bg,
                  color: crmV2.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <textarea
            rows={5}
            value={copy.sms}
            onChange={(e) => editCopy({ sms: e.target.value })}
            style={{ ...field, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6, fontSize: 12, color: crmV2.textMuted }}>
            <span>
              Variables : {'{prenom}'} et {'{lien1}'} (obligatoire)
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {[...rendered].length} car. lien inclus · {segments} SMS
            </span>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: crmV2.textMuted }}>Aperçu pour Aaron</div>
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: crmV2.radius,
              background: crmV2.bg,
              border: `1px solid ${crmV2.border}`,
              fontSize: 13,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
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
            borderRadius: crmV2.radius,
            border: `1px solid ${crmV2.goldBorder}`,
            background: crmV2.goldSoft,
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
              <CheckCircle2 size={15} color={item.ok ? crmV2.success : crmV2.danger} style={{ flex: 'none', marginTop: 1 }} />
              {item.label}
            </div>
          ))}
          <p style={{ margin: '10px 0 0', fontSize: 12, color: crmV2.textMuted, lineHeight: 1.45 }}>
            Le lien <code>{'{lien1}'}</code> est signé automatiquement pour chaque contact au moment de l’envoi. Rien à
            préparer dans SMS Factor.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {data?.public_url && (
          <>
            <CrmV2Button variant="secondary" onClick={() => copyText(data.public_url!, 'URL copiée')}>
              <Copy size={14} /> Copier l’URL publique
            </CrmV2Button>
            <a href={data.public_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="secondary">
                <ExternalLink size={14} /> Voir la page
              </CrmV2Button>
            </a>
          </>
        )}
        <CrmV2Button variant="secondary" onClick={() => copyText(copy.sms, 'SMS copié')}>
          <Copy size={14} /> Copier le SMS
        </CrmV2Button>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Titre de la page</label>
        <input style={{ ...field, marginBottom: 10 }} value={copy.title} onChange={(e) => editCopy({ title: e.target.value })} />
        <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Texte d’intro</label>
        <textarea
          rows={2}
          style={{ ...field, minHeight: 64, resize: 'vertical', marginBottom: 10 }}
          value={copy.intro}
          onChange={(e) => editCopy({ intro: e.target.value })}
        />
        <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Note (sans chiffres de places)</label>
        <input style={field} value={copy.note} onChange={(e) => editCopy({ note: e.target.value })} />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: crmV2.radius,
          border: `1px solid ${crmV2.border}`,
          background: crmV2.bg,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Envoi de la campagne SMS</div>

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
                  padding: '5px 11px',
                  borderRadius: crmV2.radiusPill,
                  border: `1px solid ${done ? crmV2.success : active ? crmV2.gold : crmV2.border}`,
                  background: done || active ? crmV2.goldSoft : 'transparent',
                  fontSize: 12,
                  fontWeight: 600,
                  color: done ? crmV2.success : crmV2.text,
                }}
              >
                {done ? <CheckCircle2 size={13} /> : <span style={{ opacity: 0.6 }}>{i + 1}.</span>}
                {label}
              </div>
            )
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {[
            { label: 'Préinscrits', value: audience ? audience.registrations : '…' },
            { label: 'Joignables par SMS', value: audience ? audience.ready : '…', strong: true },
            { label: 'Sans fiche CRM', value: audience ? audience.unmatched : '…' },
            { label: 'Sans numéro valide', value: audience ? audience.no_phone : '…' },
          ].map((cell) => (
            <div
              key={cell.label}
              style={{
                padding: '10px 12px',
                borderRadius: crmV2.radius,
                border: `1px solid ${crmV2.border}`,
                background: crmV2.bg,
              }}
            >
              <div style={{ fontSize: 11, color: crmV2.textMuted, marginBottom: 2 }}>{cell.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: cell.strong ? crmV2.gold : crmV2.text }}>
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5 }}>
          Les destinataires sont les préinscrits du salon rattachés à une fiche CRM avec un numéro valide. Chacun reçoit
          son prénom et son propre lien signé : rien à ressaisir, et la réponse retombe sur sa fiche.
          {audience && segments > 1
            ? ` Coût estimé : ${audience.ready * segments} segments (${segments} par personne).`
            : null}
        </p>

        {alreadySent ? (
          <div
            style={{
              padding: 12,
              borderRadius: crmV2.radius,
              border: `1px solid ${crmV2.success}`,
              background: crmV2.goldSoft,
              fontSize: 13,
            }}
          >
            <strong>Campagne {campaign?.status}.</strong>{' '}
            {sendResult
              ? `${sendResult.sent}/${sendResult.valid} envoyés, ${sendResult.failed} échecs, ${sendResult.skipped} ignorés, ${sendResult.segments_used} segments facturés.`
              : 'Détail des envois dans SMS Factor.'}{' '}
            <a href="/admin/crm/sms-factor" target="_blank" rel="noreferrer" style={{ color: crmV2.gold }}>
              Voir le suivi
            </a>
          </div>
        ) : confirmSend ? (
          <div
            style={{
              padding: 12,
              borderRadius: crmV2.radius,
              border: `1px solid ${crmV2.danger}`,
              background: crmV2.dangerSoft,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Envoyer maintenant à {campaign?.recipients} personnes ?
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5 }}>
              Action irréversible. Les SMS partent immédiatement, {segments} segment{segments > 1 ? 's' : ''} par
              personne.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Button variant="primary" disabled={busy} onClick={sendCampaign}>
                <Send size={14} /> {busy ? 'Envoi en cours…' : 'Oui, envoyer maintenant'}
              </CrmV2Button>
              <CrmV2Button variant="secondary" disabled={busy} onClick={() => setConfirmSend(false)}>
                Annuler
              </CrmV2Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Button variant="gold" disabled={busy} onClick={() => void save()}>
                <Save size={14} /> Enregistrer le texte
              </CrmV2Button>
              <CrmV2Button variant="secondary" disabled={busy || !hasLien} onClick={prepareCampaign}>
                <Users size={14} /> {campaign ? 'Mettre à jour les destinataires' : 'Préparer les destinataires'}
              </CrmV2Button>
              <CrmV2Button variant="primary" disabled={!readyToSend || busy} onClick={() => setConfirmSend(true)}>
                <Send size={14} /> Envoyer la campagne{campaign?.recipients ? ` (${campaign.recipients})` : ''}
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
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: crmV2.radius,
          border: `1px solid ${crmV2.border}`,
          background: crmV2.bg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Zap size={15} color={crmV2.gold} />
          <div style={{ fontWeight: 700, fontSize: 13 }}>Nouveaux inscrits — envoi automatique</div>
          <span
            style={{
              padding: '2px 9px',
              borderRadius: crmV2.radiusPill,
              fontSize: 11,
              fontWeight: 700,
              border: `1px solid ${drip.enabled ? crmV2.success : crmV2.border}`,
              color: drip.enabled ? crmV2.success : crmV2.textMuted,
            }}
          >
            {drip.enabled ? 'Actif' : 'En pause'}
          </span>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5, maxWidth: 720 }}>
          Toute personne qui s’inscrit désormais au salon reçoit le SMS {drip.delayMinutes} minutes après son
          inscription, avec son lien personnel. Le texte bascule tout seul sur la version « aujourd’hui » le jour du
          salon.{' '}
          {typeof data?.drip_sent === 'number' && data.drip_sent > 0
            ? `${data.drip_sent} nouvel${data.drip_sent > 1 ? 's' : ''} inscrit${data.drip_sent > 1 ? 's' : ''} déjà notifié${data.drip_sent > 1 ? 's' : ''}.`
            : 'Aucun envoi automatique pour l’instant.'}
        </p>

        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: crmV2.textMuted,
            marginBottom: 4,
            fontWeight: data?.drip_variant === 'demain' ? 700 : 400,
          }}
        >
          Texte la veille {data?.drip_variant === 'demain' ? '— utilisé actuellement' : ''}
        </label>
        <textarea
          rows={3}
          style={{ ...field, minHeight: 74, resize: 'vertical', marginBottom: 4 }}
          value={drip.smsDemain}
          onChange={(e) => setDrip((p) => ({ ...p, smsDemain: e.target.value }))}
        />
        <div style={{ fontSize: 11, color: crmV2.textMuted, marginBottom: 10 }}>
          {smsSegments(previewSms(drip.smsDemain))} segment
          {smsSegments(previewSms(drip.smsDemain)) > 1 ? 's' : ''} par personne
        </div>

        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: crmV2.textMuted,
            marginBottom: 4,
            fontWeight: data?.drip_variant === 'aujourdhui' ? 700 : 400,
          }}
        >
          Texte le jour du salon {data?.drip_variant === 'aujourdhui' ? '— utilisé actuellement' : ''}
        </label>
        <textarea
          rows={3}
          style={{ ...field, minHeight: 74, resize: 'vertical', marginBottom: 4 }}
          value={drip.smsAujourdhui}
          onChange={(e) => setDrip((p) => ({ ...p, smsAujourdhui: e.target.value }))}
        />
        <div style={{ fontSize: 11, color: crmV2.textMuted, marginBottom: 12 }}>
          {smsSegments(previewSms(drip.smsAujourdhui))} segment
          {smsSegments(previewSms(drip.smsAujourdhui)) > 1 ? 's' : ''} par personne
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CrmV2Button variant="gold" disabled={busy} onClick={() => void save()}>
            <Save size={14} /> Enregistrer les textes automatiques
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
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: crmV2.radius,
          border: `1px solid ${crmV2.border}`,
          background: crmV2.bg,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Rappel du jour J (8h) — personnalisé par créneau</div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.5, maxWidth: 720 }}>
          Le SMS et l’email de 8h partent à tous les inscrits. La phrase <code>{'{creneau_phrase}'}</code> change selon que
          la personne a choisi son créneau ou non.{' '}
          {data?.stats && audience
            ? `Aujourd’hui : ${uniqueContacts} avec créneau, ${Math.max(0, audience.registrations - uniqueContacts)} sans.`
            : null}
        </p>

        <div className="event-timeslot-sms-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>SMS</div>
            <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
              Si créneau choisi
            </label>
            <input
              style={{ ...field, marginBottom: 8 }}
              value={jourJ.smsAvecCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, smsAvecCreneau: e.target.value }))}
            />
            <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Sans créneau</label>
            <input
              style={{ ...field, marginBottom: 8 }}
              value={jourJ.smsSansCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, smsSansCreneau: e.target.value }))}
            />
            {data?.jour_j_sms_template ? (
              <div style={{ fontSize: 11.5, color: crmV2.textMuted, lineHeight: 1.45 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong>Aperçu avec créneau :</strong> {previewJourJ(data.jour_j_sms_template, jourJ.smsAvecCreneau, true)}
                </div>
                <div>
                  <strong>Aperçu sans :</strong> {previewJourJ(data.jour_j_sms_template, jourJ.smsSansCreneau, false)}
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Email</div>
            <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
              Si créneau choisi
            </label>
            <input
              style={{ ...field, marginBottom: 8 }}
              value={jourJ.emailAvecCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, emailAvecCreneau: e.target.value }))}
            />
            <label style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>Sans créneau</label>
            <input
              style={{ ...field, marginBottom: 8 }}
              value={jourJ.emailSansCreneau}
              onChange={(e) => setJourJ((p) => ({ ...p, emailSansCreneau: e.target.value }))}
            />
            {data?.jour_j_email_body ? (
              <div style={{ fontSize: 11.5, color: crmV2.textMuted, lineHeight: 1.45 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong>Objet :</strong> {data.jour_j_email_subject}
                </div>
                <div>
                  <strong>Aperçu avec créneau :</strong>{' '}
                  {previewJourJ(data.jour_j_email_body, jourJ.emailAvecCreneau, true)}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <CrmV2Button variant="gold" disabled={busy} onClick={() => void save()}>
            <Save size={14} /> Enregistrer les phrases du jour J
          </CrmV2Button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: crmV2.textMuted }}>
          Le texte complet du SMS et de l’email se modifie dans les communications de l’événement (étape « Jour J »).
          Variables : <code>{'{creneau_debut}'}</code>, <code>{'{creneau_fin}'}</code>, <code>{'{creneau}'}</code>.
        </p>
      </div>
      <style>{`
        @media (max-width: 860px) {
          .event-timeslot-sms-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
