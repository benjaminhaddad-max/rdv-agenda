'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, MapPin, Navigation, PhoneCall, Video } from 'lucide-react'
import { CAMPUS_OPTIONS, campusShortLabel, isValidCampus, presentielCampusLabel } from '@/lib/campus'
import { personalizeVisioUrl, firstNameOf } from '@/lib/visio-url'
import { CrmV2Segmented } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

type Mode = 'visio' | 'telephone' | 'presentiel'

function isGoogleMeetLink(link: string | null | undefined) {
  return /meet\.google\.com/i.test(link || '')
}
function isInternalVisioLink(link: string | null | undefined) {
  return /\/visio\//i.test(link || '')
}

/**
 * Bloc « Mode du RDV » de la fiche RDV (brief V2, section 6.3) :
 * choix Visio / Téléphone / Présentiel, liens visio, adresse du présentiel.
 * Les changements passent par PATCH change_meeting_mode (SMS + e-mail au prospect).
 */
export default function RdvModeBlock({
  appointmentId,
  meetingType,
  meetingLink,
  prospectName,
  prospectPhone,
  closerName,
  status,
  disabled,
  canEdit = true,
  onJoinLegacyVisio,
  onUpdated,
}: {
  appointmentId: string
  meetingType: string | null | undefined
  meetingLink: string | null | undefined
  prospectName: string
  prospectPhone: string | null
  closerName?: string | null
  status: string
  disabled?: boolean
  /** Peut changer le mode / l'adresse */
  canEdit?: boolean
  /** Lien visio ni Meet ni interne : ancienne visio Jitsi (IA) */
  onJoinLegacyVisio: () => void
  onUpdated: (updated: { meeting_type: string; meeting_link: string | null }) => void
}) {
  const mode: Mode | null = meetingType === 'visio' || meetingType === 'telephone' || meetingType === 'presentiel' ? meetingType : null
  const [target, setTarget] = useState<Mode | null>(null)
  const address = mode === 'presentiel' ? presentielCampusLabel(meetingLink) : null
  const [picked, setPicked] = useState<string>(() => (address && isValidCampus(address) ? address : address ? '__other' : CAMPUS_OPTIONS[0]))
  const [other, setOther] = useState(() => (address && !isValidCampus(address) ? address : ''))
  const [showAddressEdit, setShowAddressEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!mode) return null
  const locked = !canEdit || status === 'annule' || disabled

  const shown: Mode = target ?? mode
  const pickedAddress = picked === '__other' ? other.trim() : picked

  async function apply(nextMode: 'visio' | 'presentiel', addr?: string) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const body: Record<string, unknown> = { change_meeting_mode: true, meeting_type: nextMode }
      if (nextMode === 'presentiel') {
        body.meeting_link = addr
        if (addr && !isValidCampus(addr)) body.custom_address = true
      }
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Erreur lors de la modification')
        return
      }
      const updated = await res.json()
      onUpdated({ meeting_type: updated.meeting_type, meeting_link: updated.meeting_link ?? null })
      setTarget(null)
      setShowAddressEdit(false)
      setSuccess(nextMode === mode ? 'Adresse modifiée — SMS et e-mail envoyés au prospect' : 'Mode modifié — SMS et e-mail envoyés au prospect')
      setTimeout(() => setSuccess(null), 3500)
    } catch {
      setError('Erreur réseau')
    } finally {
      setBusy(false)
    }
  }

  const modeLabel = mode === 'visio' ? 'Visio' : mode === 'telephone' ? 'Téléphone' : `Présentiel${address ? ` — ${campusShortLabel(meetingLink)}` : ''}`
  const ModeIcon = mode === 'visio' ? Video : mode === 'telephone' ? PhoneCall : MapPin

  const pillBtn = (bg: string, border: string, color: string) => ({
    borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, background: bg,
    border: `1px solid ${border}`, color, display: 'inline-flex', alignItems: 'center', gap: 5,
    cursor: 'pointer', fontFamily: 'inherit',
  }) as const

  // Liens visio
  const rawLink = meetingLink || ''
  const isGoogle = isGoogleMeetLink(rawLink)
  const isInternal = isInternalVisioLink(rawLink)
  const myLink = isInternal ? personalizeVisioUrl(rawLink, firstNameOf(closerName || 'Admissions Diploma')) : rawLink
  const studentLink = isInternal ? personalizeVisioUrl(rawLink, firstNameOf(prospectName)) : rawLink

  const addressEditor = (confirmLabel: string, onCancel: () => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted }}>{mode === 'presentiel' ? 'Changer l’adresse' : 'Adresse du RDV'}</span>
      {[...CAMPUS_OPTIONS, '__other'].map(opt => {
        const sel = picked === opt
        return (
          <button key={opt} type="button" onClick={() => setPicked(opt)} style={{
            display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', borderRadius: 10, padding: '8px 10px',
            background: sel ? 'rgba(201,168,76,0.10)' : crmV2.bg, border: `1px solid ${sel ? crmV2.gold : crmV2.border}`,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: sel ? 700 : 500, color: crmV2.text,
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', border: sel ? `5px solid ${crmV2.gold}` : `1.5px solid ${crmV2.borderStrong}`,
              background: '#fff', flexShrink: 0, boxSizing: 'border-box',
            }} />
            {opt === '__other' ? 'Autre adresse…' : opt}
          </button>
        )
      })}
      {picked === '__other' && (
        <input
          autoFocus
          value={other}
          onChange={e => setOther(e.target.value)}
          placeholder="Saisir l’adresse complète…"
          style={{
            height: 38, border: `1px solid ${crmV2.gold}`, borderRadius: 10, padding: '0 12px', fontSize: 13,
            fontFamily: 'inherit', color: crmV2.text, outline: 'none', background: '#fff', boxSizing: 'border-box', width: '100%',
          }}
        />
      )}
      <span style={{ fontSize: 11, color: crmV2.textFaint }}>L’adresse est reprise dans l’e-mail et le SMS de confirmation envoyés au prospect.</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button
          type="button"
          disabled={busy || pickedAddress.length < (picked === '__other' ? 8 : 1) || (mode === 'presentiel' && pickedAddress === address)}
          onClick={() => void apply('presentiel', pickedAddress)}
          style={{
            flex: 1, borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            background: crmV2.primary, border: `1px solid ${crmV2.primary}`, color: '#fff', cursor: busy ? 'wait' : 'pointer',
            opacity: busy || pickedAddress.length < (picked === '__other' ? 8 : 1) || (mode === 'presentiel' && pickedAddress === address) ? 0.55 : 1,
          }}
        >
          {busy ? 'Modification…' : confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} style={{
          borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text, cursor: 'pointer',
        }}>
          Annuler
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <ModeIcon size={14} color={crmV2.gold} style={{ flexShrink: 0, marginTop: 3 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong style={{ color: crmV2.goldDark }}>{modeLabel}</strong>
          {mode === 'visio' && rawLink && (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  if (isGoogle || isInternal) window.open(myLink, '_blank', 'noopener,noreferrer')
                  else onJoinLegacyVisio()
                }}
                style={pillBtn('rgba(201,168,76,0.12)', 'rgba(201,168,76,0.35)', crmV2.goldDark)}
              >
                <Video size={12} />
                {isGoogle ? 'Rejoindre Google Meet' : isInternal ? 'Rejoindre la visio' : 'Rejoindre (IA activée)'}
                {(isGoogle || isInternal) && <ExternalLink size={11} />}
              </button>
              {isInternal && (
                <button
                  type="button"
                  title="Copier le lien à envoyer à l’élève (son prénom se remplit automatiquement)"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(studentLink)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1800)
                    } catch { /* presse-papiers indisponible */ }
                  }}
                  style={copied
                    ? pillBtn('rgba(16,185,129,0.12)', 'rgba(16,185,129,0.4)', '#059669')
                    : pillBtn(crmV2.bg, crmV2.borderStrong, crmV2.text)}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Lien élève copié' : 'Copier le lien élève'}
                </button>
              )}
            </span>
          )}
        </div>

        {!locked && (
          <CrmV2Segmented<Mode>
            stretch
            size="sm"
            value={shown}
            onChange={(m) => {
              setError(null)
              if (m === mode) { setTarget(null); return }
              setTarget(m)
              if (m === 'presentiel') setPicked(CAMPUS_OPTIONS[0])
            }}
            items={[
              { id: 'visio', label: 'Visio' },
              // Le passage en téléphone n'est pas proposé par l'API : affiché seulement si c'est déjà le mode du RDV
              { id: 'telephone', label: 'Téléphone', disabled: mode !== 'telephone' },
              { id: 'presentiel', label: 'Présentiel' },
            ]}
          />
        )}

        {/* Bascule demandée : confirmation (le prospect est prévenu) */}
        {target === 'visio' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: crmV2.textMuted }}>
            Un lien visio sera créé et envoyé au prospect.
            <button type="button" disabled={busy} onClick={() => void apply('visio')} style={{
              borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              background: crmV2.primary, border: `1px solid ${crmV2.primary}`, color: '#fff', cursor: busy ? 'wait' : 'pointer',
            }}>
              {busy ? 'Modification…' : 'Passer en visio'}
            </button>
            <button type="button" disabled={busy} onClick={() => setTarget(null)} style={{
              background: 'none', border: 'none', color: crmV2.link, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}>
              Annuler
            </button>
          </div>
        )}
        {target === 'presentiel' && (
          <div style={{ background: '#fdf6e3', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 12, padding: '10px 12px' }}>
            {addressEditor('Confirmer le présentiel', () => setTarget(null))}
          </div>
        )}

        {/* Présentiel : adresse + itinéraire + changement */}
        {mode === 'presentiel' && !target && (
          <div style={{ background: '#fdf6e3', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin size={15} color="#b8963e" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.goldDark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Adresse du RDV</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, marginTop: 2, overflowWrap: 'anywhere' }}>{address || 'Adresse non renseignée'}</div>
              </div>
              {address && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: crmV2.link, textDecoration: 'none', flexShrink: 0 }}
                >
                  <Navigation size={12} /> Itinéraire
                </a>
              )}
            </div>
            {!locked && (showAddressEdit
              ? addressEditor('Enregistrer l’adresse', () => setShowAddressEdit(false))
              : (
                <button type="button" onClick={() => setShowAddressEdit(true)} style={{
                  alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: crmV2.link,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Changer l’adresse
                </button>
              ))}
          </div>
        )}

        {mode === 'telephone' && (
          <div style={{ fontSize: 12, color: crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <PhoneCall size={13} color="#22c55e" />
            Le closer appelle le prospect{prospectPhone ? ` au ${prospectPhone}` : ''}
          </div>
        )}

        {success && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{success}</div>}
        {error && <div style={{ fontSize: 12, color: '#d13a41', fontWeight: 600 }}>{error}</div>}
      </div>
    </div>
  )
}
