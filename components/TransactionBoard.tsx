'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  onBatchStageChange: (dealIds: string[], newStage: string) => void
  onSelectDeal: (deal: TransactionDetail) => void
}

// ── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({
  deal, onSelect, isSelected, onToggleSelect, selectionActive,
  onDragStart, dragCount,
}: {
  deal: TransactionDetail
  onSelect: () => void
  isSelected: boolean
  onToggleSelect: () => void
  selectionActive: boolean
  onDragStart: (e: React.DragEvent) => void
  dragCount: number
}) {
  const [hovered, setHovered] = useState(false)
  const contactName = [deal.contact?.firstname, deal.contact?.lastname].filter(Boolean).join(' ')
  const closerInitials = deal.closer?.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  const showCheckbox = selectionActive || hovered

  return (
    <div
      draggable
      onDragStart={e => {
        // Create a drag image with count badge
        if (dragCount > 1) {
          const badge = document.createElement('div')
          badge.textContent = `${dragCount} transactions`
          badge.style.cssText = 'position:fixed;top:-1000px;left:-1000px;background:#ccac71;color:#0b1624;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:700;font-family:system-ui;white-space:nowrap;'
          document.body.appendChild(badge)
          e.dataTransfer.setDragImage(badge, 0, 0)
          setTimeout(() => document.body.removeChild(badge), 0)
        }
        onDragStart(e)
      }}
      onClick={e => {
        // If shift-click or ctrl-click → toggle select
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.stopPropagation()
          onToggleSelect()
          return
        }
        onSelect()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isSelected ? '#1a3050' : '#152438',
        border: `1px solid ${isSelected ? '#ccac71' : '#2d4a6b'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        opacity: 1,
        transition: 'all 0.12s',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `2px solid ${isSelected ? '#ccac71' : '#3a5a7a'}`,
            background: isSelected ? '#ccac71' : 'rgba(13,22,36,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.12s',
            zIndex: 2,
          }}
        >
          {isSelected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="#0b1624" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}

      {/* Deal name */}
      <div style={{
        fontSize: 12, fontWeight: 600, color: '#e8eaf0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        marginBottom: 4, paddingRight: showCheckbox ? 22 : 0,
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
            whiteSpace: 'nowrap',
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
  stageId, deals, onStageChange, onSelectDeal,
  dragOverStage, setDragOverStage,
  selectedDeals, onToggleSelect, onSelectAllInColumn, onDragStartMulti,
  onDragColumnStart,
}: {
  stageId: string
  deals: TransactionDetail[]
  onStageChange: (dealId: string, newStage: string) => void
  onSelectDeal: (deal: TransactionDetail) => void
  dragOverStage: string | null
  setDragOverStage: (s: string | null) => void
  selectedDeals: Set<string>
  onToggleSelect: (dealId: string) => void
  onSelectAllInColumn: (stageId: string) => void
  onDragStartMulti: (e: React.DragEvent, dealId: string) => void
  onDragColumnStart: (e: React.DragEvent, stageId: string) => void
}) {
  const [headerHovered, setHeaderHovered] = useState(false)
  const stage = STAGE_MAP[stageId]
  if (!stage) return null

  const isOver = dragOverStage === stageId
  const selectionActive = selectedDeals.size > 0
  // Check if all deals in this column are selected
  const allInColumnSelected = deals.length > 0 && deals.every(d => selectedDeals.has(d.hubspot_deal_id))

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(stageId) }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverStage(null)
        }
      }}
      onDrop={e => {
        e.preventDefault()
        setDragOverStage(null)
        const raw = e.dataTransfer.getData('dealIds')
        if (raw) {
          try {
            const dealIds = JSON.parse(raw) as string[]
            if (dealIds.length === 1) {
              onStageChange(dealIds[0], stageId)
            } else if (dealIds.length > 1) {
              const evt = new CustomEvent('batchDrop', { detail: { dealIds, newStage: stageId } })
              document.dispatchEvent(evt)
            }
          } catch {
            const dealId = e.dataTransfer.getData('dealId')
            if (dealId) onStageChange(dealId, stageId)
          }
        } else {
          const dealId = e.dataTransfer.getData('dealId')
          if (dealId) onStageChange(dealId, stageId)
        }
      }}
      style={{
        flex: '0 0 220px',
        minWidth: 220,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? 'rgba(204,172,113,0.08)' : 'transparent',
        borderRadius: 10,
        border: `2px solid ${isOver ? '#ccac71' : '#1a2f45'}`,
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Header — draggable to move entire column */}
      <div
        draggable={deals.length > 0}
        onDragStart={e => onDragColumnStart(e, stageId)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          padding: '10px 12px',
          borderBottom: `2px solid ${stage.color}`,
          background: '#0d1624',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          cursor: deals.length > 0 ? 'grab' : 'default',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Select-all checkbox for column */}
          {(headerHovered || selectionActive) && deals.length > 0 && (
            <div
              onClick={e => { e.stopPropagation(); e.preventDefault(); onSelectAllInColumn(stageId) }}
              onMouseDown={e => e.stopPropagation()}
              draggable={false}
              style={{
                width: 16, height: 16, borderRadius: 3,
                border: `2px solid ${allInColumnSelected ? '#ccac71' : '#3a5a7a'}`,
                background: allInColumnSelected ? '#ccac71' : 'rgba(13,22,36,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {allInColumnSelected && (
                <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#0b1624" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          )}
          <span style={{ fontSize: 12 }}>{stage.emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: stage.color }}>{stage.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {headerHovered && deals.length > 0 && (
            <span style={{ fontSize: 9, color: '#555870', whiteSpace: 'nowrap' }}>
              ⇄ glisser
            </span>
          )}
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
      </div>

      {/* Drop zone indicator */}
      {isOver && (
        <div style={{
          padding: '6px 0',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: '#ccac71',
          background: 'rgba(204,172,113,0.06)',
          borderBottom: '1px solid rgba(204,172,113,0.15)',
        }}>
          ↓ Déposer ici
        </div>
      )}

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
          deals.map(deal => {
            const isSelected = selectedDeals.has(deal.hubspot_deal_id)
            const dragCount = isSelected ? selectedDeals.size : 1
            return (
              <DealCard
                key={deal.hubspot_deal_id}
                deal={deal}
                onSelect={() => onSelectDeal(deal)}
                isSelected={isSelected}
                onToggleSelect={() => onToggleSelect(deal.hubspot_deal_id)}
                selectionActive={selectionActive}
                dragCount={dragCount}
                onDragStart={e => onDragStartMulti(e, deal.hubspot_deal_id)}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Main Board ───────────────────────────────────────────────────────────────

export default function TransactionBoard({ columns, onStageChange, onBatchStageChange, onSelectDeal }: Props) {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())

  // Listen for batch drop events
  useEffect(() => {
    function handleBatchDrop(e: Event) {
      const { dealIds, newStage } = (e as CustomEvent).detail
      onBatchStageChange(dealIds, newStage)
      setSelectedDeals(new Set())
    }
    document.addEventListener('batchDrop', handleBatchDrop)
    return () => document.removeEventListener('batchDrop', handleBatchDrop)
  }, [onBatchStageChange])

  // Escape to clear selection
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedDeals(new Set())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggleSelect(dealId: string) {
    setSelectedDeals(prev => {
      const next = new Set(prev)
      if (next.has(dealId)) next.delete(dealId)
      else next.add(dealId)
      return next
    })
  }

  function handleDragStart(e: React.DragEvent, dealId: string) {
    e.dataTransfer.effectAllowed = 'move'

    if (selectedDeals.has(dealId) && selectedDeals.size > 1) {
      // Multi-drag: send all selected deal IDs
      const dealIds = Array.from(selectedDeals)
      e.dataTransfer.setData('dealIds', JSON.stringify(dealIds))
    } else {
      // Single drag
      e.dataTransfer.setData('dealIds', JSON.stringify([dealId]))
      e.dataTransfer.setData('dealId', dealId)
    }
  }

  function handleDragColumnStart(e: React.DragEvent, stageId: string) {
    const deals = columns[stageId] ?? []
    if (deals.length === 0) { e.preventDefault(); return }

    const dealIds = deals.map(d => d.hubspot_deal_id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('dealIds', JSON.stringify(dealIds))

    // Create drag image badge
    const stageName = STAGE_MAP[stageId]?.label ?? stageId
    const badge = document.createElement('div')
    badge.textContent = `${stageName} — ${deals.length} transactions`
    badge.style.cssText = 'position:fixed;top:-1000px;left:-1000px;background:#ccac71;color:#0b1624;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;font-family:system-ui;white-space:nowrap;'
    document.body.appendChild(badge)
    e.dataTransfer.setDragImage(badge, 0, 0)
    setTimeout(() => document.body.removeChild(badge), 0)
  }

  function selectAllInColumn(stageId: string) {
    const deals = columns[stageId] ?? []
    setSelectedDeals(prev => {
      const next = new Set(prev)
      const allSelected = deals.every(d => next.has(d.hubspot_deal_id))
      if (allSelected) {
        // Deselect all in column
        for (const d of deals) next.delete(d.hubspot_deal_id)
      } else {
        // Select all in column
        for (const d of deals) next.add(d.hubspot_deal_id)
      }
      return next
    })
  }

  const hasSelection = selectedDeals.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Selection bar */}
      {hasSelection && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(204,172,113,0.08)',
          border: '1px solid rgba(204,172,113,0.25)',
          borderRadius: 8,
          margin: '8px 0 0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ccac71' }}>
              {selectedDeals.size} transaction{selectedDeals.size > 1 ? 's' : ''} sélectionnée{selectedDeals.size > 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 11, color: '#6b7a90' }}>
              Glissez une carte sélectionnée pour déplacer le groupe
            </span>
          </div>
          <button
            onClick={() => setSelectedDeals(new Set())}
            style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 6, padding: '4px 12px', color: '#ef4444', fontSize: 11,
              cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            Tout désélectionner
          </button>
        </div>
      )}

      {/* Columns */}
      <div style={{
        display: 'flex',
        gap: 8,
        flex: 1,
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
            selectedDeals={selectedDeals}
            onToggleSelect={toggleSelect}
            onSelectAllInColumn={selectAllInColumn}
            onDragStartMulti={handleDragStart}
            onDragColumnStart={handleDragColumnStart}
          />
        ))}
      </div>
    </div>
  )
}
