'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Search } from '@/components/crm-v2/primitives'
import { CrmV2ModalHeader, CrmV2ModalShell, crmV2LabelStyle } from '@/components/crm-v2/modals/ModalShell'

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

  const rowStyle = (pinned: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, boxSizing: 'border-box',
    background: pinned ? crmV2.bgHover : crmV2.bg, border: `1px solid ${crmV2.border}`,
    borderRadius: 12, padding: '6px 8px 6px 14px',
  })

  return (
    <CrmV2ModalShell
      onClose={onClose}
      width={460}
      maxHeight="78vh"
      header={
        <CrmV2ModalHeader
          title="Ajouter une vue"
          subtitle="Toutes les vues créées en admin. Une fois ajoutée, tu ne verras que tes leads."
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
    >
      <section>
        <div style={{ ...crmV2LabelStyle, marginBottom: 8 }}>Disponibles</div>
        {filtered.available.length === 0 ? (
          <p style={{ color: crmV2.textMuted, fontSize: 13, margin: 0 }}>
            {catalogViews.length === 0
              ? 'Aucune vue admin disponible.'
              : query.trim()
                ? 'Aucune vue ne correspond à la recherche.'
                : 'Toutes les vues admin sont déjà dans tes onglets.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.available.map(view => (
              <div key={view.id} style={rowStyle(false)}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: crmV2.text }}>{view.name}</span>
                <CrmV2Button variant="gold" size="sm" icon={<Plus size={14} />} onClick={() => onPin(view.id)}>
                  Ajouter
                </CrmV2Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {filtered.pinned.length > 0 && (
        <section>
          <div style={{ ...crmV2LabelStyle, marginBottom: 8 }}>Déjà dans tes onglets</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.pinned.map(view => (
              <div key={view.id} style={rowStyle(true)}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: crmV2.text }}>{view.name}</span>
                <CrmV2Button variant="ghost" size="sm" title="Retirer de mes onglets" onClick={() => onUnpin(view.id)} style={{ color: crmV2.textMuted }}>
                  Retirer
                </CrmV2Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </CrmV2ModalShell>
  )
}
