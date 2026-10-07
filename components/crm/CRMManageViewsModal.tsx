'use client'

import { useMemo, useState } from 'react'
import { Plus, Pen } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Pill, CrmV2Search } from '@/components/crm-v2/primitives'
import { CrmV2ModalHeader, CrmV2ModalShell, crmV2FieldStyle, crmV2LabelStyle } from '@/components/crm-v2/modals/ModalShell'
import type { CRMSavedView } from '@/lib/crm-views'

type Props = {
  catalogViews: CRMSavedView[]
  layoutViewIds: string[]
  onClose: () => void
  onRename: (id: string, name: string) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
  onCreate: (name: string) => void
}

export function CRMManageViewsModal({
  catalogViews,
  layoutViewIds,
  onClose,
  onRename,
  onPin,
  onUnpin,
  onCreate,
}: Props) {
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const pinnedSet = useMemo(() => new Set(layoutViewIds), [layoutViewIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = catalogViews.filter(v => !q || v.name.toLowerCase().includes(q))
    return {
      available: rows.filter(v => !pinnedSet.has(v.id)),
      pinned: rows.filter(v => pinnedSet.has(v.id)),
    }
  }, [catalogViews, pinnedSet, query])

  function submitCreate() {
    const name = newName.trim()
    if (!name) return
    onCreate(name)
  }

  function commitRename(id: string, raw: string) {
    const next = raw.trim()
    const current = catalogViews.find(v => v.id === id)?.name ?? ''
    setRenamingId(null)
    if (!next || next === current) return
    onRename(id, next)
  }

  const renderRow = (view: CRMSavedView, action: 'pin' | 'unpin') => {
    const isRenaming = renamingId === view.id
    const ruleCount = view.groups.reduce((s, g) => s + g.rules.length, 0)
    return (
      <div key={view.id} style={{
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, boxSizing: 'border-box',
        background: action === 'pin' ? crmV2.bg : crmV2.bgHover, border: `1px solid ${crmV2.border}`,
        borderRadius: 12, padding: '6px 8px 6px 14px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(view.id, renameDraft)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              onBlur={() => commitRename(view.id, renameDraft)}
              style={{ ...crmV2FieldStyle, height: 32, fontWeight: 600, borderColor: crmV2.gold, boxShadow: `0 0 0 3px ${crmV2.goldSoft}` }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view.name}</span>
              {ruleCount > 0 && (
                <CrmV2Pill style={{ fontSize: 11, padding: '1px 8px', color: crmV2.textMuted }}>{ruleCount} filtre{ruleCount > 1 ? 's' : ''}</CrmV2Pill>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setRenamingId(view.id); setRenameDraft(view.name) }}
          title="Renommer pour tous les admins et télépros"
          aria-label="Renommer"
          style={{
            width: 32, height: 32, borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
            color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = crmV2.goldDark)}
          onMouseLeave={e => (e.currentTarget.style.color = crmV2.textMuted)}
        >
          <Pen size={14} />
        </button>
        {action === 'unpin' ? (
          <CrmV2Button variant="ghost" size="sm" title="Retirer de mes onglets" onClick={() => onUnpin(view.id)} style={{ color: crmV2.textMuted }}>
            Retirer
          </CrmV2Button>
        ) : (
          <CrmV2Button variant="gold" size="sm" title="Ajouter à mes onglets" icon={<Plus size={14} />} onClick={() => onPin(view.id)}>
            Ajouter
          </CrmV2Button>
        )}
      </div>
    )
  }

  return (
    <CrmV2ModalShell
      onClose={onClose}
      width={500}
      maxHeight="82vh"
      header={
        <CrmV2ModalHeader
          title="Ajouter une vue"
          subtitle="Annuaire partagé entre tous les admins. Ajoute une vue déjà créée à tes onglets, sans la recréer."
          onClose={onClose}
          extra={
            <CrmV2Search
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher une vue…"
              style={{ minWidth: 0 }}
            />
          }
        />
      }
      bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      footer={
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...crmV2LabelStyle, marginBottom: 4 }}>Nouvelle vue</div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: crmV2.textMuted, lineHeight: 1.4 }}>
            Enregistre les filtres actuels. Elle sera visible dans l’annuaire des autres admins.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitCreate()
              }}
              placeholder="Nom de la vue…"
              style={{ ...crmV2FieldStyle, flex: 1, minWidth: 0 }}
            />
            <CrmV2Button variant="primary" onClick={submitCreate} disabled={!newName.trim()} icon={<Plus size={14} />}>
              Créer
            </CrmV2Button>
          </div>
        </div>
      }
    >
      <section>
        <div style={{ ...crmV2LabelStyle, marginBottom: 8 }}>Disponibles</div>
        {filtered.available.length === 0 ? (
          <p style={{ color: crmV2.textMuted, fontSize: 13, margin: 0 }}>
            {catalogViews.length === 0
              ? 'Aucune vue dans l’annuaire pour l’instant.'
              : query.trim()
                ? 'Aucune vue ne correspond à la recherche.'
                : 'Toutes les vues de l’annuaire sont déjà dans tes onglets.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.available.map(v => renderRow(v, 'pin'))}
          </div>
        )}
      </section>

      {filtered.pinned.length > 0 && (
        <section>
          <div style={{ ...crmV2LabelStyle, marginBottom: 8 }}>Déjà dans tes onglets</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.pinned.map(v => renderRow(v, 'unpin'))}
          </div>
        </section>
      )}
    </CrmV2ModalShell>
  )
}
