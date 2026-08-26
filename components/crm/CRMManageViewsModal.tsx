'use client'

import { Plus, Pen, X } from 'lucide-react'
import type { CRMSavedView } from '@/lib/crm-views'

type Props = {
  catalogViews: CRMSavedView[]
  layoutViewIds: string[]
  renamingViewId: string | null
  onClose: () => void
  onRenameStart: (id: string, name: string) => void
  onRenameCommit: (id: string, name: string) => void
  onRenameCancel: () => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
}

export function CRMManageViewsModal({
  catalogViews,
  layoutViewIds,
  renamingViewId,
  onClose,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onPin,
  onUnpin,
}: Props) {
  const pinned = catalogViews.filter(v => layoutViewIds.includes(v.id))
  const available = catalogViews.filter(v => !layoutViewIds.includes(v.id))

  const renderRow = (view: CRMSavedView, action: 'pin' | 'unpin') => {
    const isRenaming = renamingViewId === view.id
    const ruleCount = view.groups.reduce((s, g) => s + g.rules.length, 0)
    return (
      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <input
              autoFocus
              defaultValue={view.name}
              onKeyDown={e => {
                if (e.key === 'Enter') onRenameCommit(view.id, (e.target as HTMLInputElement).value)
                if (e.key === 'Escape') onRenameCancel()
              }}
              onBlur={e => onRenameCommit(view.id, e.target.value)}
              style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid #C9A84C', borderRadius: 5, padding: '3px 8px', color: '#C9A84C', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%' }}
            />
          ) : (
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1F3D' }}>{view.name}</span>
              {ruleCount > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: '#0F1F3D' }}>{ruleCount} filtre{ruleCount > 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => onRenameStart(view.id, view.name)}
          title="Renommer (catalogue)"
          style={{ background: 'none', border: 'none', color: '#0F1F3D', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#C9A84C')}
          onMouseLeave={e => (e.currentTarget.style.color = '#0F1F3D')}
        >
          <Pen size={13} />
        </button>
        {action === 'unpin' ? (
          <button
            onClick={() => onUnpin(view.id)}
            title="Retirer de mes onglets"
            style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3D5275')}
          >
            Masquer
          </button>
        ) : (
          <button
            onClick={() => onPin(view.id)}
            title="Ajouter à mes onglets"
            style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 6, color: '#C9A84C', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}
          >
            <Plus size={12} /> Ajouter
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 14, width: 460, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0F1F3D' }}>Mes onglets</span>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#3D5275', lineHeight: 1.4 }}>
              Les vues restent dans le catalogue. Masquer un onglet ne le retire que de ton affichage.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c98b6', marginBottom: 8 }}>Affichées</div>
            {pinned.length === 0 ? (
              <p style={{ color: '#3D5275', fontSize: 13, margin: 0 }}>Aucun onglet perso — seulement « Tous les leads ».</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pinned.map(v => renderRow(v, 'unpin'))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c98b6', marginBottom: 8 }}>Catalogue</div>
            {available.length === 0 ? (
              <p style={{ color: '#3D5275', fontSize: 13, margin: 0 }}>Toutes les vues du catalogue sont déjà dans tes onglets.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {available.map(v => renderRow(v, 'pin'))}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5ddc8' }}>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '9px', background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, color: '#4cabdb', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
