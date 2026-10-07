'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import AlternanceShellV2 from '@/components/crm-v2/deal/AlternanceShellV2'
import type { AlternanceCompany } from '@/lib/alternance/types'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Search, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Pagination,
  CrmV2Empty, CrmV2Spinner, CrmV2Drawer, CrmV2CloseButton, CrmV2Field, CrmV2Input,
} from '@/components/crm-v2/primitives'

const PAGE_SIZE = 25

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
  const [page, setPage] = useState(1)
  const isMobile = useIsMobile()

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
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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

  const submit = async () => {
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
  }

  const close = () => { setShowModal(false); setForm({}) }
  const open = (c: AlternanceCompany) => { setForm(c); setShowModal(true) }
  const muted = (v?: string | number | null) => v ? <>{v}</> : <span style={{ color: crmV2.textFaint }}>—</span>

  return (
    <AlternanceShellV2
      title="Entreprises"
      subtitle={`Fiches employeur pour les contrats d'alternance · ${items.length} entreprise${items.length > 1 ? 's' : ''}`}
      actions={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Nouvelle entreprise</CrmV2Button>}
    >
      <CrmV2TableCard
        toolbar={
          <CrmV2Search
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher par raison sociale ou SIRET…"
            style={{ width: isMobile ? '100%' : 320 }}
          />
        }
        footer={filtered.length > 0 ? <CrmV2Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} /> : undefined}
      >
        {loading ? <CrmV2Spinner /> : filtered.length === 0 ? (
          <CrmV2Empty
            icon={<Building2 size={26} />}
            title="Aucune entreprise"
            description="Créez la première fiche employeur."
          />
        ) : isMobile ? (
          <div>
            {pageItems.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => open(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '8px 12px',
                  background: 'none', border: 'none', borderBottom: `1px solid ${crmV2.border}`, textAlign: 'left',
                  fontFamily: 'inherit', cursor: 'pointer', color: crmV2.text,
                }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 10, background: crmV2.bgSoft, color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building2 size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.raison_sociale}</span>
                  <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[c.siret, c.ville, c.email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Raison sociale</CrmV2Th>
                <CrmV2Th>SIRET</CrmV2Th>
                <CrmV2Th>Ville</CrmV2Th>
                <CrmV2Th>E-mail</CrmV2Th>
                <CrmV2Th>OPCO</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(c => (
                <CrmV2Tr key={c.id} onClick={() => open(c)}>
                  <CrmV2Td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: crmV2.bgSoft, color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={14} />
                      </span>
                      <span style={{ color: crmV2.link, fontWeight: 600 }}>{c.raison_sociale}</span>
                    </span>
                  </CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{muted(c.siret)}</CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted }}>{muted(c.ville)}</CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted }}>{muted(c.email)}</CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted }}>{muted(c.opco)}</CrmV2Td>
                </CrmV2Tr>
              ))}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>

      {/* Création / modification d'une entreprise */}
      <CrmV2Drawer
        open={showModal}
        onClose={close}
        width={560}
        header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{form.id ? 'Modifier' : 'Nouvelle'} entreprise</div>
            <CrmV2CloseButton onClick={close} />
          </div>
        }
        footer={
          <>
            <span style={{ flex: 1 }} />
            <CrmV2Button variant="secondary" onClick={close}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
          </>
        }
      >
        <div style={{
          padding: 18, display: 'grid', gap: '14px 16px',
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
        }}>
          {FIELDS.map(f => (
            <CrmV2Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} span={f.key === 'raison_sociale' ? 2 : 1}>
              <CrmV2Input
                value={String(form[f.key] ?? '')}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
            </CrmV2Field>
          ))}
        </div>
      </CrmV2Drawer>
    </AlternanceShellV2>
  )
}
