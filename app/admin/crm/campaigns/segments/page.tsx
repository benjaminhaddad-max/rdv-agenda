'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users, Plus, Trash2, Copy, Filter, List, RefreshCw,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Search, CrmV2Button, CrmV2StatusPill, CrmV2Empty, CrmV2Spinner, CrmV2Field, CrmV2Input, CrmV2Segmented,
} from '@/components/crm-v2/primitives'
import {
  MKT_TONES, MktNameCell, MktMobileRow, MktIconBox, MktIconButton, MktModal, numCell, mutedCell, useCrmBase,
} from '@/components/crm-v2/marketing/ui'

interface Segment {
  id: string
  name: string
  description: string | null
  segment_type: 'dynamic' | 'static'
  contact_count: number | null
  created_at: string
  updated_at: string
}

const TYPE_META = {
  dynamic: { label: 'Segment dynamique', ...MKT_TONES.blue, icon: Filter },
  static:  { label: 'Liste statique', ...MKT_TONES.purple, icon: List },
}

export default function SegmentsPage() {
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'dynamic' | 'static'>('all')
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/segments')
      const data = await res.json()
      setSegments(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = segments.filter(s => {
    if (typeFilter !== 'all' && s.segment_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const remove = async (s: Segment) => {
    if (!confirm(`Supprimer « ${s.name} » ?`)) return
    const res = await fetch(`/api/segments/${s.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error)
  }

  const duplicate = async (s: Segment) => {
    const full = await fetch(`/api/segments/${s.id}`).then(r => r.json())
    const res = await fetch('/api/segments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `${s.name} (copie)`,
        description: full.description,
        segment_type: full.segment_type ?? 'dynamic',
        filters: full.filters ?? {},
        filter_groups: full.filter_groups ?? [],
        preset_flags: full.preset_flags ?? null,
        manual_contact_ids: full.manual_contact_ids ?? [],
      }),
    })
    if (res.ok) {
      const created = await res.json()
      window.location.href = `${base}/campaigns/segments/${created.id}`
    }
  }

  const countDyn = segments.filter(s => s.segment_type !== 'static').length
  const countStatic = segments.filter(s => s.segment_type === 'static').length
  const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr })

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Segments"
        subtitle="Audiences réutilisables pour vos campagnes email et SMS — segments dynamiques ou listes statiques"
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load}>Actualiser</CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>Nouveau segment</CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={typeFilter}
          onChange={id => setTypeFilter(id as typeof typeFilter)}
          items={[
            { id: 'all', label: 'Tous', count: segments.length },
            { id: 'dynamic', label: 'Segments dynamiques', count: countDyn },
            { id: 'static', label: 'Listes statiques', count: countStatic },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        <CrmV2TableCard
          toolbar={
            <CrmV2Search
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un segment…"
              style={isMobile ? { flex: '1 1 100%' } : undefined}
            />
          }
        >
          {loading ? (
            <CrmV2Spinner />
          ) : filtered.length === 0 ? (
            <CrmV2Empty
              icon={<Users size={26} />}
              title="Aucun segment pour le moment"
              description="Créez un segment dynamique (filtres CRM) ou une liste statique (contacts figés)."
              action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>Créer un segment</CrmV2Button>}
            />
          ) : isMobile ? (
            <div>
              {filtered.map(s => {
                const meta = TYPE_META[s.segment_type] ?? TYPE_META.dynamic
                const Icon = meta.icon
                return (
                  <MktMobileRow
                    key={s.id}
                    href={`${base}/campaigns/segments/${s.id}`}
                    icon={<MktIconBox size={36} color={meta.color} bg={meta.bg}><Icon size={16} /></MktIconBox>}
                    title={s.name}
                    subtitle={`${(s.contact_count ?? 0).toLocaleString('fr-FR')} contacts · ${ago(s.updated_at)}`}
                    actions={
                      <>
                        <MktIconButton title="Dupliquer" onClick={() => duplicate(s)}><Copy size={14} /></MktIconButton>
                        <MktIconButton title="Supprimer" danger onClick={() => remove(s)}><Trash2 size={14} /></MktIconButton>
                      </>
                    }
                  />
                )
              })}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Segment</CrmV2Th>
                  <CrmV2Th>Type</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Contacts</CrmV2Th>
                  <CrmV2Th>Mis à jour</CrmV2Th>
                  <CrmV2Th style={{ width: 90 }}>{''}</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const meta = TYPE_META[s.segment_type] ?? TYPE_META.dynamic
                  const Icon = meta.icon
                  return (
                    <CrmV2Tr key={s.id} onClick={() => { window.location.href = `${base}/campaigns/segments/${s.id}` }}>
                      <CrmV2Td style={{ maxWidth: 460 }}>
                        <MktNameCell icon={<Icon size={14} />} href={`/admin/crm/campaigns/segments/${s.id}`} title={s.name} subtitle={s.description || undefined} />
                      </CrmV2Td>
                      <CrmV2Td><CrmV2StatusPill label={meta.label} color={meta.color} bg={meta.bg} /></CrmV2Td>
                      <CrmV2Td style={numCell}>{(s.contact_count ?? 0).toLocaleString('fr-FR')}</CrmV2Td>
                      <CrmV2Td style={mutedCell}>{ago(s.updated_at)}</CrmV2Td>
                      <CrmV2Td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <MktIconButton title="Dupliquer" onClick={() => duplicate(s)}><Copy size={14} /></MktIconButton>
                          <MktIconButton title="Supprimer" danger onClick={() => remove(s)}><Trash2 size={14} /></MktIconButton>
                        </div>
                      </CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>

      {showNew && (
        <NewSegmentModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { window.location.href = `${base}/campaigns/segments/${id}` }}
        />
      )}
    </CrmV2Page>
  )
}

function NewSegmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [segmentType, setSegmentType] = useState<'dynamic' | 'static'>('dynamic')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), segment_type: segmentType }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const seg = await res.json()
      onCreated(seg.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
      setCreating(false)
    }
  }

  return (
    <MktModal
      open
      onClose={onClose}
      title="Nouveau segment ou liste"
      width={440}
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={create} disabled={creating || !name.trim()}>
            {creating ? 'Création…' : 'Créer'}
          </CrmV2Button>
        </>
      }
    >
      <CrmV2Field label="Nom">
        <CrmV2Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Terminale IDF — NRP2" autoFocus />
      </CrmV2Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>Type</span>
        <CrmV2Segmented
          stretch
          value={segmentType}
          onChange={setSegmentType}
          items={[
            { id: 'dynamic', label: 'Segment dynamique' },
            { id: 'static', label: 'Liste statique' },
          ]}
        />
      </div>
    </MktModal>
  )
}
