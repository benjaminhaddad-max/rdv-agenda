'use client'

import { useState, useEffect } from 'react'
import { Users, Briefcase, Check } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Avatar, CrmV2Button, CrmV2Spinner } from './crm-v2/primitives'
import { CrmV2ModalHeader, CrmV2ModalShell, CrmV2Notice, crmV2LabelStyle } from './crm-v2/modals/ModalShell'

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
    const role = mode === 'closer' ? 'closer' : 'telepro'
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
    <CrmV2ModalShell
      onClose={onClose}
      zIndex={600}
      width={440}
      header={
        <CrmV2ModalHeader
          title={mode === 'closer' ? 'Assigner un closer' : 'Assigner un télépro'}
          subtitle={contactName}
          icon={mode === 'closer' ? <Briefcase size={16} /> : <Users size={16} />}
          onClose={onClose}
        />
      }
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={handleAssign} disabled={!selected || saving}>
            {saving ? 'Assignation…' : 'Assigner'}
          </CrmV2Button>
        </>
      }
    >
      {currentUser && (
        <CrmV2Notice tone="info" style={{ marginBottom: 14 }}>
          Actuellement : <strong>{currentUser.name}</strong>
        </CrmV2Notice>
      )}

      {error && <CrmV2Notice tone="error" style={{ marginBottom: 14 }}>{error}</CrmV2Notice>}

      <div style={{ ...crmV2LabelStyle, marginBottom: 8 }}>{mode === 'closer' ? 'Closers' : 'Télépros'}</div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><CrmV2Spinner /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map(user => {
            const isSelected = selected === user.id
            const isCurrent = mode === 'closer'
              ? user.hubspot_owner_id === currentHsId
              : user.hubspot_user_id === currentHsId
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelected(user.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 48,
                  background: isSelected ? crmV2.goldSoft : crmV2.bg,
                  border: `1px solid ${isSelected ? crmV2.gold : crmV2.border}`,
                  borderRadius: 12, padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >
                <CrmV2Avatar name={user.name} color={user.avatar_color || crmV2.goldGradient} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? crmV2.goldDark : crmV2.text }}>{user.name}</div>
                  {isCurrent && <div style={{ fontSize: 11, color: crmV2.link, fontWeight: 700 }}>Actuellement assigné</div>}
                </div>
                {isSelected && <Check size={16} color={crmV2.gold} />}
              </button>
            )
          })}
        </div>
      )}
    </CrmV2ModalShell>
  )
}
