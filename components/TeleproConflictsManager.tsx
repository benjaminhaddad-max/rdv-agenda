'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, AlertTriangle, RefreshCw, Check } from 'lucide-react'

interface TeleproRef {
  id: string
  name: string
  avatar_color?: string | null
}

interface ConflictRow {
  id: string
  hubspot_contact_id: string
  appointment_id: string | null
  status: string
  created_at: string
  existing_telepro: TeleproRef | null
  new_telepro: TeleproRef | null
  contact: { firstname?: string | null; lastname?: string | null; email?: string | null; phone?: string | null } | null
}

export default function TeleproConflictsManager() {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/telepro-conflicts?status=pending')
      const data = await res.json()
      setConflicts(data?.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function resolve(conflictId: string, teleproId: string) {
    setResolving(conflictId)
    try {
      const res = await fetch(`/api/crm/telepro-conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telepro_id: teleproId }),
      })
      if (res.ok) {
        setConflicts(prev => prev.filter(c => c.id !== conflictId))
      }
    } finally {
      setResolving(null)
    }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ padding: '24px 28px', minWidth: 540, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c6aa7c', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
            Doublon télépro
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#12314d', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="#c6aa7c" /> Arbitrer les attributions
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 8,
            padding: '6px 12px', color: '#5b6b7a', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Chargement…</div>
      ) : conflicts.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: '#5b6b7a', fontSize: 14, background: '#f6f9fc', borderRadius: 10 }}>
          Aucun doublon télépro à arbitrer.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflicts.map(c => {
            const contactName = [c.contact?.firstname, c.contact?.lastname].filter(Boolean).join(' ') || c.contact?.email || c.hubspot_contact_id
            return (
              <div key={c.id} style={{ border: '1px solid #f0d28a', background: '#fff8e6', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#12314d', fontSize: 15 }}>{contactName}</div>
                    {c.contact?.email && (
                      <div style={{ fontSize: 12, color: '#5b6b7a' }}>{c.contact.email}{c.contact.phone ? ` · ${c.contact.phone}` : ''}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#8a6e3a' }}>{fmtDate(c.created_at)}</div>
                </div>

                <div style={{ fontSize: 12, color: '#6b5630', marginBottom: 12, lineHeight: 1.5 }}>
                  À qui doit être attribué ce contact ?
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    onClick={() => c.existing_telepro && resolve(c.id, c.existing_telepro.id)}
                    disabled={resolving === c.id || !c.existing_telepro}
                    style={{
                      background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8,
                      padding: '10px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                      color: '#12314d', display: 'flex', flexDirection: 'column', gap: 2,
                      opacity: resolving === c.id ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Télépro actuel sur la fiche</span>
                    <span style={{ fontWeight: 700 }}>{c.existing_telepro?.name || '— inconnu —'}</span>
                  </button>
                  <button
                    onClick={() => c.new_telepro && resolve(c.id, c.new_telepro.id)}
                    disabled={resolving === c.id || !c.new_telepro}
                    style={{
                      background: '#12314d', border: '1px solid #12314d', borderRadius: 8,
                      padding: '10px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                      color: '#ffffff', display: 'flex', flexDirection: 'column', gap: 2,
                      opacity: resolving === c.id ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#a8c4dd', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Télépro qui a pris le RDV</span>
                    <span style={{ fontWeight: 700 }}>{c.new_telepro?.name || '— inconnu —'}</span>
                  </button>
                </div>

                {resolving === c.id && (
                  <div style={{ fontSize: 11, color: '#8a6e3a', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Check size={11} /> Attribution en cours…
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
