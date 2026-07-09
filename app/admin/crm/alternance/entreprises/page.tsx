'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import AlternanceShell, { AlternanceBtn, AlternanceCard, EmptyState } from '@/components/alternance/AlternanceShell'
import type { AlternanceCompany } from '@/lib/alternance/types'

const FIELDS: { key: keyof AlternanceCompany; label: string; required?: boolean }[] = [
  { key: 'raison_sociale', label: 'Raison sociale', required: true },
  { key: 'siret', label: 'SIRET' },
  { key: 'siren', label: 'SIREN' },
  { key: 'adresse_voie', label: 'Adresse' },
  { key: 'code_postal', label: 'Code postal' },
  { key: 'ville', label: 'Ville' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'email', label: 'Email' },
  { key: 'code_ape', label: 'Code APE' },
  { key: 'convention_collective', label: 'Convention collective' },
  { key: 'code_idcc', label: 'Code IDCC' },
  { key: 'opco', label: 'OPCO' },
  { key: 'effectif', label: 'Effectif' },
  { key: 'representant_legal_nom', label: 'Représentant légal' },
  { key: 'representant_legal_fonction', label: 'Fonction représentant' },
  { key: 'signataire_nom', label: 'Signataire' },
  { key: 'maitre1_nom', label: 'Maître 1 — Nom' },
  { key: 'maitre1_prenom', label: 'Maître 1 — Prénom' },
  { key: 'maitre1_email', label: 'Maître 1 — Email' },
]

export default function EntreprisesPage() {
  const [items, setItems] = useState<AlternanceCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<Partial<AlternanceCompany>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/alternance/companies')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.raison_sociale.toLowerCase().includes(q) || (c.siret ?? '').includes(q)
  })

  const save = async () => {
    if (!form.raison_sociale?.trim()) return alert('Raison sociale requise')
    setSaving(true)
    const res = await fetch('/api/alternance/companies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) { setShowModal(false); setForm({}); load() }
    else alert((await res.json()).error)
  }

  return (
    <AlternanceShell
      title="Entreprises"
      subtitle="Fiches employeur pour les contrats d'alternance"
      actions={<AlternanceBtn onClick={() => setShowModal(true)}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Nouvelle entreprise</AlternanceBtn>}
    >
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: '#4a6070' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par raison sociale ou SIRET…"
          style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 13 }}
        />
      </div>

      {loading ? <p>Chargement…</p> : filtered.length === 0 ? (
        <EmptyState message="Aucune entreprise. Créez la première fiche employeur." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(c => (
            <AlternanceCard key={c.id} style={{ cursor: 'pointer' }} >
              <div onClick={() => { setForm(c); setShowModal(true) }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.raison_sociale}</div>
                <div style={{ fontSize: 12, color: '#4a6070', marginTop: 4 }}>
                  {[c.siret, c.ville, c.email].filter(Boolean).join(' · ')}
                </div>
              </div>
            </AlternanceCard>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560, maxHeight: '85vh', overflow: 'auto' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>{form.id ? 'Modifier' : 'Nouvelle'} entreprise</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {FIELDS.map(f => (
                <label key={f.key} style={{ fontSize: 12 }}>
                  {f.label}{f.required && ' *'}
                  <input
                    value={String(form[f.key] ?? '')}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 13 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <AlternanceBtn variant="secondary" onClick={() => { setShowModal(false); setForm({}) }}>Annuler</AlternanceBtn>
              <AlternanceBtn onClick={async () => {
                if (form.id) {
                  setSaving(true)
                  const res = await fetch(`/api/alternance/companies/${form.id}`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(form),
                  })
                  setSaving(false)
                  if (res.ok) { setShowModal(false); setForm({}); load() }
                  else alert((await res.json()).error)
                } else save()
              }} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</AlternanceBtn>
            </div>
          </div>
        </div>
      )}
    </AlternanceShell>
  )
}
