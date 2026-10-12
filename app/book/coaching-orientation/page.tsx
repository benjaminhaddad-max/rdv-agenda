import type { Metadata } from 'next'
import BookingDiploma from '@/components/BookingDiploma'
import { extractBookingPrefill, logBookingProbe } from '@/lib/booking-prefill'

// Page publique « Coaching orientation médecine » : même parcours que /book/diploma,
// visio uniquement, sans lieu ni formation souhaitée.
// Route statique : prioritaire sur /book/[slug] dans le routeur Next.

export const metadata: Metadata = {
  title: 'Coaching orientation médecine — Diploma Santé',
  description: 'Planifiez votre coaching orientation médecine avec Diploma Santé.',
}

export default async function BookCoachingOrientationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  // Pré-remplissage (ex. lien de planification d'un formulaire Meta Lead Ads)
  const prefill = extractBookingPrefill(sp)
  await logBookingProbe('/book/coaching-orientation', sp, prefill)
  return (
    <BookingDiploma
      variant="coaching"
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
