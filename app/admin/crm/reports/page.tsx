'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, Plus, Trash2, Star, BarChart3, Phone, PhoneCall } from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Empty, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2Page, CrmV2Search,
  CrmV2Spinner, CrmV2StatusPill, CrmV2Textarea, CrmV2TileCard, CrmV2TileGrid,
} from '@/components/crm-v2/primitives'
import { CrmV2ReportModal } from '@/components/crm-v2/reports/ReportModal'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

interface Dashboard {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  is_default: boolean
  is_shared: boolean
  created_at: string
  updated_at: string
}

/** Couleur d'un dashboard (stockée en base) ramenée à un hex exploitable, sinon accent froid. */
function safeColor(c?: string | null) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : crmV2.link
}

export default function DashboardsListPage() {
  const isMobile = useIsMobile()
  const router = useRouter()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboards')
      const data = await res.json()
      setDashboards(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = dashboards.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
  })

  const remove = async (d: Dashboard) => {
    if (d.is_default) { alert('Le dashboard par défaut ne peut pas être supprimé.'); return }
    if (!confirm(`Supprimer le dashboard "${d.name}" ?`)) return
    const res = await fetch(`/api/dashboards/${d.id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Dashboards & Rapports"
        subtitle="Tableaux de bord partagés et rapports personnalisés"
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<PhoneCall size={14} />} onClick={() => router.push('/admin/crm/reports/suivi-commercial')}>
              Suivi commercial
            </CrmV2Button>
            <CrmV2Button variant="secondary" icon={<Phone size={14} />} onClick={() => router.push('/admin/crm/reports/telepro-rdv')}>
              RDV par télépro
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewModal(true)}>
              Nouveau dashboard
            </CrmV2Button>
          </>
        }
      />

      <CrmV2Body style={isMobile ? undefined : { padding: '20px 28px 24px' }}>
        <CrmV2Search
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un dashboard…"
          style={{ maxWidth: isMobile ? undefined : 400 }}
        />

        {loading ? (
          <CrmV2Spinner />
        ) : (
          <CrmV2TileGrid>
            {/* Rapports intégrés, toujours affichés en tête */}
            <CrmV2TileCard
              href="/admin/crm/reports/suivi-commercial"
              icon={<PhoneCall size={18} />}
              iconColor={crmV2.success}
              status={<CrmV2StatusPill label="Intégré" color={crmV2.successStrong} />}
              title="Suivi commercial"
              description="Appels Aircall, RDV et taux de conversion par télépro et par commercial."
              meta="Rapport intégré"
            />
            <CrmV2TileCard
              href="/admin/crm/reports/telepro-rdv"
              icon={<Phone size={18} />}
              iconColor={crmV2.success}
              status={<CrmV2StatusPill label="Intégré" color={crmV2.successStrong} />}
              title="RDV par télépro"
              description="Combien de RDV chaque télépro a pris, semaine par semaine, avec comparaison à la semaine précédente."
              meta="Rapport hebdomadaire"
            />
            {filtered.map(d => (
              <DashboardCard key={d.id} dashboard={d} onDelete={() => remove(d)} />
            ))}
            {filtered.length === 0 && (
              <div style={{
                background: crmV2.bg, border: `1px dashed ${crmV2.borderStrong}`, borderRadius: crmV2.radiusLg,
              }}>
                <CrmV2Empty
                  icon={<LayoutDashboard size={28} />}
                  title={search ? 'Aucun dashboard trouvé' : 'Aucun dashboard personnalisé'}
                  description="Crée un tableau de bord pour suivre tes KPIs en temps réel."
                  action={
                    <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewModal(true)}>
                      Créer un dashboard
                    </CrmV2Button>
                  }
                />
              </div>
            )}
          </CrmV2TileGrid>
        )}
      </CrmV2Body>

      {showNewModal && (
        <NewDashboardModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => { window.location.href = `/admin/crm/reports/${id}` }}
        />
      )}
    </CrmV2Page>
  )
}

function DashboardCard({ dashboard: d, onDelete }: { dashboard: Dashboard; onDelete: () => void }) {
  const color = safeColor(d.color)
  const status = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {d.is_default ? (
        <CrmV2StatusPill label={<><Star size={11} /> Par défaut</>} color={crmV2.goldDark} bg="rgba(204,172,113,0.16)" dot={false} />
      ) : d.is_shared ? (
        <CrmV2StatusPill label="Équipe" color="#1f7ca8" bg="rgba(76,171,219,0.12)" />
      ) : (
        <CrmV2StatusPill label="Privé" color={crmV2.textMuted} bg={crmV2.chipBg} />
      )}
      {!d.is_default && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          title="Supprimer"
          aria-label="Supprimer le dashboard"
          style={{
            width: 28, height: 28, borderRadius: 999, border: 'none', background: 'transparent',
            color: crmV2.danger, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
  return (
    <CrmV2TileCard
      href={`/admin/crm/reports/${d.id}`}
      icon={<BarChart3 size={18} />}
      iconColor={color}
      status={status}
      title={d.name}
      description={d.description || 'Pas de description'}
      meta={`Modifié le ${new Date(d.updated_at).toLocaleDateString('fr-FR')}`}
    />
  )
}

function NewDashboardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      if (res.ok) {
        const created = await res.json()
        onCreated(created.id)
      }
    } finally { setLoading(false) }
  }

  return (
    <CrmV2ReportModal
      title="Nouveau dashboard"
      onClose={onClose}
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={submit} disabled={!name.trim() || loading}>
            {loading ? 'Création…' : 'Créer'}
          </CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CrmV2Field label="Nom *">
          <CrmV2Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex : Performance Closers PASS"
            autoFocus
          />
        </CrmV2Field>
        <CrmV2Field label="Description (optionnel)">
          <CrmV2Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="À quoi sert ce dashboard ?"
            rows={3}
          />
        </CrmV2Field>
      </div>
    </CrmV2ReportModal>
  )
}
