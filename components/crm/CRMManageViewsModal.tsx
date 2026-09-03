'use client'

import { useMemo, useState } from 'react'
import { Plus, Pen, Search, X } from 'lucide-react'
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
      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: action === 'pin' ? '#ffffff' : '#f6f9fc', border: '1px solid #e5ddc8', borderRadius: 8, padding: '10px 12px' }}>
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
              style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid #C9A84C', borderRadius: 5, padding: '3px 8px', color: '#C9A84C', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%' }}
            />
          ) : (
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1F3D' }}>{view.name}</span>
              {ruleCount > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: '#3D5275' }}>{ruleCount} filtre{ruleCount > 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => { setRenamingId(view.id); setRenameDraft(view.name) }}
          title="Renommer pour tous les admins et télépros"
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
            Retirer
          </button>
        ) : (
          <button
            onClick={() => onPin(view.id)}
            title="Ajouter à mes onglets"
            style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 6, color: '#C9A84C', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            <Plus size={12} /> Ajouter
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 14, width: 480, maxHeight: '78vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 18px 48px rgba(18,49,77,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e5ddc8' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0F1F3D' }}>Ajouter une vue</span>
              <p style={{ margin: '5px 0 0', fontSize: 12, color: '#3D5275', lineHeight: 1.45 }}>
                Annuaire partagé entre tous les admins. Ajoute une vue déjà créée à tes onglets, sans la recréer.
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7c98b6', pointerEvents: 'none' }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher une vue…"
              style={{
                width: '100%', boxSizing: 'border-box', background: '#f6f9fc',
                border: '1px solid #e5ddc8', borderRadius: 8, padding: '8px 12px 8px 30px',
                fontSize: 13, fontFamily: 'inherit', color: '#0F1F3D', outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c98b6', marginBottom: 8 }}>
              Disponibles
            </div>
            {filtered.available.length === 0 ? (
              <p style={{ color: '#3D5275', fontSize: 13, margin: 0 }}>
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
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c98b6', marginBottom: 8 }}>
                Déjà dans tes onglets
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.pinned.map(v => renderRow(v, 'unpin'))}
              </div>
            </section>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5ddc8' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c98b6', marginBottom: 8 }}>
            Nouvelle vue
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#3D5275', lineHeight: 1.4 }}>
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
              style={{
                flex: 1, minWidth: 0, background: '#f6f9fc', border: '1px solid #e5ddc8',
                borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
                color: '#0F1F3D', outline: 'none',
              }}
            />
            <button
              onClick={submitCreate}
              disabled={!newName.trim()}
              style={{
                padding: '8px 12px', background: newName.trim() ? '#C9A84C' : '#f5f8fa',
                border: '1px solid', borderColor: newName.trim() ? '#C9A84C' : '#e5ddc8',
                borderRadius: 8, color: newName.trim() ? '#12314d' : '#7c98b6',
                fontSize: 12, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
              }}
            >
              <Plus size={12} /> Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
