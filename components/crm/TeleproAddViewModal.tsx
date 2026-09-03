'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'

export type CatalogViewOption = {
  id: string
  name: string
}

type Props = {
  catalogViews: CatalogViewOption[]
  layoutViewIds: string[]
  onClose: () => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
}

export default function TeleproAddViewModal({
  catalogViews,
  layoutViewIds,
  onClose,
  onPin,
  onUnpin,
}: Props) {
  const [query, setQuery] = useState('')
  const pinnedSet = useMemo(() => new Set(layoutViewIds), [layoutViewIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = catalogViews.filter(v => !q || v.name.toLowerCase().includes(q))
    return {
      available: rows.filter(v => !pinnedSet.has(v.id)),
      pinned: rows.filter(v => pinnedSet.has(v.id)),
    }
  }, [catalogViews, pinnedSet, query])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 14, width: 460, maxHeight: '74vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 18px 48px rgba(18,49,77,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e5ddc8' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0F1F3D' }}>Ajouter une vue</span>
              <p style={{ margin: '5px 0 0', fontSize: 12, color: '#3D5275', lineHeight: 1.45 }}>
                Toutes les vues créées en admin. Une fois ajoutée, tu ne verras que tes leads.
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
                  ? 'Aucune vue admin disponible.'
                  : query.trim()
                    ? 'Aucune vue ne correspond à la recherche.'
                    : 'Toutes les vues admin sont déjà dans tes onglets.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.available.map(view => (
                  <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#0F1F3D' }}>{view.name}</span>
                    <button
                      onClick={() => onPin(view.id)}
                      style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 6, color: '#C9A84C', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={12} /> Ajouter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {filtered.pinned.length > 0 && (
            <section>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c98b6', marginBottom: 8 }}>
                Déjà dans tes onglets
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.pinned.map(view => (
                  <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f6f9fc', border: '1px solid #e5ddc8', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#0F1F3D' }}>{view.name}</span>
                    <button
                      onClick={() => onUnpin(view.id)}
                      title="Retirer de mes onglets"
                      style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#3D5275' }}
                    >
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
