import { RDV_BRANDS, normalizeRdvBrand } from '@/lib/rdv-brand'

/**
 * Logo de marque d'un RDV : « M » Medibox, « L » Linova, « E » Edumove.
 * Rien pour Diploma Santé (marque par défaut de l'agenda).
 */
export default function MediboxBadge({
  brand,
  compact = false,
  style,
}: {
  brand?: string | null
  /** true = lettre seule (blocs étroits de l'agenda semaine) */
  compact?: boolean
  style?: React.CSSProperties
}) {
  const b = normalizeRdvBrand(brand)
  if (b === 'diploma') return null
  const conf = RDV_BRANDS[b]
  return (
    <span
      title={`RDV ${conf.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: conf.color, color: '#fff',
        fontSize: compact ? 8.5 : 10.5, fontWeight: 800, letterSpacing: '0.04em',
        lineHeight: 1.5, textTransform: 'uppercase',
        padding: compact ? '0 4px' : '1px 7px', borderRadius: 4,
        flexShrink: 0, verticalAlign: 'middle',
        ...style,
      }}
    >
      {compact ? conf.letter : conf.label}
    </span>
  )
}
