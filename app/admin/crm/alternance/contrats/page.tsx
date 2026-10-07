'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Kanban, List, Calendar, Building2, FileSignature } from 'lucide-react'
import AlternanceShellV2, { useAlternanceBase } from '@/components/crm-v2/deal/AlternanceShellV2'
import { CONTRACT_STATUS_META } from '@/lib/alternance/constants'
import type { AlternanceCompany, AlternanceContract, AlternanceStudent, ContractStatus } from '@/lib/alternance/types'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Segmented, CrmV2Search, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Pagination, CrmV2Empty, CrmV2Spinner, CrmV2StatusPill, CrmV2Avatar, CrmV2Pill, CrmV2Drawer,
  CrmV2CloseButton, CrmV2Field, CrmV2Input, CrmV2Select, hexA,
} from '@/components/crm-v2/primitives'

type ViewMode = 'board' | 'list'
const PAGE_SIZE = 25
const STATUS_ORDER = Object.keys(CONTRACT_STATUS_META) as ContractStatus[]

function contractParts(c: AlternanceContract) {
  const company = (c as { company?: { raison_sociale?: string } }).company
  const student = (c as { student?: { prenom?: string; nom?: string } }).student
  const studentName = [student?.prenom, student?.nom].filter(Boolean).join(' ')
  return { company: company?.raison_sociale ?? '', studentName }
}

