'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Copy, Send } from 'lucide-react'
import AlternanceShell, { AlternanceBtn, AlternanceCard, EmptyState, StatusPill } from '@/components/alternance/AlternanceShell'
import { STUDENT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceStudent } from '@/lib/alternance/types'

export default function EtudiantsPage() {
  const [items, setItems] = useState<AlternanceStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nom: '', prenom: '', email: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const url = filter ? `/api/alternance/students?status=${filter}` : '/api/alternance/students'
    const res = await fetch(url)
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.nom || !form.prenom || !form.email) return alert('Tous les champs sont requis')
    setSaving(true)
    const res = await fetch('/api/alternance/students', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) { setShowModal(false); setForm({ nom: '', prenom: '', email: '' }); load() }
    else alert((await res.json()).error)
  }

  const sendLink = async (id: string) => {
    const res = await fetch(`/api/alternance/students/${id}/send-link`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) return alert(data.error)
    if (data.email_sent) {
      alert(`Email envoyé à ${data.email}`)
    } else {
      await navigator.clipboard.writeText(data.dossier_url)
      alert(`Email non envoyé (${data.email_error || 'BREVO non configuré'}).\nLien copié :\n${data.dossier_url}`)
    }
    load()
  }

  const validate = async (id: string) => {
    if (!confirm('Valider ce dossier étudiant ?')) return
    const res = await fetch(`/api/alternance/students/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dossier_status: 'validated' }),
    })
    if (res.ok) load()
    else alert((await res.json()).error)
  }

  return (
    <AlternanceShell
      title="Étudiants"
      subtitle="Création et suivi des dossiers apprentis"
      actions={<AlternanceBtn onClick={() => setShowModal(true)}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Nouvel étudiant</AlternanceBtn>}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', 'pending', 'link_sent', 'completed', 'validated'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${filter === s ? '#C9A84C' : '#e5ddc8'}`,
              background: filter === s ? 'rgba(204,172,113,0.15)' : '#fff',
            }}
          >
            {s === '' ? 'Tous' : STUDENT_STATUS_META[s as keyof typeof STUDENT_STATUS_META]?.label}
          </button>
        ))}
      </div>

      {loading ? <p>Chargement…</p> : items.length === 0 ? (
        <EmptyState message="Aucun étudiant. Créez un dossier avec nom, prénom et email." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(s => {
            const meta = STUDENT_STATUS_META[s.dossier_status]
            return (
              <AlternanceCard key={s.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.prenom} {s.nom}</div>
                    <div style={{ fontSize: 12, color: '#4a6070' }}>{s.email}</div>
                  </div>
                  <StatusPill label={meta.label} color={meta.color} bg={meta.bg} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {s.dossier_status !== 'validated' && (
                    <AlternanceBtn variant="secondary" onClick={() => sendLink(s.id)}>
                      <Send size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                      {s.dossier_status === 'link_sent' ? 'Renvoyer lien' : 'Envoyer lien'}
                    </AlternanceBtn>
                  )}
                  {s.dossier_status === 'completed' && (
                    <AlternanceBtn onClick={() => validate(s.id)}>Valider dossier</AlternanceBtn>
                  )}
                </div>
              </AlternanceCard>
            )
          })}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400 }}>
            <h2 style={{ margin: '0 0 16px' }}>Nouvel étudiant</h2>
            {(['nom', 'prenom', 'email'] as const).map(k => (
              <label key={k} style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
                {k === 'nom' ? 'Nom' : k === 'prenom' ? 'Prénom' : 'Email'}
                <input
                  value={form[k]}
                  onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6 }}
                />
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <AlternanceBtn variant="secondary" onClick={() => setShowModal(false)}>Annuler</AlternanceBtn>
              <AlternanceBtn onClick={create} disabled={saving}>{saving ? '…' : 'Créer'}</AlternanceBtn>
            </div>
          </div>
        </div>
      )}
    </AlternanceShell>
  )
}
