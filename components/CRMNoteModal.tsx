'use client'

import { useState } from 'react'
import { CheckCircle2, StickyNote } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Textarea } from './crm-v2/primitives'
import { CrmV2ModalHeader, CrmV2ModalShell, CrmV2Notice } from './crm-v2/modals/ModalShell'

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
    <CrmV2ModalShell
      onClose={onClose}
      zIndex={600}
      header={<CrmV2ModalHeader title="Ajouter une note" subtitle={contactName} icon={<StickyNote size={16} />} onClose={onClose} />}
      footer={saved ? undefined : (
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={handleSave} disabled={saving || !note.trim()}>
            {saving ? 'Envoi…' : 'Ajouter'}
          </CrmV2Button>
        </>
      )}
    >
      {error && <CrmV2Notice tone="error" style={{ marginBottom: 14 }}>{error}</CrmV2Notice>}

      {saved ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0', color: crmV2.successStrong, fontSize: 14, fontWeight: 700 }}>
          <CheckCircle2 size={18} /> Note ajoutée
        </div>
      ) : (
        <CrmV2Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Contenu de la note..."
          rows={5}
          autoFocus
          style={{ minHeight: 120 }}
        />
      )}
    </CrmV2ModalShell>
  )
}
