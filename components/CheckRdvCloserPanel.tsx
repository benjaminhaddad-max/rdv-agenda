'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, RefreshCw, AlertTriangle, Users, UserCheck, UserX } from 'lucide-react'
import type { RdvPrisAuditDeal } from '@/app/api/admin/check-rdv-closer/route'

const HS_BASE_URL = process.env.NEXT_PUBLIC_HUBSPOT_BASE_URL || 'https://app-eu1.hubspot.com'
const HS_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''

type Filter = 'all' | 'same_person' | 'closer_assigned' | 'unknown_telepro' | 'other'

const FILTERS: { value: Filter; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  {
    value: 'all',
    label: 'Tous',
    icon: <AlertTriangle size={13} />,
    color: '#f59e0b',
    desc: 'Tous les RDV passés encore en "RDV Pris"',
  },
  {
    value: 'same_person',
    label: 'Télépro = Propriétaire',
    icon: <Users size={13} />,
    color: '#6b87ff',
    desc: 'Le télépro est encore propriétaire du deal — aucun closer assigné',
  },
  {
    value: 'closer_assigned',
    label: 'Closer assigné',
    icon: <UserCheck size={13} />,
    color: '#22c55e',
    desc: "Un closer est propriétaire mais n'a pas mis à jour le stage",
  },
  {
    value: 'unknown_telepro',
    label: 'Télépro inconnu',
    icon: <UserX size={13} />,
    color: '#a855f7',
    desc: 'Télépro non reconnu dans le système, closer connu propriétaire',
  },
]

