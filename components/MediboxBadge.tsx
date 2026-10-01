import { RDV_BRANDS, isMediboxBrand } from '@/lib/rdv-brand'

/** Pastille « Medibox » : distingue les RDV Medibox des RDV Diploma Santé. */
export default function MediboxBadge({
  brand,
  compact = false,
  style,
}: {
  brand?: string | null
  /** true = simple « M » (blocs étroits de l'agenda semaine) */
  compact?: boolean
  style?: React.CSSProperties
}) {
  if (!isMediboxBrand(brand)) return null
  return (
    <span
      title="RDV Medibox"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: RDV_BRANDS.medibox.color, color: '#fff',
        fontSize: compact ? 8.5 : 10.5, fontWeight: 800, letterSpacing: '0.04em',
        lineHeight: 1.5, textTransform: 'uppercase',
        padding: compact ? '0 4px' : '1px 7px', borderRadius: 4,
        flexShrink: 0, verticalAlign: 'middle',
        ...style,
      }}
    >
      {compact ? 'M' : 'Medibox'}
    </span>
  )
}
