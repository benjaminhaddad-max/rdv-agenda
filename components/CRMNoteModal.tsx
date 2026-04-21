'use client'

import { useState } from 'react'

const NAVY = '#ffffff'
const GOLD = '#ccac71'
const BLUE = '#4cabdb'

interface Props {
  dealId: string
  contactName: string
  onClose: () => void
  onSaved?: () => void
}

export default function CRMNoteModal({ dealId, contactName, onClose, onSaved }: Props) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!note.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Erreur lors de la sauvegarde')
        return
      }
      setSaved(true)
      setTimeout(() => { onSaved?.(); onClose() }, 1200)
    } catch {
      setError('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: NAVY, border: '1px solid #cbd6e2', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#33475b' }}>📝 Ajouter une note</div>
            <div style={{ fontSize: 12, color: '#7c98b6', marginTop: 2 }}>{contactName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c98b6', fontSize: 20, padding: '2px 6px' }}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {saved ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#22c55e', fontSize: 14, fontWeight: 700 }}>
            ✓ Note ajoutée dans HubSpot
          </div>
        ) : (
          <>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Contenu de la note..."
              rows={5}
              autoFocus
              style={{
                width: '100%', background: '#ffffff', border: '1px solid #cbd6e2',
                borderRadius: 8, padding: '10px 12px', color: '#33475b', fontSize: 13,
                outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = GOLD}
              onBlur={e => e.currentTarget.style.borderColor = '#cbd6e2'}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '7px 16px', color: '#7c98b6', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !note.trim()}
                style={{ background: note.trim() ? BLUE : 'rgba(76,171,219,0.2)', border: 'none', borderRadius: 8, padding: '7px 20px', color: note.trim() ? '#fff' : '#cbd6e2', cursor: note.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
              >
                {saving ? 'Envoi…' : '📝 Ajouter dans HubSpot'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
