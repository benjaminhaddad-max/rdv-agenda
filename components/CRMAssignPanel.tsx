'use client'

import { useState, useEffect } from 'react'
import { Users, Briefcase } from 'lucide-react'

const NAVY = '#ffffff'
const GOLD = '#ccac71'
const BLUE = '#4cabdb'

interface RdvUser {
  id: string
  name: string
  role: string
  avatar_color: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface Props {
  dealId: string
  contactName: string
  mode: 'closer' | 'telepro'
  currentCloserHsId?: string | null
  currentTeleproHsId?: string | null
  onClose: () => void
  onAssigned?: () => void
}

export default function CRMAssignPanel({
  dealId, contactName, mode,
  currentCloserHsId, currentTeleproHsId,
  onClose, onAssigned,
}: Props) {
  const [users, setUsers] = useState<RdvUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const role = mode === 'closer' ? 'commercial' : 'telepro'
    fetch(`/api/users?role=${role}`)
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [mode])

  async function handleAssign() {
    if (!selected) return
    const user = users.find(u => u.id === selected)
    if (!user) return

    setSaving(true)
    setError(null)
    try {
      const payload = mode === 'closer'
        ? { hubspot_owner_id: user.hubspot_owner_id }
        : { teleprospecteur: user.hubspot_user_id }

      const res = await fetch(`/api/crm/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Erreur lors de l\'assignation')
        return
      }
      onAssigned?.()
      onClose()
    } catch {
      setError('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const currentHsId = mode === 'closer' ? currentCloserHsId : currentTeleproHsId
  const currentUser = users.find(u =>
    mode === 'closer' ? u.hubspot_owner_id === currentHsId : u.hubspot_user_id === currentHsId
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: NAVY, border: '1px solid #cbd6e2', borderRadius: 16, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#33475b', display: 'flex', alignItems: 'center', gap: 8 }}>
              {mode === 'closer' ? <Briefcase size={16} style={{ color: GOLD }} /> : <Users size={16} style={{ color: BLUE }} />}
              {mode === 'closer' ? 'Assigner un closer' : 'Assigner un télépro'}
            </div>
            <div style={{ fontSize: 12, color: '#7c98b6', marginTop: 2 }}>{contactName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c98b6', fontSize: 20, padding: '2px 6px' }}>✕</button>
        </div>

        {currentUser && (
          <div style={{ background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: BLUE }}>
            Actuellement : <strong>{currentUser.name}</strong>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#7c98b6', fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
            {users.map(user => {
              const isSelected = selected === user.id
              const isCurrent = mode === 'closer'
                ? user.hubspot_owner_id === currentHsId
                : user.hubspot_user_id === currentHsId
              return (
                <button
                  key={user.id}
                  onClick={() => setSelected(user.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isSelected ? 'rgba(204,172,113,0.15)' : '#f5f8fa',
                    border: `1px solid ${isSelected ? GOLD : '#cbd6e2'}`,
                    borderRadius: 10, padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: user.avatar_color || '#4f6ef7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? GOLD : '#33475b' }}>{user.name}</div>
                    {isCurrent && <div style={{ fontSize: 10, color: BLUE, fontWeight: 700 }}>Actuellement assigné</div>}
                  </div>
                  {isSelected && <div style={{ fontSize: 16, color: GOLD }}>✓</div>}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '7px 16px', color: '#7c98b6', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button
            onClick={handleAssign}
            disabled={!selected || saving}
            style={{ background: selected ? GOLD : 'rgba(204,172,113,0.2)', border: 'none', borderRadius: 8, padding: '7px 20px', color: selected ? NAVY : '#3a5070', cursor: selected ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
          >
            {saving ? 'Assignation…' : 'Assigner'}
          </button>
        </div>
      </div>
    </div>
  )
}
