'use client'

import { useState, useEffect } from 'react'
import type { TransactionDetail } from './TransactionDetailPanel'

// ── Stage config ─────────────────────────────────────────────────────────────

const DEFAULT_STAGE_ORDER = [
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

// ── Undo action type ─────────────────────────────────────────────────────────

export interface UndoAction {
  type: 'stage_change'
  dealIds: string[]
  fromStage: string
  toStage: string
  label: string
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  columns: Record<string, TransactionDetail[]>
  onStageChange: (dealId: string, newStage: string) => void
  onBatchStageChange: (dealIds: string[], newStage: string) => void
  onSelectDeal: (deal: TransactionDetail) => void
  undoAction: UndoAction | null
  onUndo: () => void
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
        transition: 'all 0.12s',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {showCheckbox && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
          style={{
            position: 'absolute', top: 6, right: 6, width: 18, height: 18,
            borderRadius: 4,
            border: `2px solid ${isSelected ? '#ccac71' : '#3a5a7a'}`,
            background: isSelected ? '#ccac71' : 'rgba(13,22,36,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.12s', zIndex: 2,
          }}
        >
          {isSelected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="#0b1624" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}

      <div style={{
        fontSize: 12, fontWeight: 600, color: '#e8eaf0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        marginBottom: 4, paddingRight: showCheckbox ? 22 : 0,
      }}>
        {deal.dealname || '(sans nom)'}
      </div>

      {contactName && (
        <div style={{ fontSize: 11, color: '#6b7a90', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contactName}
        </div>
      )}

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
  stageId, deals, onSelectDeal,
  dragOverStage, setDragOverStage,
  selectedDeals, onToggleSelect, onSelectAllInColumn, onDragStartMulti,
  onDropDeals,
  // Column reorder
  columnDragOver, setColumnDragOver, onColumnDragStart,
}: {
  stageId: string
  deals: TransactionDetail[]
  onSelectDeal: (deal: TransactionDetail) => void
  dragOverStage: string | null
  setDragOverStage: (s: string | null) => void
  selectedDeals: Set<string>
  onToggleSelect: (dealId: string) => void
  onSelectAllInColumn: (stageId: string) => void
  onDragStartMulti: (e: React.DragEvent, dealId: string) => void
  onDropDeals: (dealIds: string[], targetStage: string) => void
  columnDragOver: string | null
  setColumnDragOver: (s: string | null) => void
  onColumnDragStart: (e: React.DragEvent, stageId: string) => void
}) {
  const [headerHovered, setHeaderHovered] = useState(false)
  const stage = STAGE_MAP[stageId]
  if (!stage) return null

  const isOver = dragOverStage === stageId
  const selectionActive = selectedDeals.size > 0
  const allInColumnSelected = deals.length > 0 && deals.every(d => selectedDeals.has(d.hubspot_deal_id))
  const isColumnDragTarget = columnDragOver === stageId

  return (
    <div
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        // Check if this is a card drag or column drag
        // Column drags have 'columnId' data type
        const types = Array.from(e.dataTransfer.types)
        if (types.includes('columnid')) {
          setColumnDragOver(stageId)
        } else {
          setDragOverStage(stageId)
        }
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverStage(null)
          setColumnDragOver(null)
        }
      }}
      onDrop={e => {
        e.preventDefault()
        setDragOverStage(null)
        setColumnDragOver(null)

        // Check if it's a column reorder drop
        const colId = e.dataTransfer.getData('columnId')
        if (colId) {
          // Column reorder — dispatch event to parent
          const evt = new CustomEvent('columnReorder', { detail: { draggedStageId: colId, targetStageId: stageId } })
          document.dispatchEvent(evt)
          return
        }

        // Card drop
        const raw = e.dataTransfer.getData('dealIds')
        if (raw) {
          try {
            const dealIds = JSON.parse(raw) as string[]
            onDropDeals(dealIds, stageId)
          } catch {
            const dealId = e.dataTransfer.getData('dealId')
            if (dealId) onDropDeals([dealId], stageId)
          }
        } else {
          const dealId = e.dataTransfer.getData('dealId')
          if (dealId) onDropDeals([dealId], stageId)
        }
      }}
      style={{
        flex: '0 0 220px',
        minWidth: 220,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? 'rgba(204,172,113,0.08)' : isColumnDragTarget ? 'rgba(76,171,219,0.08)' : 'transparent',
        borderRadius: 10,
        border: `2px solid ${isOver ? '#ccac71' : isColumnDragTarget ? '#4cabdb' : '#1a2f45'}`,
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Header — draggable to REORDER columns */}
      <div
        draggable
        onDragStart={e => {
          e.stopPropagation()
          onColumnDragStart(e, stageId)
        }}
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
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
          {headerHovered && (
            <span style={{ fontSize: 9, color: '#555870', whiteSpace: 'nowrap' }}>
              ⇄ réordonner
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

      {/* Column reorder indicator */}
      {isColumnDragTarget && (
        <div style={{
          padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: 700,
          color: '#4cabdb', background: 'rgba(76,171,219,0.06)',
          borderBottom: '1px solid rgba(76,171,219,0.15)',
        }}>
          ⇄ Insérer la colonne ici
        </div>
      )}

      {/* Deal drop indicator */}
      {isOver && (
        <div style={{
          padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: 700,
          color: '#ccac71', background: 'rgba(204,172,113,0.06)',
          borderBottom: '1px solid rgba(204,172,113,0.15)',
        }}>
          ↓ Déposer ici
        </div>
      )}

      {/* Cards */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 6px',
        display: 'flex', flexDirection: 'column', gap: 6,
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

export default function TransactionBoard({
  columns, onStageChange, onBatchStageChange, onSelectDeal,
  undoAction, onUndo,
}: Props) {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [columnDragOver, setColumnDragOver] = useState<string | null>(null)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [stageOrder, setStageOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tx-column-order')
      if (saved) try { return JSON.parse(saved) } catch { /* ignore */ }
    }
    return DEFAULT_STAGE_ORDER
  })

  // Listen for column reorder events
  useEffect(() => {
    function handleColumnReorder(e: Event) {
      const { draggedStageId, targetStageId } = (e as CustomEvent).detail
      if (draggedStageId === targetStageId) return

      setStageOrder(prev => {
        const next = prev.filter(id => id !== draggedStageId)
        const targetIdx = next.indexOf(targetStageId)
        next.splice(targetIdx, 0, draggedStageId)
        localStorage.setItem('tx-column-order', JSON.stringify(next))
        return next
      })
    }
    document.addEventListener('columnReorder', handleColumnReorder)
    return () => document.removeEventListener('columnReorder', handleColumnReorder)
  }, [])

  // Escape to clear selection
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedDeals(new Set())
      // Ctrl+Z / Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && undoAction) {
        e.preventDefault()
        onUndo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undoAction, onUndo])

  function toggleSelect(dealId: string) {
    setSelectedDeals(prev => {
      const next = new Set(prev)
      if (next.has(dealId)) next.delete(dealId)
      else next.add(dealId)
      return next
    })
  }

  function selectAllInColumn(stageId: string) {
    const deals = columns[stageId] ?? []
    setSelectedDeals(prev => {
      const next = new Set(prev)
      const allSelected = deals.every(d => next.has(d.hubspot_deal_id))
      if (allSelected) {
        for (const d of deals) next.delete(d.hubspot_deal_id)
      } else {
        for (const d of deals) next.add(d.hubspot_deal_id)
      }
      return next
    })
  }

  function handleDragStart(e: React.DragEvent, dealId: string) {
    e.dataTransfer.effectAllowed = 'move'
    if (selectedDeals.has(dealId) && selectedDeals.size > 1) {
      const dealIds = Array.from(selectedDeals)
      e.dataTransfer.setData('dealIds', JSON.stringify(dealIds))
    } else {
      e.dataTransfer.setData('dealIds', JSON.stringify([dealId]))
      e.dataTransfer.setData('dealId', dealId)
    }
  }

  function handleColumnDragStart(e: React.DragEvent, stageId: string) {
    e.dataTransfer.effectAllowed = 'move'
    // Use a custom type to distinguish column drags from card drags
    e.dataTransfer.setData('columnId', stageId)
    // Also set a lowercase version for the types array check
    e.dataTransfer.setData('columnid', stageId)

    const stageName = STAGE_MAP[stageId]?.label ?? stageId
    const badge = document.createElement('div')
    badge.textContent = `⇄ ${stageName}`
    badge.style.cssText = 'position:fixed;top:-1000px;left:-1000px;background:#4cabdb;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;font-family:system-ui;white-space:nowrap;'
    document.body.appendChild(badge)
    e.dataTransfer.setDragImage(badge, 0, 0)
    setTimeout(() => document.body.removeChild(badge), 0)
  }

  function handleDropDeals(dealIds: string[], targetStage: string) {
    if (dealIds.length === 1) {
      onStageChange(dealIds[0], targetStage)
    } else {
      onBatchStageChange(dealIds, targetStage)
    }
    setSelectedDeals(new Set())
  }

  const hasSelection = selectedDeals.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Undo bar */}
      {undoAction && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8, margin: '8px 0 0', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#ef4444' }}>
            {undoAction.label}
          </span>
          <button
            onClick={onUndo}
            style={{
              background: '#ef4444', border: 'none',
              borderRadius: 6, padding: '5px 14px', color: '#fff', fontSize: 12,
              cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ↩ Annuler (Ctrl+Z)
          </button>
        </div>
      )}

      {/* Selection bar */}
      {hasSelection && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.25)',
          borderRadius: 8, margin: '8px 0 0', flexShrink: 0,
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
        display: 'flex', gap: 8, flex: 1,
        overflowX: 'auto', overflowY: 'hidden', padding: '12px 0',
      }}>
        {stageOrder.map(stageId => (
          <BoardColumn
            key={stageId}
            stageId={stageId}
            deals={columns[stageId] ?? []}
            onSelectDeal={onSelectDeal}
            dragOverStage={dragOverStage}
            setDragOverStage={setDragOverStage}
            selectedDeals={selectedDeals}
            onToggleSelect={toggleSelect}
            onSelectAllInColumn={selectAllInColumn}
            onDragStartMulti={handleDragStart}
            onDropDeals={handleDropDeals}
            columnDragOver={columnDragOver}
            setColumnDragOver={setColumnDragOver}
            onColumnDragStart={handleColumnDragStart}
          />
        ))}
      </div>
    </div>
  )
}
