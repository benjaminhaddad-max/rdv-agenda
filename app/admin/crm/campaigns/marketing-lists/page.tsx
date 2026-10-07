'use client'

import { useEffect, useState } from 'react'
import { Info, List, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Search, CrmV2Button, CrmV2StatusPill, CrmV2Empty, CrmV2Field, CrmV2Input,
} from '@/components/crm-v2/primitives'
import {
  MKT_TONES, MktNameCell, MktMobileRow, MktIconBox, MktModal, MktNotice, numCell, mutedCell, useCrmBase,
} from '@/components/crm-v2/marketing/ui'

interface Audience {
  id: string
  name: string
  description: string | null
  member_count: number
  updated_at: string
}

export default function MarketingListsPage() {
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [lists, setLists] = useState<Audience[]>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')

  const load = () =>
    fetch('/api/marketing/audiences')
      .then(r => r.json())
      .then(d => setLists(Array.isArray(d) ? d : []))

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    await fetch('/api/marketing/audiences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setName('')
    await load()
    setCreating(false)
    setShowNew(false)
  }

  const q = search.trim().toLowerCase()
  const filtered = lists.filter(l => !q || l.name.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q))
  const totalMembers = lists.reduce((s, l) => s + (l.member_count || 0), 0)
  const fmtDate = (iso: string) => {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: fr }) } catch { return '—' }
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Listes marketing"
        subtitle={`Listes de contacts hors CRM · ${lists.length} liste${lists.length > 1 ? 's' : ''} · ${totalMembers.toLocaleString('fr-FR')} contacts`}
        actions={
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>
            Créer une liste
          </CrmV2Button>
        }
      />
      <CrmV2Body>
        <MktNotice icon={<Info size={15} />}>
          Ces contacts <strong>ne sont pas dans le CRM</strong> — invisibles pour les télépros. Import CSV uniquement.
        </MktNotice>

        <CrmV2TableCard
          toolbar={
            <CrmV2Search
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une liste…"
              style={isMobile ? { flex: '1 1 100%' } : undefined}
            />
          }
        >
          {lists.length === 0 ? (
            <CrmV2Empty
              icon={<List size={26} />}
              title="Aucune liste marketing"
              description="Créez une liste puis importez un fichier CSV de contacts."
              action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>Créer une liste</CrmV2Button>}
            />
          ) : filtered.length === 0 ? (
            <CrmV2Empty title="Aucune liste ne correspond à la recherche." />
          ) : isMobile ? (
            <div>
              {filtered.map(l => (
                <MktMobileRow
                  key={l.id}
                  href={`${base}/campaigns/marketing-lists/${l.id}`}
                  icon={<MktIconBox size={36}><List size={16} /></MktIconBox>}
                  title={l.name}
                  subtitle={l.description || `Mise à jour le ${fmtDate(l.updated_at)}`}
                  right={<span style={{ fontSize: 14, fontWeight: 700 }}>{(l.member_count || 0).toLocaleString('fr-FR')}</span>}
                />
              ))}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Liste</CrmV2Th>
                  <CrmV2Th>Type</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Contacts</CrmV2Th>
                  <CrmV2Th>Mise à jour</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <CrmV2Tr key={l.id} onClick={() => { window.location.href = `${base}/campaigns/marketing-lists/${l.id}` }}>
                    <CrmV2Td style={{ maxWidth: 460 }}>
                      <MktNameCell icon={<List size={14} />} href={`/admin/crm/campaigns/marketing-lists/${l.id}`} title={l.name} subtitle={l.description || undefined} />
                    </CrmV2Td>
                    <CrmV2Td><CrmV2StatusPill label="Statique · hors CRM" color={MKT_TONES.grey.color} bg={MKT_TONES.grey.bg} /></CrmV2Td>
                    <CrmV2Td style={numCell}>{(l.member_count || 0).toLocaleString('fr-FR')}</CrmV2Td>
                    <CrmV2Td style={mutedCell}>{fmtDate(l.updated_at)}</CrmV2Td>
                  </CrmV2Tr>
                ))}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>

      <MktModal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Créer une liste"
        footer={
          <>
            <CrmV2Button variant="secondary" onClick={() => setShowNew(false)}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={create} disabled={creating || !name.trim()}>
              {creating ? 'Création…' : 'Créer'}
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Field label="Nom de la liste">
          <CrmV2Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex. Meta juin IDF"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') create() }}
          />
        </CrmV2Field>
      </MktModal>
    </CrmV2Page>
  )
}
