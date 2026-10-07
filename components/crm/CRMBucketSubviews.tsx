'use client'

import type { CSSProperties } from 'react'
import { fmtCount } from '@/components/crm/CRMUIBits'
import type { CRMSavedView } from '@/lib/crm-views'
import {
  BUCKET_FACET_CLASSES,
  BUCKET_FACET_ZONES,
  hasActiveFacets,
  type BucketFacetSelection,
} from '@/lib/crm-attribution-buckets'

type Props = {
  parent: CRMSavedView
  subviews: CRMSavedView[]
  activeViewId: string
  viewCounts: Record<string, number>
  onSelect: (view: CRMSavedView) => void
  /** Filtres rapides Classe / Zone — affichés seulement si fournis. */
  facets?: BucketFacetSelection
  onFacetsChange?: (next: BucketFacetSelection) => void
}

const ROW_STYLE: CSSProperties = {
  padding: '6px 20px 8px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  overflowX: 'auto',
}

const LABEL_STYLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#7c98b6',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginRight: 2,
  minWidth: 72,
}

function Pill({
  label,
  active,
  count,
  onClick,
}: {
  label: string
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 11px',
        borderRadius: 999,
        border: active ? '1px solid #C9A84C' : '1px solid #dfe3eb',
        background: active ? 'rgba(201,168,76,0.16)' : '#ffffff',
        color: active ? '#12314d' : '#516f90',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontFamily: 'inherit',
        fontWeight: active ? 700 : 500,
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
            color: active ? '#3D5275' : '#7c98b6',
            background: active ? 'rgba(18,49,77,0.08)' : '#f5f8fa',
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
  facets,
  onFacetsChange,
}: Props) {
  const pills: CRMSavedView[] = [parent, ...subviews]
  // Les compteurs des sous-vues ne tiennent pas compte des facettes : on les
  // masque quand une facette est active pour ne pas afficher de faux chiffres.
  const showCounts = !facets || !hasActiveFacets(facets)

  return (
    <div className="crm-bucket-subviews-bar" style={{ flexShrink: 0 }}>
      {facets && onFacetsChange && (
        <div style={{ ...ROW_STYLE, paddingBottom: 0 }}>
          <span style={LABEL_STYLE}>Classe</span>
          <Pill label="Toutes" active={!facets.classe} onClick={() => onFacetsChange({ ...facets, classe: '' })} />
          {BUCKET_FACET_CLASSES.map(c => (
            <Pill
              key={c.key}
              label={c.label}
              active={facets.classe === c.key}
              onClick={() => onFacetsChange({ ...facets, classe: facets.classe === c.key ? '' : c.key })}
            />
          ))}
        </div>
      )}
      <div style={facets ? { ...ROW_STYLE, paddingBottom: 0 } : ROW_STYLE}>
        <span style={facets ? LABEL_STYLE : { ...LABEL_STYLE, minWidth: undefined }}>Sous-vues</span>
        {pills.map(view => (
          <Pill
            key={view.id}
            label={view.id === parent.id ? 'Tous' : view.name}
            active={activeViewId === view.id}
            count={showCounts ? viewCounts[view.id] : undefined}
            onClick={() => onSelect(view)}
          />
        ))}
      </div>
      {facets && onFacetsChange && (
        <div style={ROW_STYLE}>
          <span style={LABEL_STYLE}>Zone</span>
          <Pill label="Toutes" active={!facets.zone} onClick={() => onFacetsChange({ ...facets, zone: '' })} />
          {BUCKET_FACET_ZONES.map(z => (
            <Pill
              key={z.key}
              label={z.label}
              active={facets.zone === z.key}
              onClick={() => onFacetsChange({ ...facets, zone: facets.zone === z.key ? '' : z.key })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
