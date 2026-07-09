'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import AlternanceShell, { AlternanceBtn, AlternanceCard, EmptyState, StatusPill } from '@/components/alternance/AlternanceShell'
import { CONTRACT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceCompany, AlternanceContract, AlternanceStudent } from '@/lib/alternance/types'

export default function ContratsPage() {
  const [items, setItems] = useState<AlternanceContract[]>([])
  const [companies, setCompanies] = useState<AlternanceCompany[]>([])
  const [students, setStudents] = useState<AlternanceStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ company_id: '', student_id: '', date_debut: '', date_fin: '', formation: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, coRes, sRes] = await Promise.all([
      fetch('/api/alternance/contracts'),
      fetch('/api/alternance/companies'),
      fetch('/api/alternance/students?status=validated'),
    ])
    setItems(await cRes.json())
    setCompanies(await coRes.json())
    setStudents(await sRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.company_id || !form.student_id) return alert('Sélectionnez entreprise et étudiant')
    setSaving(true)
    const res = await fetch('/api/alternance/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      setShowModal(false)
      window.location.href = `/admin/crm/alternance/contrats/${data.id}`
    } else alert((await res.json()).error)
  }

  return (
    <AlternanceShell
      title="Contrats"
      subtitle="Création et suivi des contrats d'apprentissage"
      actions={<AlternanceBtn onClick={() => setShowModal(true)}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Nouveau contrat</AlternanceBtn>}
    >
      {loading ? <p>Chargement…</p> : items.length === 0 ? (
        <EmptyState message="Aucun contrat. Créez-en un à partir d'une entreprise et d'un étudiant validé." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(c => {
            const meta = CONTRACT_STATUS_META[c.status]
            const company = (c as { company?: { raison_sociale?: string } }).company
            const student = (c as { student?: { prenom?: string; nom?: string } }).student
            return (
              <Link key={c.id} href={`/admin/crm/alternance/contrats/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <AlternanceCard>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{student?.prenom} {student?.nom}</div>
                      <div style={{ fontSize: 12, color: '#4a6070' }}>{company?.raison_sociale}</div>
                      {c.date_debut && <div style={{ fontSize: 11, color: '#4a6070', marginTop: 4 }}>{c.date_debut} → {c.date_fin || '…'}</div>}
                    </div>
                    <StatusPill label={meta.label} color={meta.color} bg={meta.bg} />
                  </div>
                </AlternanceCard>
              </Link>
            )
          })}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440 }}>
            <h2 style={{ margin: '0 0 16px' }}>Nouveau contrat</h2>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
              Entreprise *
              <select value={form.company_id} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6 }}>
                <option value="">— Choisir —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.raison_sociale}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
              Étudiant validé *
              <select value={form.student_id} onChange={e => setForm(p => ({ ...p, student_id: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6 }}>
                <option value="">— Choisir —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.prenom} {s.nom}</option>)}
              </select>
            </label>
            {students.length === 0 && <p style={{ fontSize: 11, color: '#ef6b51' }}>Aucun étudiant validé. Validez d'abord un dossier.</p>}
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
              Date début <input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
              Date fin <input type="date" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
              Formation <input value={form.formation} onChange={e => setForm(p => ({ ...p, formation: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6 }} />
            </label>
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
