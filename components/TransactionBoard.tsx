'use client'

import { useState, useEffect } from 'react'
import { ArrowDown, Check, Clock, GripVertical, Phone, Trash2, Undo2 } from 'lucide-react'
import type { TransactionDetail } from './TransactionDetailPanel'
import { getStagesForPipeline, getStageMeta } from '@/lib/crm-stages'
import { isDeletableStage, DELETE_LOCK_MESSAGE } from '@/lib/dealstage-rules'
import {
  parcoursupVerdictBadgeStyle,
  parcoursupVerdictDefaultLabel,
} from '@/lib/parcoursup-verdict'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Avatar, CrmV2Button } from '@/components/crm-v2/primitives'

// ── Stage config ─────────────────────────────────────────────────────────────
// Mapping centralise dans @/lib/crm-stages (couvre les 4 pipelines).

// Stages amont 2026-2027 : la classe et le téléphone n'ont d'intérêt que là.
const AMONT_IDS = ['3165428979', '3165428980', '3165428981']

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
  onDeleteDeals: (dealIds: string[]) => void
  onSelectDeal: (deal: TransactionDetail) => void
  undoAction: UndoAction | null
  onUndo: () => void
  pipelineId?: string
}

// ── Pastilles des cartes ─────────────────────────────────────────────────────

const pillBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '1px 8px',
  fontSize: 11, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
}

function FormationPill({ value }: { value: string }) {
  return (
    <span style={{ ...pillBase, background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, color: crmV2.goldDark, fontWeight: 700 }}>
      {value}
    </span>
  )
}

function ClassePill({ value }: { value: string }) {
  return (
    <span style={{ ...pillBase, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, color: crmV2.textMuted, fontWeight: 600 }}>
      {value}
    </span>
  )
}

