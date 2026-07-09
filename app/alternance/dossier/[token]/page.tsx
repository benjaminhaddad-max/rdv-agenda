'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

const FIELDS: { key: string; label: string; type?: string; options?: string[] }[] = [
  { key: 'nom_usage', label: 'Nom d\'usage' },
  { key: 'adresse_voie', label: 'Adresse' },
  { key: 'code_postal', label: 'Code postal' },
  { key: 'ville', label: 'Ville' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'date_naissance', label: 'Date de naissance', type: 'date' },
  { key: 'sexe', label: 'Sexe', type: 'select', options: ['', 'M', 'F'] },
  { key: 'departement_naissance', label: 'Département de naissance' },
  { key: 'commune_naissance', label: 'Commune de naissance' },
  { key: 'nationalite', label: 'Nationalité' },
  { key: 'nir', label: 'N° sécurité sociale' },
  { key: 'derniere_classe', label: 'Dernière classe suivie' },
  { key: 'diplome_obtenu', label: 'Diplôme obtenu' },
  { key: 'representant_legal_nom', label: 'Représentant légal (si mineur)' },
  { key: 'representant_legal_email', label: 'Email représentant légal' },
]

export default function DossierPublicPage() {
  const params = useParams()
  const token = params.token as string
  const [student, setStudent] = useState<{ nom?: string; prenom?: string; dossier_status?: string } | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/alternance/dossier/${token}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error)
        return r.json()
      })
      .then(data => {
        setStudent(data)
        const f: Record<string, string> = {}
        for (const field of FIELDS) {
          if (data[field.key] != null) f[field.key] = String(data[field.key])
        }
        setForm(f)
        if (data.dossier_status === 'completed' || data.dossier_status === 'validated') setDone(true)
      })
      .catch(e => setError(e.message))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(`/api/alternance/dossier/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) setDone(true)
    else setError((await res.json()).error)
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#fff', padding: 32, borderRadius: 12, maxWidth: 400, textAlign: 'center' }}>
          <p style={{ color: '#ef6b51' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!student) {
    return <div style={{ minHeight: '100vh', background: '#f7f4ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Chargement…</div>
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#fff', padding: 40, borderRadius: 12, maxWidth: 440, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: 16 }} />
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Dossier envoyé</h1>
          <p style={{ color: '#4a6070', fontSize: 14 }}>Merci {student.prenom}. Votre dossier a été transmis à Diploma Santé.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', fontFamily: 'Inter, sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #e5ddc8' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#C9A84C', fontWeight: 600, marginBottom: 4 }}>DIPLOMA SANTÉ — ALTERNANCE</div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Complétez votre dossier</h1>
          <p style={{ color: '#4a6070', fontSize: 14, marginTop: 8 }}>
            Bonjour {student.prenom} {student.nom}, merci de renseigner les informations ci-dessous pour votre contrat d'apprentissage.
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {FIELDS.map(f => (
            <label key={f.key} style={{ fontSize: 13, fontWeight: 500 }}>
              {f.label}
              {f.type === 'select' ? (
                <select
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14 }}
                >
                  <option value="">—</option>
                  {f.options?.filter(Boolean).map(o => <option key={o} value={o}>{o === 'M' ? 'Masculin' : o === 'F' ? 'Féminin' : o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type || 'text'}
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14 }}
                />
              )}
            </label>
          ))}
          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: 8, padding: '12px 20px', background: '#C9A84C', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {saving ? 'Envoi…' : 'Envoyer mon dossier'}
          </button>
        </form>
      </div>
    </div>
  )
}
