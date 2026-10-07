'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Repeat2 } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Search, CrmV2Button, CrmV2StatusPill, CrmV2Empty,
} from '@/components/crm-v2/primitives'
import {
  programStatusMeta, MktNameCell, MktSelectPill, MktMobileRow, MktIconBox, numCell, mutedCell, useCrmBase,
} from '@/components/crm-v2/marketing/ui'

interface Program {
  id: string
  slug: string
  name: string
  status: string
  interval_days: number
  total_enrolled: number
}

export default function ProgramsPage() {
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [programs, setPrograms] = useState<Program[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetch('/api/email-programs')
      .then(r => r.json())
      .then(d => setPrograms(Array.isArray(d) ? d : []))
  }, [])

  const seed = async () => {
    await fetch('/api/email-programs/seed-last-chance', { method: 'POST' }).catch(() => null)
    // fallback: reload after manual seed
    const res = await fetch('/api/email-programs')
    const d = await res.json()
    setPrograms(Array.isArray(d) ? d : [])
  }

  const statuses = Array.from(new Set(programs.map(p => p.status).filter(Boolean)))
  const q = search.trim().toLowerCase()
  const filtered = programs.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (q) return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
    return true
  })
  const totalEnrolled = programs.reduce((s, p) => s + (p.total_enrolled || 0), 0)

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Programmes"
        subtitle={`Séquences d’emails automatiques (J1, J3, J5…) · ${programs.length} programme${programs.length > 1 ? 's' : ''} · ${totalEnrolled.toLocaleString('fr-FR')} inscrits`}
        actions={
          <CrmV2Button variant="secondary" icon={<RefreshCw size={14} />} onClick={seed}>
            Recharger la liste
          </CrmV2Button>
        }
      />
      <CrmV2Body>
        <CrmV2TableCard
          toolbar={
            <>
              <CrmV2Search
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un programme…"
                style={isMobile ? { flex: '1 1 100%' } : undefined}
              />
              {statuses.length > 0 && (
                <MktSelectPill value={statusFilter} active={!!statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Statut">
                  <option value="">Statut</option>
                  {statuses.map(s => <option key={s} value={s}>{programStatusMeta(s).label}</option>)}
                </MktSelectPill>
              )}
            </>
          }
        >
          {programs.length === 0 ? (
            <CrmV2Empty
              icon={<Repeat2 size={26} />}
              title="Aucun programme"
              description="Chaque étape d’un programme = marque + objet + modèle. Pour créer le programme Last Chance Médecine, lancez : bun run scripts/seed-last-chance-medecine-program.mjs"
            />
          ) : filtered.length === 0 ? (
            <CrmV2Empty title="Aucun programme ne correspond aux filtres." />
          ) : isMobile ? (
            <div>
              {filtered.map(p => {
                const meta = programStatusMeta(p.status)
                return (
                  <MktMobileRow
                    key={p.id}
                    href={`${base}/campaigns/programs/${p.id}`}
                    icon={<MktIconBox size={36}><Repeat2 size={16} /></MktIconBox>}
                    title={p.name}
                    subtitle={`${(p.total_enrolled || 0).toLocaleString('fr-FR')} inscrits · tous les ${p.interval_days} j`}
                    right={<CrmV2StatusPill label={meta.label} color={meta.color} bg={meta.bg} />}
                  />
                )
              })}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Programme</CrmV2Th>
                  <CrmV2Th>Rythme</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Inscrits</CrmV2Th>
                  <CrmV2Th>Statut</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const meta = programStatusMeta(p.status)
                  return (
                    <CrmV2Tr key={p.id} onClick={() => { window.location.href = `${base}/campaigns/programs/${p.id}` }}>
                      <CrmV2Td>
                        <MktNameCell icon={<Repeat2 size={14} />} href={`/admin/crm/campaigns/programs/${p.id}`} title={p.name} subtitle={p.slug} />
                      </CrmV2Td>
                      <CrmV2Td style={mutedCell}>Un email tous les {p.interval_days} j</CrmV2Td>
                      <CrmV2Td style={numCell}>{(p.total_enrolled || 0).toLocaleString('fr-FR')}</CrmV2Td>
                      <CrmV2Td><CrmV2StatusPill label={meta.label} color={meta.color} bg={meta.bg} /></CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>
    </CrmV2Page>
  )
}