function Avatar({ name, color, size = 24 }: { name: string; color?: string; size?: number }) {
  const bg = color || '#6b87ff'
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0,
      background: `${bg}25`, border: `1.5px solid ${bg}60`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 700, color: bg,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function CheckRdvCloserPanel({ onClose }: { onClose: () => void }) {
  const [deals, setDeals] = useState<RdvPrisAuditDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const [actioning, setActioning] = useState<Record<string, 'aReplanifier' | 'delaiReflexion'>>({})

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/check-rdv-closer')
      if (res.ok) setDeals(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const updateStage = async (deal: RdvPrisAuditDeal, stage: 'aReplanifier' | 'delaiReflexion') => {
    setActioning(prev => ({ ...prev, [deal.id]: stage }))
    try {
      const res = await fetch(`/api/hubspot/deal/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      if (res.ok) {
        // Retirer le deal de la liste (il n'est plus en RDV Pris)
        setDeals(prev => prev.filter(d => d.id !== deal.id))
      }
    } finally {
      setActioning(prev => { const n = { ...prev }; delete n[deal.id]; return n })
    }
  }

  const filtered = activeFilter === 'all'
    ? deals
    : deals.filter(d => d.category === activeFilter)

  const counts: Record<Filter, number> = {
    all: deals.length,
    same_person: deals.filter(d => d.category === 'same_person').length,
    closer_assigned: deals.filter(d => d.category === 'closer_assigned').length,
    unknown_telepro: deals.filter(d => d.category === 'unknown_telepro').length,
    other: deals.filter(d => d.category === 'other').length,
  }

  const mouseDownOnBackdrop = { current: false }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose(); mouseDownOnBackdrop.current = false }}
    >
      <div style={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 16, width: '100%', maxWidth: 960, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2d3e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
              Check RDV Closer
            </div>
            <div style={{ fontSize: 12, color: '#555870', marginTop: 3 }}>
              RDVs passés encore en &quot;RDV Pris&quot; — pipeline 2026-2027
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={load}
              disabled={loading}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #2a2d3e', borderRadius: 8, padding: '6px 10px', color: '#8b8fa8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: 'inherit' }}
            >
              <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FILTERS.map(f => {
            const isActive = activeFilter === f.value
            const count = counts[f.value]
            return (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                title={f.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: isActive ? `${f.color}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? `${f.color}55` : '#2a2d3e'}`,
                  borderRadius: 8, padding: '6px 12px',
                  color: isActive ? f.color : '#8b8fa8',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {f.icon}
                {f.label}
                <span style={{
                  background: isActive ? `${f.color}30` : '#252840',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11,
                  color: isActive ? f.color : '#555870',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Description du filtre actif */}
        <div style={{ padding: '10px 24px', background: 'rgba(245,158,11,0.05)', borderBottom: '1px solid #2a2d3e' }}>
          <p style={{ fontSize: 12, color: '#8b8fa8', margin: 0 }}>
            {FILTERS.find(f => f.value === activeFilter)?.desc}
          </p>
        </div>

        {/* Liste */}
        <div style={{ padding: '16px 24px', maxHeight: '62vh', overflowY: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870', fontSize: 13 }}>
              ⏳ Chargement depuis HubSpot… (peut prendre quelques secondes pour 600+ deals)
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870', fontSize: 13 }}>
              ✅ Aucun deal dans cette catégorie.
            </div>
          )}
          {!loading && filtered.map(deal => {
            const prospectName = deal.dealname.replace(/^RDV Découverte — /i, '').trim() || deal.dealname
            const date = deal.closedate
              ? new Date(deal.closedate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
              : '—'
            const isActioning = !!actioning[deal.id]

            const catColors: Record<RdvPrisAuditDeal['category'], { label: string; color: string }> = {
              same_person:     { label: 'Même personne',   color: '#6b87ff' },
              closer_assigned: { label: 'Closer assigné',  color: '#22c55e' },
              unknown_telepro: { label: 'Télépro inconnu', color: '#a855f7' },
              other:           { label: 'Autre',           color: '#8b8fa8' },
            }
            const cat = catColors[deal.category]

            return (
              <div key={deal.id} style={{
                background: '#151823',
                border: '1px solid #2a2d3e',
                borderRadius: 10, padding: '10px 14px',
                marginBottom: 7,
              }}>
                {/* Ligne principale */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

                  {/* Date */}
                  <div style={{ minWidth: 75, fontSize: 11, color: '#555870', flexShrink: 0 }}>
                    {date}
                  </div>

                  {/* Nom prospect */}
                  <div style={{ flex: 1, minWidth: 130, fontWeight: 700, fontSize: 13, color: '#e8eaf0' }}>
                    {prospectName}
                  </div>

                  {/* Télépro */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
                    <span style={{ fontSize: 10, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Télépro</span>
                    {deal.telepro_user ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Avatar name={deal.telepro_user.name} color={deal.telepro_user.avatar_color} size={20} />
                        <span style={{ fontSize: 12, color: '#c8cadb', fontWeight: 600 }}>{deal.telepro_user.name}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#555870', fontStyle: 'italic' }}>
                        {deal.teleprospecteur ? `…${deal.teleprospecteur.slice(-6)}` : 'Inconnu'}
                      </span>
                    )}
                  </div>

                  {/* Propriétaire */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
                    <span style={{ fontSize: 10, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Propriétaire</span>
                    {deal.owner_user ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Avatar name={deal.owner_user.name} color={deal.owner_user.avatar_color} size={20} />
                        <div>
                          <span style={{ fontSize: 12, color: '#c8cadb', fontWeight: 600 }}>{deal.owner_user.name}</span>
                          <span style={{ fontSize: 10, color: '#555870', marginLeft: 4 }}>({deal.owner_user.role})</span>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#555870', fontStyle: 'italic' }}>
                        {deal.hubspot_owner_id ? `…${deal.hubspot_owner_id.slice(-6)}` : 'Inconnu'}
                      </span>
                    )}
                  </div>

                  {/* Badge catégorie */}
                  <span style={{
                    background: `${cat.color}18`, border: `1px solid ${cat.color}55`,
                    color: cat.color, borderRadius: 6, padding: '2px 8px',
                    fontSize: 11, fontWeight: 600, flexShrink: 0,
                  }}>
                    {cat.label}
                  </span>

                  {/* Lien HubSpot */}
                  <a
                    href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/deal/${deal.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.25)',
                      borderRadius: 6, padding: '4px 9px', color: '#6b87ff',
                      fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
                    }}
                  >
                    <ExternalLink size={10} /> HubSpot
                  </a>
                </div>

                {/* Boutons d'action */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e2130' }}>
                  <button
                    onClick={() => updateStage(deal, 'aReplanifier')}
                    disabled={isActioning}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: actioning[deal.id] === 'aReplanifier' ? 'rgba(249,115,22,0.2)' : 'rgba(249,115,22,0.08)',
                      border: '1px solid rgba(249,115,22,0.3)',
                      borderRadius: 6, padding: '4px 11px', color: '#f97316',
                      fontSize: 11, fontWeight: 600, cursor: isActioning ? 'default' : 'pointer',
                      fontFamily: 'inherit', opacity: isActioning ? 0.7 : 1,
                    }}
                  >
                    {actioning[deal.id] === 'aReplanifier' ? '⏳' : '🔄'} À replanifier
                  </button>
                  <button
                    onClick={() => updateStage(deal, 'delaiReflexion')}
                    disabled={isActioning}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: actioning[deal.id] === 'delaiReflexion' ? 'rgba(234,179,8,0.2)' : 'rgba(234,179,8,0.08)',
                      border: '1px solid rgba(234,179,8,0.3)',
                      borderRadius: 6, padding: '4px 11px', color: '#eab308',
                      fontSize: 11, fontWeight: 600, cursor: isActioning ? 'default' : 'pointer',
                      fontFamily: 'inherit', opacity: isActioning ? 0.7 : 1,
                    }}
                  >
                    {actioning[deal.id] === 'delaiReflexion' ? '⏳' : '⏰'} Délai de réflexion
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