/** Verdict Parcoursup 2026 : visible dès qu'on connaît le verdict, sur toutes les colonnes. */
function VerdictPill({ deal }: { deal: TransactionDetail }) {
  const verdict = deal.contact?.parcoursup_verdict
  if (!verdict || (!verdict.status && !verdict.label)) return null
  const status = (verdict.status || '').toLowerCase()
  const style = parcoursupVerdictBadgeStyle(status)
  const label = verdict.label || parcoursupVerdictDefaultLabel(status) || 'Verdict'
  return (
    <span
      title={`Parcoursup 2026 — ${label}`}
      style={{ ...pillBase, background: style.bg, color: style.fg, border: `1px solid ${style.border}`, fontWeight: 700, fontSize: 10, gap: 5 }}
    >
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: style.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function shortDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Case à cocher ronde (sélection multiple). */
function SelectBox({ checked, size = 18, onClick }: { checked: boolean; size?: number; onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      draggable={false}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: `1.5px solid ${checked ? crmV2.gold : crmV2.borderStrong}`,
        background: checked ? crmV2.gold : crmV2.bg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {checked && <Check size={size - 7} color="#fff" strokeWidth={3} />}
    </span>
  )
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
  const showCheckbox = selectionActive || hovered
  const isAmont = AMONT_IDS.includes(deal.dealstage ?? '')
  const when = shortDate(deal.closedate)

  return (
    <div
      draggable
      onDragStart={e => {
        if (dragCount > 1) {
          const badge = document.createElement('div')
          badge.textContent = `${dragCount} transactions`
          badge.style.cssText = `position:fixed;top:-1000px;left:-1000px;background:${crmV2.primary};color:#fff;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;font-family:${crmV2.font};white-space:nowrap;`
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
        background: isSelected ? 'rgba(201,168,76,0.06)' : crmV2.bg,
        border: `1px solid ${isSelected ? crmV2.gold : hovered ? crmV2.borderStrong : crmV2.border}`,
        borderRadius: 12,
        boxShadow: crmV2.shadow,
        padding: 12,
        cursor: 'grab',
        transition: 'border-color 0.12s, background 0.12s',
        userSelect: 'none',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {showCheckbox && (
        <span style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, display: 'inline-flex' }}>
          <SelectBox checked={isSelected} onClick={e => { e.stopPropagation(); onToggleSelect() }} />
        </span>
      )}

      <div style={{
        fontSize: 13, fontWeight: 700, color: crmV2.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        paddingRight: showCheckbox ? 24 : 0,
      }}>
        {deal.dealname || '(sans nom)'}
      </div>
      {contactName && contactName !== deal.dealname && (
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contactName}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {deal.formation && <FormationPill value={deal.formation} />}
        {deal.contact?.classe_actuelle && <ClassePill value={deal.contact.classe_actuelle} />}
        <VerdictPill deal={deal} />
      </div>

      {/* Téléphone : uniquement pour les stages amont (inutile en aval) */}
      {isAmont && deal.contact?.phone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
          <Phone size={11} />
          {deal.contact.phone}
        </div>
      )}

      {(deal.closer || when) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, fontSize: 11, color: crmV2.textFaint }}>
          {deal.closer ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }} title={deal.closer.name}>
              <CrmV2Avatar name={deal.closer.name} color={deal.closer.avatar_color || crmV2.gold} size={20} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.closer.name}</span>
            </span>
          ) : <span />}
          {when && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <Clock size={11} />{when}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Column Drop Zone (between columns) ──────────────────────────────────────

function ColumnDropZone({
  isActive, onDrop,
}: {
  isActive: boolean
  onDrop: (draggedStageId: string) => void
}) {
  const [over, setOver] = useState(false)

  return (
    <div
      onDragOver={e => {
        const types = Array.from(e.dataTransfer.types)
        if (!types.includes('columnid')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        const colId = e.dataTransfer.getData('columnid')
        if (colId) onDrop(colId)
      }}
      style={{
        width: over ? 40 : (isActive ? 16 : 0),
        minWidth: over ? 40 : (isActive ? 16 : 0),
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {(over || isActive) && (
        <div style={{
          width: 4,
          background: over ? crmV2.link : 'rgba(0,145,174,0.3)',
          borderRadius: 4,
          margin: '8px 0',
          transition: 'all 0.15s',
          boxShadow: over ? '0 0 12px rgba(0,145,174,0.45)' : 'none',
        }} />
      )}
    </div>
  )
}

// ── Board Column ─────────────────────────────────────────────────────────────

function BoardColumn({
  stageId, deals, onSelectDeal,
  dragOverStage, setDragOverStage,
  selectedDeals, onToggleSelect, onSelectAllInColumn, onDragStartMulti,
  onDropDeals,
  onColumnDragStart, isDraggingColumn,
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
  onColumnDragStart: (e: React.DragEvent, stageId: string) => void
  isDraggingColumn: boolean
}) {
  const [headerHovered, setHeaderHovered] = useState(false)
  const stage = getStageMeta(stageId)
  if (!stage) return null

  const isOver = dragOverStage === stageId
  const selectionActive = selectedDeals.size > 0
  const allInColumnSelected = deals.length > 0 && deals.every(d => selectedDeals.has(d.hubspot_deal_id))

  return (
    <div
      onDragOver={e => {
        // Only handle card drags here, not column drags
        const types = Array.from(e.dataTransfer.types)
        if (types.includes('columnid')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverStage(stageId)
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverStage(null)
        }
      }}
      onDrop={e => {
        // Only handle card drops, not column drops
        const types = Array.from(e.dataTransfer.types)
        if (types.includes('columnid')) return
        e.preventDefault()
        setDragOverStage(null)

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
        width: 250,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? 'rgba(201,168,76,0.08)' : crmV2.bgHover,
        borderRadius: crmV2.radiusLg,
        border: `1px solid ${isOver ? crmV2.gold : crmV2.border}`,
        transition: 'background 0.15s, border-color 0.15s',
        overflow: 'hidden',
        opacity: isDraggingColumn ? 0.5 : 1,
      }}
    >
      {/* En-tête — glissable pour RÉORDONNER les colonnes */}
      <div
        draggable
        onDragStart={e => {
          e.stopPropagation()
          onColumnDragStart(e, stageId)
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        title="Glisser pour réordonner les colonnes"
        style={{
          padding: '12px 14px',
          background: crmV2.bg,
          borderBottom: `1px solid ${crmV2.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {(headerHovered || selectionActive) && deals.length > 0 ? (
          <SelectBox
            checked={allInColumnSelected}
            size={16}
            onClick={e => { e.stopPropagation(); e.preventDefault(); onSelectAllInColumn(stageId) }}
          />
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stage.label}
        </span>
        {headerHovered && <GripVertical size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />}
        <span style={{
          background: stage.bg,
          color: stage.color,
          borderRadius: 999,
          padding: '1px 8px',
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {deals.length}
        </span>
      </div>

      {/* Indicateur de dépôt */}
      {isOver && (
        <div style={{
          padding: '6px 0', fontSize: 12, fontWeight: 700,
          color: crmV2.goldDark, background: crmV2.goldSoft,
          borderBottom: `1px solid ${crmV2.goldBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <ArrowDown size={13} /> Déposer ici
        </div>
      )}

      {/* Cartes */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {deals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: crmV2.textFaint, fontSize: 12 }}>
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

// ── Mobile (M4) : pastilles d'étapes qui défilent + cartes ───────────────────

function MobileBoard({
  stageOrder, columns, onSelectDeal,
}: {
  stageOrder: string[]
  columns: Record<string, TransactionDetail[]>
  onSelectDeal: (deal: TransactionDetail) => void
}) {
  const [active, setActive] = useState<string | null>(null)
  const current = active && stageOrder.includes(active) ? active : stageOrder[0]
  const deals = columns[current] ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'flex', gap: 6, padding: '12px', overflowX: 'auto', scrollbarWidth: 'none',
        background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0,
      }}>
        {stageOrder.map(stageId => {
          const s = getStageMeta(stageId)
          if (!s) return null
          const on = stageId === current
          return (
            <button
              key={stageId}
              type="button"
              onClick={() => setActive(stageId)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
                borderRadius: 999, padding: '0 12px', height: 36, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                background: on ? crmV2.primary : crmV2.bg, color: on ? '#fff' : crmV2.text,
                border: `1px solid ${on ? crmV2.primary : crmV2.borderStrong}`, cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
              {s.label}
              <span style={{ fontWeight: 600, opacity: 0.75 }}>{(columns[stageId] ?? []).length}</span>
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {deals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: crmV2.textFaint, fontSize: 13 }}>Aucune transaction</div>
        ) : deals.map(deal => {
          const contactName = [deal.contact?.firstname, deal.contact?.lastname].filter(Boolean).join(' ')
          const when = shortDate(deal.closedate)
          return (
            <button
              key={deal.hubspot_deal_id}
              type="button"
              onClick={() => onSelectDeal(deal)}
              style={{
                appearance: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', width: '100%',
                background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
                boxShadow: crmV2.shadow, padding: '12px 14px', flexShrink: 0, color: crmV2.text,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deal.dealname || contactName || '(sans nom)'}
                </span>
                {when && (
                  <span style={{ fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} />{when}
                  </span>
                )}
              </div>
              {(deal.formation || deal.contact?.classe_actuelle || deal.contact?.parcoursup_verdict) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {deal.formation && <FormationPill value={deal.formation} />}
                  {deal.contact?.classe_actuelle && <ClassePill value={deal.contact.classe_actuelle} />}
                  <VerdictPill deal={deal} />
                </div>
              )}
              {deal.closer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: crmV2.textMuted }}>
                  <CrmV2Avatar name={deal.closer.name} color={deal.closer.avatar_color || crmV2.gold} size={20} />
                  Closer : {deal.closer.name}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Board ───────────────────────────────────────────────────────────────

export default function TransactionBoard({
  columns, onStageChange, onBatchStageChange, onDeleteDeals, onSelectDeal,
  undoAction, onUndo, pipelineId,
}: Props) {
  const isMobile = useIsMobile()
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null)
  // Stages selon le pipeline. Si pipelineId est 'all' ou inconnu, on retombe
  // sur l'ordre de la saison courante (2026-2027). Sinon on prend les stages
  // exacts du pipeline (les IDs different par saison).
  const pipelineStageOrder = getStagesForPipeline(pipelineId || '2313043166').map(s => s.id)
  const [stageOrder, setStageOrder] = useState<string[]>(pipelineStageOrder)
  // Refresh quand le pipeline change
  useEffect(() => {
    setStageOrder(getStagesForPipeline(pipelineId || '2313043166').map(s => s.id))
  }, [pipelineId])

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
    e.dataTransfer.setData('columnid', stageId)
    setDraggingColumn(stageId)

    const stageName = getStageMeta(stageId)?.label ?? stageId
    const badge = document.createElement('div')
    badge.textContent = stageName
    badge.style.cssText = `position:fixed;top:-1000px;left:-1000px;background:${crmV2.link};color:#fff;padding:8px 16px;border-radius:999px;font-size:13px;font-weight:700;font-family:${crmV2.font};white-space:nowrap;`
    document.body.appendChild(badge)
    e.dataTransfer.setDragImage(badge, 0, 0)
    setTimeout(() => document.body.removeChild(badge), 0)
  }

  function handleColumnDrop(targetIndex: number, draggedStageId: string) {
    setDraggingColumn(null)
    setStageOrder(prev => {
      const fromIdx = prev.indexOf(draggedStageId)
      if (fromIdx === -1) return prev
      const next = prev.filter(id => id !== draggedStageId)
      // Adjust target index if we removed an item before it
      const adjustedIdx = targetIndex > fromIdx ? targetIndex - 1 : targetIndex
      next.splice(adjustedIdx, 0, draggedStageId)
      localStorage.setItem('tx-column-order', JSON.stringify(next))
      return next
    })
  }

  function handleDropDeals(dealIds: string[], targetStage: string) {
    // Lock UI : on verifie la transition AVANT d'appeler les handlers parents.
    // Stages aval (3165428982/83/84/85) -> non modifiables manuellement.
    // Exception : amont -> Ferme Perdu (3165428985) autorise.
    const AMONT = new Set(AMONT_IDS)
    const FERME = '3165428985'
    const allowed = (from: string, to: string): boolean => {
      if (!from || !to) return false
      if (from === to) return true
      if (AMONT.has(from) && AMONT.has(to)) return true
      if (AMONT.has(from) && to === FERME) return true
      return false
    }
    // Trouver le stage source
    const fromStages = new Set<string>()
    for (const sid of Object.keys(columns)) {
      for (const d of columns[sid]) {
        if (dealIds.includes(d.hubspot_deal_id)) fromStages.add(sid)
      }
    }
    for (const fs of fromStages) {
      if (!allowed(fs, targetStage)) {
        alert('Ce stage est piloté automatiquement par la plateforme Diploma. Modification manuelle interdite (sauf passage en Fermé Perdu depuis un stage amont).')
        return
      }
    }
    if (dealIds.length === 1) {
      onStageChange(dealIds[0], targetStage)
    } else {
      onBatchStageChange(dealIds, targetStage)
    }
    setSelectedDeals(new Set())
  }

  function handleDeleteSelected() {
    const dealIds = Array.from(selectedDeals)
    if (dealIds.length === 0) return

    // Garde-fou : interdire la suppression si une transaction selectionnee est
    // dans un stage aval pilote par la plateforme de preinscription.
    // (Le serveur refait la verification, c'est la source de verite.)
    for (const sid of Object.keys(columns)) {
      const protectedHere = !isDeletableStage(sid)
      if (!protectedHere) continue
      for (const d of columns[sid]) {
        if (selectedDeals.has(d.hubspot_deal_id)) {
          alert(DELETE_LOCK_MESSAGE)
          return
        }
      }
    }

    const msg = dealIds.length === 1
      ? 'Supprimer définitivement cette transaction ?\n\nCette action est irréversible.'
      : `Supprimer définitivement ces ${dealIds.length} transactions ?\n\nCette action est irréversible.`
    if (!window.confirm(msg)) return

    onDeleteDeals(dealIds)
    setSelectedDeals(new Set())
  }

  const hasSelection = selectedDeals.size > 0
  const gutter = isMobile ? 12 : 28
  const barStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 8px 8px 16px', borderRadius: crmV2.radiusLg, margin: `12px ${gutter}px 0`, flexShrink: 0,
    // Passe à la ligne sur petit écran (sans effet sur desktop)
    flexWrap: 'wrap', gap: 8,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Barre d'annulation */}
      {undoAction && (
        <div style={{ ...barStyle, background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.30)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#d13a41' }}>
            {undoAction.label}
          </span>
          <CrmV2Button variant="danger" size="sm" icon={<Undo2 size={14} />} onClick={onUndo}>
            Annuler (Ctrl+Z)
          </CrmV2Button>
        </div>
      )}

      {/* Barre de sélection */}
      {hasSelection && (
        <div style={{ ...barStyle, background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.goldDark }}>
              {selectedDeals.size} transaction{selectedDeals.size > 1 ? 's' : ''} sélectionnée{selectedDeals.size > 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 12, color: crmV2.textMuted }}>
              Glissez une carte sélectionnée pour déplacer le groupe
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CrmV2Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={handleDeleteSelected}>
              Supprimer
            </CrmV2Button>
            <CrmV2Button variant="secondary" size="sm" onClick={() => setSelectedDeals(new Set())}>
              Tout désélectionner
            </CrmV2Button>
          </div>
        </div>
      )}

      {isMobile ? (
        <MobileBoard stageOrder={stageOrder} columns={columns} onSelectDeal={onSelectDeal} />
      ) : (
        /* Colonnes, avec zones de dépôt entre elles */
        <div
          onDragEnd={() => setDraggingColumn(null)}
          style={{
            display: 'flex', gap: 12, flex: 1, minHeight: 0, alignItems: 'stretch',
            overflowX: 'auto', overflowY: 'hidden', padding: `16px ${gutter}px 20px`,
          }}
        >
          {stageOrder.map((stageId, idx) => (
            <div key={stageId} style={{ display: 'flex', flexShrink: 0 }}>
              {/* Zone de dépôt AVANT cette colonne */}
              <ColumnDropZone
                isActive={draggingColumn !== null && draggingColumn !== stageId && (idx === 0 || stageOrder[idx - 1] !== draggingColumn)}
                onDrop={(draggedId) => handleColumnDrop(idx, draggedId)}
              />
              <BoardColumn
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
                onColumnDragStart={handleColumnDragStart}
                isDraggingColumn={draggingColumn === stageId}
              />
              {/* Zone de dépôt APRÈS la dernière colonne */}
              {idx === stageOrder.length - 1 && (
                <ColumnDropZone
                  isActive={draggingColumn !== null && draggingColumn !== stageId}
                  onDrop={(draggedId) => handleColumnDrop(stageOrder.length, draggedId)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
