'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, ExternalLink, MessageSquare } from 'lucide-react'
import { CrmV2Button, CrmV2Card } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { isSalonEtudesMedecineTimeslotEvent } from '@/lib/event-timeslot-survey'

type Stats = {
  total: number
  unique_contacts: number
  by_slot: Array<{ value: string; label: string; count: number }>
}

type Feedback = {
  id: string
  body: string
  status: 'open' | 'applied' | 'dismissed'
  created_at: string
}

type Payload = {
  enabled: boolean
  public_url?: string
  sms_template?: string
  stats?: Stats
  feedback?: Feedback[]
}

export default function EventTimeslotSurveyCard({
  eventId,
  eventName,
  eventDate,
}: {
  eventId: string
  eventName: string
  eventDate: string
}) {
  const eligible = isSalonEtudesMedecineTimeslotEvent({ id: eventId, name: eventName, event_date: eventDate })
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erreur')
    setData(json)
  }, [eventId])

  useEffect(() => {
    if (!eligible) return
    load().catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [eligible, load])

  if (!eligible) return null

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setToast(label)
      setTimeout(() => setToast(null), 1800)
    })
  }

  async function sendFeedback() {
    if (!draft.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Erreur')
      }
      setDraft('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(feedbackId: string, status: Feedback['status']) {
    await fetch(`/api/events-studio/events/${eventId}/timeslot-survey`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback_id: feedbackId, status }),
    })
    await load()
  }

  const maxCount = Math.max(1, ...(data?.stats?.by_slot || []).map((s) => s.count))

  return (
    <CrmV2Card style={{ padding: 18, marginBottom: 14, border: `1px solid ${crmV2.goldBorder}`, background: '#fffdf6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: crmV2.text }}>Sondage créneaux</div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.45, maxWidth: 620 }}>
            Lien unique par SMS : le contact n’a pas à ressaisir nom, prénom ou email. Sa réponse est rattachée à sa fiche.
          </div>
        </div>
        {data?.public_url && (
          <div style={{ display: 'flex', gap: 8 }}>
            <CrmV2Button variant="secondary" onClick={() => copy(data.public_url!, 'Lien copié')}>
              <Copy size={14} /> Lien public
            </CrmV2Button>
            <a href={data.public_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="gold">
                <ExternalLink size={14} /> Ouvrir la page
              </CrmV2Button>
            </a>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ fontSize: 12, color: crmV2.success, marginBottom: 8 }}>{toast}</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: crmV2.danger, marginBottom: 8 }}>{error}</div>
      )}
      {!data && !error && (
        <div style={{ fontSize: 13, color: crmV2.textMuted }}>Préparation du formulaire…</div>
      )}

      {data?.enabled && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 8 }} className="event-timeslot-grid">
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 8 }}>
                Réponses {data.stats ? `· ${data.stats.unique_contacts} contact${data.stats.unique_contacts > 1 ? 's' : ''}` : ''}
              </div>
              {(data.stats?.by_slot || []).map((s) => (
                <div key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 88, fontSize: 12, fontWeight: 600, color: crmV2.text }}>{s.label}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 99, background: crmV2.bgMuted, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round((s.count / maxCount) * 100)}%`,
                        height: '100%',
                        background: crmV2.gold,
                        borderRadius: 99,
                      }}
                    />
                  </div>
                  <div style={{ width: 28, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{s.count}</div>
                </div>
              ))}
              {data.stats && data.stats.unique_contacts === 0 && (
                <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucune réponse pour l’instant.</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 8 }}>SMS à envoyer</div>
              <p style={{ fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.45, margin: '0 0 8px' }}>
                Campagnes SMS → lien tracké vers l’URL ci-dessus. Chaque destinataire reçoit un lien personnel, déjà associé à sa fiche.
              </p>
              {data.sms_template && (
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    borderRadius: 8,
                    background: crmV2.bg,
                    border: `1px solid ${crmV2.border}`,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    color: crmV2.text,
                  }}
                >
                  {data.sms_template}
                </pre>
              )}
              {data.sms_template && (
                <div style={{ marginTop: 8 }}>
                  <CrmV2Button variant="secondary" onClick={() => copy(data.sms_template!, 'Texte SMS copié')}>
                    <Copy size={14} /> Copier le texte
                  </CrmV2Button>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${crmV2.goldBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 8, color: crmV2.text }}>
              <MessageSquare size={14} /> Tes retours pour ajuster la page
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.45 }}>
              Texte, créneaux, ton du SMS, ce qui manque… On reprend à partir de ces notes.
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="Ex. Le SMS est trop long. Ajouter que les parents peuvent venir. Créneau 16h trop tard ?"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: crmV2.radius,
                border: `1px solid ${crmV2.border}`,
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <CrmV2Button variant="primary" disabled={busy || !draft.trim()} onClick={sendFeedback}>
                Envoyer le retour
              </CrmV2Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {(data.feedback || []).length === 0 && (
                <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucun retour pour l’instant.</div>
              )}
              {(data.feedback || []).map((f) => (
                <div
                  key={f.id}
                  style={{
                    padding: 10,
                    borderRadius: crmV2.radius,
                    border: `1px solid ${crmV2.border}`,
                    background: crmV2.bg,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background:
                          f.status === 'open'
                            ? 'rgba(201,168,76,0.18)'
                            : f.status === 'applied'
                              ? 'rgba(0,189,165,0.14)'
                              : crmV2.bgSoft,
                        color:
                          f.status === 'open' ? '#b45309' : f.status === 'applied' ? '#0f766e' : crmV2.textMuted,
                      }}
                    >
                      {f.status === 'open' ? 'Ouvert' : f.status === 'applied' ? 'Pris en compte' : 'Ignoré'}
                    </span>
                    <span style={{ fontSize: 11, color: crmV2.textFaint }}>
                      {new Date(f.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: crmV2.text, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{f.body}</p>
                  {f.status === 'open' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <CrmV2Button onClick={() => setStatus(f.id, 'applied')}>Marquer pris en compte</CrmV2Button>
                      <CrmV2Button onClick={() => setStatus(f.id, 'dismissed')}>Ignorer</CrmV2Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <style>{`
            @media (max-width: 800px) {
              .event-timeslot-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </>
      )}
    </CrmV2Card>
  )
}
