'use client'

import { useState, useCallback, useRef } from 'react'
import type { TransactionDetail } from './TransactionDetailPanel'

// ── Stage config ─────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  '3165428980', // RDV Pris
  '3165428979', // À Replanifier
  '3165428981', // Délai Réflexion
  '3165428982', // Pré-inscription
  '3165428983', // Finalisation
  '3165428984', // Inscription Confirmée
  '3165428985', // Fermé Perdu
]

const STAGE_MAP: Record<string, { label: string; color: string; emoji: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444', emoji: '🔴' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb', emoji: '🔵' },
  '3165428981': { label: 'Délai Réflexion',       color: '#ccac71', emoji: '🟡' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e', emoji: '🟢' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7', emoji: '🟣' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a', emoji: '✅' },
  '3165428985': { label: 'Fermé Perdu',           color: '#555870', emoji: '⚫' },
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  columns: Record<string, TransactionDetail[]>
  onStageChange: (dealId: string, newStage: string) => void
  onSelectDeal: (deal: TransactionDetail) => void
}

// ── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({
  deal, onSelect, isDragging, onDragStart,
}: {
  deal: TransactionDetail
  onSelect: () => void
  isDragging?: boolean
  onDragStart: (e: React.DragEvent) => void
}) {
  const contactName = [deal.contact?.firstname, deal.contact?.lastname].filter(Boolean).join(' ')
  const closerInitials = deal.closer?.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      style={{
        background: isDragging ? '#1a3050' : '#152438',
        border: `1px solid ${isDragging ? '#ccac71' : '#2d4a6b'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        opacity: isDragging ? 0.6 : 1,
        transition: 'all 0.12s',
        userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = '#3a5a7a' }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.borderColor = '#2d4a6b' }}
    >
      {/* Deal name */}
      <div style={{
        fontSize: 12, fontWeight: 600, color: '#e8eaf0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        marginBottom: 4,
      }}>
        {deal.dealname || '(sans nom)'}
      </div>

      {/* Contact name */}
      {contactName && (
        <div style={{ fontSize: 11, color: '#6b7a90', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contactName}
        </div>
      )}

      {/* Bottom row: formation + closer avatar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {deal.formation ? (
          <span style={{
            background: 'rgba(204,172,113,0.10)', border: '1px solid rgba(204,172,113,0.25)',
            borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: '#ccac71',
          }}>
            {deal.formation}
          </span>
        ) : <span />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {deal.closer && (
            <div
              title={deal.closer.name}
              style={{
                width: 20, height: 20, borderRadius: '50%', background: deal.closer.avatar_color || '#4f6ef7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#fff',
              }}
            >
              {closerInitials}
            </div>
          )}
          {deal.closedate && (
            <span style={{ fontSize: 10, color: '#3a5070' }}>
              {new Date(deal.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Board Column ─────────────────────────────────────────────────────────────

function BoardColumn({
  stageId, deals, onStageChange, onSelectDeal, dragOverStage, setDragOverStage,
}: {
  stageId: string
  deals: TransactionDetail[]
  onStageChange: (dealId: string, newStage: string) => void
  onSelectDeal: (deal: TransactionDetail) => void
  dragOverStage: string | null
  setDragOverStage: (s: string | null) => void
}) {
  const stage = STAGE_MAP[stageId]
  if (!stage) return null

  const isOver = dragOverStage === stageId

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverStage(stageId) }}
      onDragLeave={() => setDragOverStage(null)}
      onDrop={e => {
        e.preventDefault()
        setDragOverStage(null)
        const dealId = e.dataTransfer.getData('dealId')
        if (dealId) onStageChange(dealId, stageId)
      }}
      style={{
        flex: '0 0 220px',
        minWidth: 220,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? 'rgba(204,172,113,0.05)' : 'transparent',
        borderRadius: 10,
        border: `1px solid ${isOver ? 'rgba(204,172,113,0.3)' : '#1a2f45'}`,
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: `2px solid ${stage.color}`,
        background: '#0d1624',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>{stage.emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: stage.color }}>{stage.label}</span>
        </div>
        <span style={{
          background: `${stage.color}20`,
          color: stage.color,
          borderRadius: 10,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
        }}>
          {deals.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {deals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#2d4a6b', fontSize: 11 }}>
            Aucune transaction
          </div>
        ) : (
          deals.map(deal => (
            <DealCard
              key={deal.hubspot_deal_id}
              deal={deal}
              onSelect={() => onSelectDeal(deal)}
              onDragStart={e => {
                e.dataTransfer.setData('dealId', deal.hubspot_deal_id)
                e.dataTransfer.effectAllowed = 'move'
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Main Board ───────────────────────────────────────────────────────────────

export default function TransactionBoard({ columns, onStageChange, onSelectDeal }: Props) {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      height: '100%',
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '12px 0',
    }}>
      {STAGE_ORDER.map(stageId => (
        <BoardColumn
          key={stageId}
          stageId={stageId}
          deals={columns[stageId] ?? []}
          onStageChange={onStageChange}
          onSelectDeal={onSelectDeal}
          dragOverStage={dragOverStage}
          setDragOverStage={setDragOverStage}
        />
      ))}
    </div>
  )
}
