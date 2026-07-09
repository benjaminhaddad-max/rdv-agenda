'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileDown } from 'lucide-react'
import AlternanceShell, { AlternanceBtn, AlternanceCard, StatusPill } from '@/components/alternance/AlternanceShell'
import { CONTRACT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceContract, AlternanceDocument } from '@/lib/alternance/types'

const CONTRACT_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: 'date_signature', label: 'Date signature', type: 'date' },
  { key: 'date_debut', label: 'Date début', type: 'date' },
  { key: 'date_fin', label: 'Date fin', type: 'date' },
  { key: 'duree_hebdo_heures', label: 'Durée hebdo (h)', type: 'number' },
  { key: 'salaire_brut', label: 'Salaire brut', type: 'number' },
  { key: 'pourcentage_smic', label: '% SMIC', type: 'number' },
  { key: 'type_contrat', label: 'Type contrat' },
  { key: 'diplome_prepare', label: 'Diplôme préparé' },
  { key: 'code_rncp', label: 'Code RNCP' },
  { key: 'formation', label: 'Formation' },
  { key: 'cfa_nom', label: 'CFA' },
  { key: 'cfa_uai', label: 'UAI CFA' },
  { key: 'cfa_duree_heures', label: 'Durée formation (h)', type: 'number' },
  { key: 'caisse_retraite', label: 'Caisse retraite' },
] 

export default function ContratDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [contract, setContract] = useState<AlternanceContract | null>(null)
  const [docs, setDocs] = useState<AlternanceDocument[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/alternance/contracts/${id}`).then(r => r.json()),
      fetch(`/api/alternance/documents?contract_id=${id}`).then(r => r.json()),
    ]).then(([c, d]) => {
      setContract(c)
      setDocs(Array.isArray(d) ? d : [])
      const f: Record<string, string> = {}
      for (const field of CONTRACT_FIELDS) {
        const v = (c as Record<string, unknown>)[field.key]
        if (v != null) f[field.key] = String(v)
      }
      setForm(f)
    })
  }, [id])

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/alternance/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) setContract(await res.json())
    else alert((await res.json()).error)
  }

  const generateCerfa = async () => {
    setGenerating(true)
    const res = await fetch(`/api/alternance/contracts/${id}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template_key: 'cerfa_10103_14' }),
    })
    setGenerating(false)
    const data = await res.json()
    if (res.ok) {
      if (data.download_url) window.open(data.download_url, '_blank')
      const dRes = await fetch(`/api/alternance/documents?contract_id=${id}`)
      setDocs(await dRes.json())
    } else alert(data.error)
  }

  const downloadDoc = async (docId: string) => {
    const res = await fetch(`/api/alternance/documents/${docId}/download`)
    const data = await res.json()
    if (res.ok && data.url) window.open(data.url, '_blank')
    else alert(data.error || 'Erreur téléchargement')
  }

  if (!contract) return <AlternanceShell title="Contrat"><p>Chargement…</p></AlternanceShell>

  const meta = CONTRACT_STATUS_META[contract.status]
  const company = contract.company as { raison_sociale?: string } | undefined
  const student = contract.student as { prenom?: string; nom?: string; email?: string } | undefined

  return (
    <AlternanceShell
      title={`${student?.prenom} ${student?.nom} — ${company?.raison_sociale}`}
      subtitle="Détail du contrat d'apprentissage"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <AlternanceBtn variant="secondary" onClick={generateCerfa} disabled={generating}>
            <FileDown size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {generating ? 'Génération…' : 'Générer CERFA'}
          </AlternanceBtn>
          <AlternanceBtn onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</AlternanceBtn>
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <StatusPill label={meta.label} color={meta.color} bg={meta.bg} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AlternanceCard>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Informations contrat</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {CONTRACT_FIELDS.map(f => (
              <label key={f.key} style={{ fontSize: 12 }}>
                {f.label}
                <input
                  type={f.type || 'text'}
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 13 }}
                />
              </label>
            ))}
          </div>
        </AlternanceCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AlternanceCard>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Employeur</h3>
            <p style={{ margin: 0, fontSize: 13 }}>{company?.raison_sociale}</p>
          </AlternanceCard>
          <AlternanceCard>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Apprenti</h3>
            <p style={{ margin: 0, fontSize: 13 }}>{student?.prenom} {student?.nom}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4a6070' }}>{student?.email}</p>
          </AlternanceCard>
          <AlternanceCard>
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Documents ({docs.length})</h3>
            {docs.length === 0 ? (
              <p style={{ fontSize: 12, color: '#4a6070' }}>Aucun document. Générez le CERFA ou ajoutez des pièces.</p>
            ) : (
              docs.map(d => (
                <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0ebe0', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{d.label}</strong>
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#4a6070' }}>{d.doc_type}{d.generated ? ' (auto)' : ''}</span>
                  </div>
                  {d.file_url && (
                    <button
                      onClick={() => downloadDoc(d.id)}
                      style={{ fontSize: 11, color: '#C9A84C', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Télécharger
                    </button>
                  )}
                </div>
              ))
            )}
          </AlternanceCard>
        </div>
      </div>
    </AlternanceShell>
  )
}
