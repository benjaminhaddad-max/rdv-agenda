'use client'

import { useEffect, useState, useCallback } from 'react'
import { Send, Loader2, Trash2, MessageSquare, Plus, AlertCircle, CheckCircle2, Users } from 'lucide-react'

const SMS_SENDERS = [
  { value: 'DiploSante', label: 'DiploSante' },
  { value: 'Diploma',    label: 'Diploma' },
  { value: 'PrepaMed',   label: 'PrepaMed' },
  { value: 'Edumove',    label: 'Edumove' },
  { value: 'PASS-LAS',   label: 'PASS-LAS' },
]

const CLASSE_OPTIONS = ['', 'Terminale', 'Première', 'Seconde', 'PASS', 'LSPS 1', 'LSPS 2', 'LAS 1', 'LAS 2', 'Etudes médicales']
const FORMATION_OPTIONS = ['', 'PASS', 'LSPS', 'LAS', 'P-1', 'P-2']

type Campaign = {
  id: string
  name: string
  message: string
  sender: string
  status: string
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  sent_count: number
  failed_count: number
  segments_used: number
  filters: Record<string, string>
  manual_contact_ids: string[]
  created_at: string
}

export default function SMSFactorPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sms-campaigns?limit=50')
      const j = await res.json()
      setCampaigns(j.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>SMS Factor</h1>
            <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
              Lance des campagnes SMS depuis le CRM. Senders pré-validés, variables dynamiques, tracking par destinataire.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: '10px 18px', borderRadius: 8,
              background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff',
              fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Nouvelle campagne SMS
          </button>
        </div>

        {error && <div style={banner('error')}><AlertCircle size={16} /> {error}</div>}
        {success && <div style={banner('success')}><CheckCircle2 size={16} /> {success}</div>}

        {creating && (
          <NewCampaignModal
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false)
              setSuccess('Campagne créée')
              load()
            }}
          />
        )}

        {/* Liste des campagnes */}
        {loading ? (
          <div style={card({ padding: 40, textAlign: 'center' })}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div style={card({ padding: 40, textAlign: 'center' })}>
            <MessageSquare size={36} style={{ color: '#94a3b8', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Aucune campagne SMS</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Clique sur « Nouvelle campagne SMS » pour démarrer.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.map(c => (
              <CampaignRow key={c.id} campaign={c} onChange={load} />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

// ─── Campaign Row ──────────────────────────────────────────────────────────

function CampaignRow({ campaign, onChange }: { campaign: Campaign; onChange: () => void }) {
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function handleSend() {
    if (!confirm(`Lancer l'envoi de la campagne "${campaign.name}" ? Cette action ne peut pas être annulée.`)) return
    setSending(true)
    try {
      const res = await fetch(`/api/sms-campaigns/${campaign.id}/send`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      alert(`Envoi terminé : ${j.sent}/${j.valid} envoyés, ${j.failed} échecs, ${j.skipped} ignorés. ${j.segments_used} segments facturés.`)
      onChange()
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSending(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer la campagne "${campaign.name}" ?`)) return
    await fetch(`/api/sms-campaigns/${campaign.id}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div style={card({ padding: 14 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{campaign.name}</strong>
            <StatusBadge status={campaign.status} />
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              {new Date(campaign.created_at).toLocaleString('fr-FR')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, lineHeight: 1.5 }}>
            {expanded ? campaign.message : (campaign.message.length > 140 ? campaign.message.slice(0, 140) + '…' : campaign.message)}
            {campaign.message.length > 140 && (
              <button onClick={() => setExpanded(e => !e)} style={{ marginLeft: 6, background: 'none', border: 'none', color: '#2ea3f2', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                {expanded ? 'Réduire' : 'Voir tout'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', flexWrap: 'wrap' }}>
            <span><strong>Sender:</strong> {campaign.sender}</span>
            {campaign.status === 'sent' ? (
              <>
                <span><Users size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {campaign.sent_count}/{campaign.total_recipients} envoyés</span>
                {campaign.failed_count > 0 && <span style={{ color: '#dc2626' }}>{campaign.failed_count} échecs</span>}
                <span>{campaign.segments_used} segments</span>
              </>
            ) : (
              <span>
                {campaign.manual_contact_ids?.length > 0
                  ? `${campaign.manual_contact_ids.length} contacts ciblés`
                  : campaign.filters && Object.keys(campaign.filters).length > 0
                    ? `Filtres : ${Object.entries(campaign.filters).map(([k, v]) => `${k}=${v}`).join(', ')}`
                    : 'Aucun ciblage défini'}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <button onClick={handleSend} disabled={sending} style={btn('primary')}>
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          )}
          {campaign.status !== 'sending' && (
            <button onClick={handleDelete} style={btn('danger')}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    draft:     { color: '#64748b', label: 'Brouillon' },
    scheduled: { color: '#f59e0b', label: 'Programmée' },
    sending:   { color: '#2ea3f2', label: 'En cours…' },
    sent:      { color: '#22c55e', label: 'Envoyée' },
    failed:    { color: '#dc2626', label: 'Échec' },
    paused:    { color: '#94a3b8', label: 'Pause' },
    archived:  { color: '#94a3b8', label: 'Archivée' },
  }
  const m = map[status] || { color: '#94a3b8', label: status }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: m.color + '22', color: m.color, fontSize: 10, fontWeight: 600,
    }}>
      {m.label}
    </span>
  )
}

// ─── New Campaign Modal ────────────────────────────────────────────────────

function NewCampaignModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [sender, setSender] = useState('DiploSante')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [manualIds, setManualIds] = useState('')
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimate, setEstimate] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Estime le nombre de destinataires en temps réel
  useEffect(() => {
    const ids = manualIds.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 0) {
      setEstimate(ids.length)
      return
    }
    if (Object.keys(filters).length === 0) {
      setEstimate(0)
      return
    }
    setEstimateLoading(true)
    const params = new URLSearchParams()
    if (filters.classe_actuelle) params.set('classe', filters.classe_actuelle)
    if (filters.formation_souhaitee) params.set('formation', filters.formation_souhaitee)
    params.set('limit', '0')
    fetch(`/api/crm/contacts?${params.toString()}`)
      .then(r => r.json())
      .then(d => setEstimate(d.total ?? 0))
      .catch(() => setEstimate(null))
      .finally(() => setEstimateLoading(false))
  }, [filters, manualIds])

  const segments = estimateSegments(message)
  const charCount = [...message].length

  async function handleSubmit() {
    setErr(null)
    if (!name.trim()) return setErr('Le nom est requis')
    if (!message.trim()) return setErr('Le message est requis')
    setSubmitting(true)
    try {
      const ids = manualIds.split(',').map(s => s.trim()).filter(Boolean)
      const res = await fetch('/api/sms-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, message, sender,
          filters: ids.length > 0 ? {} : filters,
          manual_contact_ids: ids,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #2ea3f2, #0038f0)',
          color: '#fff', borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Nouvelle campagne SMS</div>
          <div style={{ fontSize: 11, opacity: 0.9 }}>Variables disponibles : {'{firstname}'}, {'{prenom}'}</div>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nom de la campagne (interne)">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Relance pré-inscrits PASS - mai 2025"
              style={input}
            />
          </Field>

          <Field label="Sender">
            <select value={sender} onChange={e => setSender(e.target.value)} style={input}>
              {SMS_SENDERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
              Tous les senders sont pré-validés chez SMS Factor.
            </div>
          </Field>

          <Field label="Message">
            <textarea
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Bonjour {firstname}, je vous recontacte au sujet de votre inscription chez Diploma Santé…"
              rows={5}
              style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', marginTop: 4 }}>
              <span>{charCount} caractères</span>
              <span>{segments} segment{segments > 1 ? 's' : ''} facturé{segments > 1 ? 's' : ''}</span>
              {segments > 3 && <span style={{ color: '#f59e0b' }}>⚠️ Coût élevé</span>}
            </div>
          </Field>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
              Ciblage
            </div>

            <Field label="Liste de contact_id (séparés par virgule)">
              <textarea
                value={manualIds} onChange={e => setManualIds(e.target.value)}
                placeholder="123456789, 987654321"
                rows={2}
                style={{ ...input, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
              />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                Si rempli, prioritaire sur les filtres ci-dessous.
              </div>
            </Field>

            {!manualIds.trim() && (
              <>
                <Field label="Classe actuelle">
                  <select
                    value={filters.classe_actuelle || ''}
                    onChange={e => setFilters(f => ({ ...f, classe_actuelle: e.target.value }))}
                    style={input}
                  >
                    {CLASSE_OPTIONS.map(o => <option key={o} value={o}>{o || '— Toutes —'}</option>)}
                  </select>
                </Field>

                <Field label="Formation souhaitée">
                  <select
                    value={filters.formation_souhaitee || ''}
                    onChange={e => setFilters(f => ({ ...f, formation_souhaitee: e.target.value }))}
                    style={input}
                  >
                    {FORMATION_OPTIONS.map(o => <option key={o} value={o}>{o || '— Toutes —'}</option>)}
                  </select>
                </Field>
              </>
            )}

            <div style={{
              padding: 10, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe',
              fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
            }}>
              <Users size={13} />
              {estimateLoading ? (
                <>Calcul des destinataires…</>
              ) : estimate !== null ? (
                <>
                  <strong>{estimate.toLocaleString('fr-FR')}</strong> destinataire{estimate > 1 ? 's' : ''} estimé{estimate > 1 ? 's' : ''}
                  {' · '}<strong>{(estimate * segments * 0.05).toFixed(2)} €</strong> coût estimé (à 0.05 €/segment)
                </>
              ) : (
                <>Définissez un ciblage pour estimer</>
              )}
            </div>
          </div>

          {err && <div style={{ color: '#dc2626', fontSize: 12 }}>{err}</div>}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={btn('secondary')} disabled={submitting}>
            Annuler
          </button>
          <button onClick={handleSubmit} style={btn('primary')} disabled={submitting}>
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Créer la campagne
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function estimateSegments(text: string): number {
  const len = [...text].length
  if (len === 0) return 0
  if (len <= 70) return 1
  return Math.ceil(len / 67)
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: '#fff', border: '1px solid #cbd6e2', borderRadius: 10, ...extra }
}
function banner(kind: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '10px 14px',
    background: kind === 'error' ? '#fef2f2' : '#f0fdf4',
    border: `1px solid ${kind === 'error' ? '#fecaca' : '#bbf7d0'}`,
    borderRadius: 8,
    color: kind === 'error' ? '#dc2626' : '#166534',
    fontSize: 13, marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
  }
}
function btn(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4, border: 'none',
  }
  if (variant === 'primary') return { ...base, background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }
  if (variant === 'danger') return { ...base, background: '#fee2e2', color: '#dc2626' }
  return { ...base, background: '#f1f5f9', color: '#516f90', border: '1px solid #cbd6e2' }
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 13,
  width: '100%', boxSizing: 'border-box', background: '#fff',
}
