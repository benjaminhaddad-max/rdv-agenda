import type { Metadata } from 'next'
import BookingDiploma from '@/components/BookingDiploma'
import { extractBookingPrefill, logBookingProbe } from '@/lib/booking-prefill'

// Page publique autonome — lien individuel envoyé par les télépros.
// Route statique : prioritaire sur /book/[slug] dans le routeur Next.

export const metadata: Metadata = {
  title: "Rendez-vous d'information — Diploma Santé",
  description: 'Planifiez votre rendez-vous d\u2019information avec Diploma Santé.',
}

export default async function BookDiplomaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  // Pré-remplissage (ex. lien de planification d'un formulaire Meta Lead Ads)
  const prefill = extractBookingPrefill(sp)
  await logBookingProbe('/book/diploma', sp, prefill)
  return (
    <BookingDiploma
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
