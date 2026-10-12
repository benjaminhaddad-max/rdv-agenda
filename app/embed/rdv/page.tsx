import BookingDiploma from '@/components/BookingDiploma'
import { extractBookingPrefill, logBookingProbe } from '@/lib/booking-prefill'

// Version iframe — inline via /api/booking/embed.js ou popup via widget.js.
// Hérite du layout /embed (fond transparent, body overflow hidden) :
// le composant gère son propre scroll interne en mode embedded.

export default async function EmbedRdvPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  // Pré-remplissage (ex. lien de planification d'un formulaire Meta Lead Ads)
  const prefill = extractBookingPrefill(sp)
  await logBookingProbe('/embed/rdv', sp, prefill)
  return (
    <BookingDiploma
      embedded
      embedPopup={sp.popup === '1'}
      prefill={prefill}
      utm={{
        utm_source: str(sp.utm_source),
        utm_medium: str(sp.utm_medium),
        utm_campaign: str(sp.utm_campaign),
        utm_content: str(sp.utm_content),
        ref: str(sp.ref),
      }}
    />
  )
}

function str(v: string | string[] | undefined): string | null {
  return (Array.isArray(v) ? v[0] : v) ?? null
}
