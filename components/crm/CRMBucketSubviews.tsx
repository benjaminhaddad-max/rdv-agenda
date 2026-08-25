'use client'

import { fmtCount } from '@/components/crm/CRMUIBits'
import type { CRMSavedView } from '@/lib/crm-views'

type Props = {
  parent: CRMSavedView
  subviews: CRMSavedView[]
  activeViewId: string
  viewCounts: Record<string, number>
  onSelect: (view: CRMSavedView) => void
}

/**
 * Rangée de sous-vues sous l’onglet bucket.
 * Distincte des onglets HubSpot : pills, fond contrasté, label explicite.
 */
export function CRMBucketSubviewsBar({
  parent,
  subviews,
  activeViewId,
  viewCounts,
  onSelect,
}: Props) {
  const pills: CRMSavedView[] = [parent, ...subviews]

  return (
    <div
      className="crm-bucket-subviews-bar"
      style={{
        padding: '10px 20px 12px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#C9A84C',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          marginRight: 4,
        }}
      >
        Sous-vues
      </span>
      {pills.map(view => {
        const isTous = view.id === parent.id
        const isActive = activeViewId === view.id
        const label = isTous ? 'Tous' : view.name
        const count = viewCounts[view.id]
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onSelect(view)}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              border: isActive ? '1px solid #C9A84C' : '1px solid rgba(255,255,255,0.18)',
              background: isActive ? '#C9A84C' : 'rgba(255,255,255,0.08)',
              color: isActive ? '#12314d' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: isActive ? 800 : 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {label}
            {typeof count === 'number' && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isActive ? '#12314d' : '#C9A84C',
                  background: isActive ? 'rgba(18,49,77,0.12)' : 'rgba(0,0,0,0.25)',
                  borderRadius: 6,
                  padding: '1px 6px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCount(count)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
