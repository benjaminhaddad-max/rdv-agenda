'use client'

import type { CSSProperties } from 'react'
import { fmtCount } from '@/components/crm/CRMUIBits'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
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
  padding: '6px 28px 8px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  overflowX: 'auto',
}

const LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: crmV2.textFaint,
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
        height: 30,
        boxSizing: 'border-box',
        padding: '0 12px',
        borderRadius: crmV2.radiusPill,
        border: `1px solid ${active ? crmV2.gold : crmV2.borderStrong}`,
        background: active ? crmV2.goldSoft : crmV2.bg,
        color: active ? crmV2.text : crmV2.textMuted,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
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
            fontSize: 11,
            fontWeight: 700,
            color: active ? crmV2.goldDark : crmV2.textFaint,
            background: active ? 'rgba(201,168,76,0.18)' : crmV2.chipBg,
            borderRadius: crmV2.radiusPill,
            padding: '1px 6px',
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
 * Distincte des onglets de vues : pastilles, label explicite.
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
  const isMobile = useIsMobile()
  const row: CSSProperties = isMobile ? { ...ROW_STYLE, paddingLeft: 12, paddingRight: 12 } : ROW_STYLE

  return (
    <div className="crm-bucket-subviews-bar" style={{ flexShrink: 0 }}>
      {facets && onFacetsChange && (
        <div style={{ ...row, paddingBottom: 0 }}>
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
      <div style={facets ? { ...row, paddingBottom: 0 } : row}>
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
        <div style={row}>
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
