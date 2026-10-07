'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Send, GraduationCap, CheckCircle } from 'lucide-react'
import AlternanceShellV2 from '@/components/crm-v2/deal/AlternanceShellV2'
import { STUDENT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceStudent } from '@/lib/alternance/types'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2PillTabs, CrmV2Search, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Pagination, CrmV2Empty, CrmV2Spinner, CrmV2StatusPill, CrmV2Avatar, CrmV2Drawer, CrmV2CloseButton,
  CrmV2Field, CrmV2Input,
} from '@/components/crm-v2/primitives'

const PAGE_SIZE = 25
const STATUS_FILTERS = ['', 'pending', 'link_sent', 'completed', 'validated'] as const

export default function EtudiantsPage() {
  const [items, setItems] = useState<AlternanceStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nom: '', prenom: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const isMobile = useIsMobile()

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(s => `${s.prenom} ${s.nom} ${s.email}`.toLowerCase().includes(q))
  }, [items, search])
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Actions d'une ligne (envoyer le lien, valider le dossier)
  const rowActions = (s: AlternanceStudent) => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {s.dossier_status !== 'validated' && (
        <CrmV2Button variant="secondary" size="sm" icon={<Send size={13} />} onClick={() => sendLink(s.id)}>
          {s.dossier_status === 'link_sent' ? 'Renvoyer lien' : 'Envoyer lien'}
        </CrmV2Button>
      )}
      {s.dossier_status === 'completed' && (
        <CrmV2Button variant="primary" size="sm" icon={<CheckCircle size={13} />} onClick={() => validate(s.id)}>Valider dossier</CrmV2Button>
      )}
    </div>
  )

  return (
    <AlternanceShellV2
      title="Étudiants"
      subtitle="Création et suivi des dossiers apprentis"
      actions={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Nouvel étudiant</CrmV2Button>}
    >
      <CrmV2TableCard
        toolbar={
          <>
            <CrmV2Search
              placeholder="Rechercher un étudiant…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ width: isMobile ? '100%' : 260 }}
            />
            <CrmV2PillTabs
              items={STATUS_FILTERS.map(s => ({
                id: s,
                label: s === '' ? 'Tous' : STUDENT_STATUS_META[s].label,
              }))}
              value={filter}
              onChange={v => { setFilter(v); setPage(1) }}
            />
          </>
        }
        footer={filtered.length > 0 ? <CrmV2Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} /> : undefined}
      >
        {loading ? <CrmV2Spinner /> : filtered.length === 0 ? (
          <CrmV2Empty
            icon={<GraduationCap size={26} />}
            title="Aucun étudiant"
            description="Créez un dossier avec nom, prénom et email."
          />
        ) : isMobile ? (
          <div>
            {pageItems.map(s => {
              const meta = STUDENT_STATUS_META[s.dossier_status]
              const name = `${s.prenom} ${s.nom}`
              return (
                <div key={s.id} style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CrmV2Avatar name={name} size={32} radius="36%" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                    </div>
                    <CrmV2StatusPill label={meta.label} color={meta.color} />
                  </div>
                  {(s.dossier_status !== 'validated') && <div style={{ marginTop: 8 }}>{rowActions(s)}</div>}
                </div>
              )
            })}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Étudiant</CrmV2Th>
                <CrmV2Th>E-mail</CrmV2Th>
                <CrmV2Th>Statut du dossier</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>Actions</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(s => {
                const meta = STUDENT_STATUS_META[s.dossier_status]
                const name = `${s.prenom} ${s.nom}`
                return (
                  <CrmV2Tr key={s.id}>
                    <CrmV2Td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <CrmV2Avatar name={name} size={24} radius="36%" />
                        {name}
                      </span>
                    </CrmV2Td>
                    <CrmV2Td style={{ color: crmV2.link }}>{s.email}</CrmV2Td>
                    <CrmV2Td><CrmV2StatusPill label={meta.label} color={meta.color} /></CrmV2Td>
                    <CrmV2Td>{rowActions(s)}</CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>

      {/* Nouvel étudiant */}
      <CrmV2Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Nouvel étudiant</div>
            <CrmV2CloseButton onClick={() => setShowModal(false)} />
          </div>
        }
        footer={
          <>
            <span style={{ flex: 1 }} />
            <CrmV2Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" onClick={create} disabled={saving}>{saving ? 'Création…' : 'Créer'}</CrmV2Button>
          </>
        }
      >
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(['nom', 'prenom', 'email'] as const).map(k => (
            <CrmV2Field key={k} label={k === 'nom' ? 'Nom' : k === 'prenom' ? 'Prénom' : 'Email'}>
              <CrmV2Input
                type={k === 'email' ? 'email' : 'text'}
                value={form[k]}
                onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))}
              />
            </CrmV2Field>
          ))}
        </div>
      </CrmV2Drawer>
    </AlternanceShellV2>
  )
}
