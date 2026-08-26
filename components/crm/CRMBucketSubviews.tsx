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
        padding: '6px 20px 8px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflowX: 'auto',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#7c98b6',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          marginRight: 2,
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
              padding: '4px 11px',
              borderRadius: 999,
              border: isActive ? '1px solid #C9A84C' : '1px solid #dfe3eb',
              background: isActive ? 'rgba(201,168,76,0.16)' : '#ffffff',
              color: isActive ? '#12314d' : '#516f90',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: isActive ? 700 : 500,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {label}
            {typeof count === 'number' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: isActive ? '#3D5275' : '#7c98b6',
                  background: isActive ? 'rgba(18,49,77,0.08)' : '#f5f8fa',
                  borderRadius: 6,
                  padding: '0 5px',
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