function shortDate(d?: string | null) {
  if (!d) return null
  const date = new Date(d)
  return isNaN(date.getTime()) ? d : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ContratsPage() {
  const [items, setItems] = useState<AlternanceContract[]>([])
  const [companies, setCompanies] = useState<AlternanceCompany[]>([])
  const [students, setStudents] = useState<AlternanceStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ company_id: '', student_id: '', date_debut: '', date_fin: '', formation: '' })
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const isMobile = useIsMobile()
  const base = useAlternanceBase()

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

  // Vue mémorisée (Tableau / Liste)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('alt-contracts-view')
      if (saved === 'board' || saved === 'list') setViewMode(saved)
    } catch { /* ignore */ }
  }, [])
  const switchView = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem('alt-contracts-view', mode) } catch { /* ignore */ }
  }

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
      window.location.href = `${base}/contrats/${data.id}`
    } else alert((await res.json()).error)
  }

  const list = useMemo(() => (Array.isArray(items) ? items : []), [items])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(c => {
      const { company, studentName } = contractParts(c)
      return [studentName, company, c.formation ?? ''].some(v => v.toLowerCase().includes(q))
    })
  }, [list, search])

  const columns = useMemo(() => {
    const out: Record<string, AlternanceContract[]> = {}
    for (const s of STATUS_ORDER) out[s] = []
    for (const c of filtered) (out[c.status] ??= []).push(c)
    return out
  }, [filtered])

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const href = (c: AlternanceContract) => `${base}/contrats/${c.id}`

  const toolbar = (
    <CrmV2Search
      placeholder="Rechercher un contrat…"
      value={search}
      onChange={e => { setSearch(e.target.value); setPage(1) }}
      style={{ width: isMobile ? '100%' : 260 }}
    />
  )

  return (
    <AlternanceShellV2
      title="Contrats"
      subtitle={`Création et suivi des contrats d'apprentissage · ${list.length} contrat${list.length > 1 ? 's' : ''}`}
      actions={
        <>
          <CrmV2Segmented<ViewMode>
            items={[
              { id: 'board', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Kanban size={14} />Tableau</span> },
              { id: 'list', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><List size={14} />Liste</span> },
            ]}
            value={viewMode}
            onChange={switchView}
          />
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Nouveau contrat</CrmV2Button>
        </>
      }
    >
      {loading ? <CrmV2Spinner /> : list.length === 0 ? (
        <CrmV2Empty
          icon={<FileSignature size={26} />}
          title="Aucun contrat"
          description="Créez-en un à partir d'une entreprise et d'un étudiant validé."
          action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Nouveau contrat</CrmV2Button>}
        />
      ) : viewMode === 'board' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{toolbar}</div>
          {/* Gabarit C : une colonne par statut (pas de glisser-déposer : le statut suit le dossier) */}
          <div style={{
            display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 4,
            ...(isMobile ? { margin: '0 -12px', padding: '0 12px 4px' } : {}),
          }}>
            {STATUS_ORDER.map(status => {
              const meta = CONTRACT_STATUS_META[status]
              const cards = columns[status] ?? []
              return (
                <div key={status} style={{
                  width: isMobile ? 260 : 250, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{meta.label}</span>
                    <span style={{ background: hexA(meta.color, 0.10), color: meta.color, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px' }}>{cards.length}</span>
                  </div>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                    {cards.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 8px', color: crmV2.textFaint, fontSize: 12 }}>Aucun contrat</div>
                    ) : cards.map(c => {
                      const { company, studentName } = contractParts(c)
                      const start = shortDate(c.date_debut)
                      return (
                        <Link key={c.id} href={href(c)} style={{
                          display: 'block', background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
                          boxShadow: crmV2.shadow, padding: 12, textDecoration: 'none', color: crmV2.text,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{studentName || '—'}</div>
                          {c.formation && (
                            <div style={{ marginTop: 8 }}>
                              <CrmV2Pill style={{ background: crmV2.goldSoft, borderColor: crmV2.goldBorder, color: crmV2.goldDark, fontWeight: 700, fontSize: 11, padding: '1px 8px' }}>{c.formation}</CrmV2Pill>
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, fontSize: 11, color: crmV2.textFaint }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <Building2 size={12} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company || '—'}</span>
                            </span>
                            {start && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <Calendar size={11} />{start}
                              </span>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <CrmV2TableCard
          toolbar={toolbar}
          footer={<CrmV2Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />}
        >
          {filtered.length === 0 ? (
            <CrmV2Empty title="Aucun contrat trouvé" description="Modifiez votre recherche." />
          ) : isMobile ? (
            <div>
              {pageItems.map(c => {
                const meta = CONTRACT_STATUS_META[c.status]
                const { company, studentName } = contractParts(c)
                return (
                  <Link key={c.id} href={href(c)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 12px',
                    borderBottom: `1px solid ${crmV2.border}`, textDecoration: 'none', color: crmV2.text,
                  }}>
                    <CrmV2Avatar name={studentName} size={32} radius="36%" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{studentName || '—'}</span>
                      <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[company, c.formation].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} title={meta.label} />
                  </Link>
                )
              })}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Étudiant</CrmV2Th>
                  <CrmV2Th>Entreprise</CrmV2Th>
                  <CrmV2Th>Formation</CrmV2Th>
                  <CrmV2Th>Début</CrmV2Th>
                  <CrmV2Th>Fin</CrmV2Th>
                  <CrmV2Th>Statut</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(c => {
                  const meta = CONTRACT_STATUS_META[c.status]
                  const { company, studentName } = contractParts(c)
                  return (
                    <CrmV2Tr key={c.id} onClick={() => { window.location.href = href(c) }}>
                      <CrmV2Td>
                        <Link href={href(c)} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: crmV2.link, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          <CrmV2Avatar name={studentName} size={24} radius="36%" />
                          {studentName || '—'}
                        </Link>
                      </CrmV2Td>
                      <CrmV2Td>{company || <span style={{ color: crmV2.textFaint }}>—</span>}</CrmV2Td>
                      <CrmV2Td>{c.formation ? <CrmV2Pill>{c.formation}</CrmV2Pill> : <span style={{ color: crmV2.textFaint }}>—</span>}</CrmV2Td>
                      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{shortDate(c.date_debut) ?? '—'}</CrmV2Td>
                      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{shortDate(c.date_fin) ?? '—'}</CrmV2Td>
                      <CrmV2Td><CrmV2StatusPill label={meta.label} color={meta.color} /></CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      )}

      {/* Nouveau contrat */}
      <CrmV2Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Nouveau contrat</div>
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
          <CrmV2Field label="Entreprise *">
            <CrmV2Select value={form.company_id} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))}>
              <option value="">— Choisir —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.raison_sociale}</option>)}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field
            label="Étudiant validé *"
            hint={students.length === 0 ? <span style={{ color: '#d13a41' }}>Aucun étudiant validé. Validez d&apos;abord un dossier.</span> : undefined}
          >
            <CrmV2Select value={form.student_id} onChange={e => setForm(p => ({ ...p, student_id: e.target.value }))}>
              <option value="">— Choisir —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.prenom} {s.nom}</option>)}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field label="Date début">
            <CrmV2Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} />
          </CrmV2Field>
          <CrmV2Field label="Date fin">
            <CrmV2Input type="date" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} />
          </CrmV2Field>
          <CrmV2Field label="Formation">
            <CrmV2Input value={form.formation} onChange={e => setForm(p => ({ ...p, formation: e.target.value }))} />
          </CrmV2Field>
        </div>
      </CrmV2Drawer>
    </AlternanceShellV2>
  )
}
