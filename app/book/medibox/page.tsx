import type { Metadata } from 'next'
import BookingMedibox from '@/components/BookingMedibox'

// Page publique de prise de RDV Medibox (charte medibox.fr, RDV en visio uniquement).
// Route statique : prioritaire sur /book/[slug] dans le routeur Next.

export const metadata: Metadata = {
  title: "Rendez-vous d'entretien — Medibox",
  description: 'Réservez votre entretien individuel en visioconférence avec un conseiller Medibox.',
  icons: { icon: '/icon-medibox.png' },
}

export default async function BookMediboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const sp = await searchParams
  return (
    <BookingMedibox
      utm={{
        utm_source: sp.utm_source ?? null,
        utm_medium: sp.utm_medium ?? null,
        utm_campaign: sp.utm_campaign ?? null,
        utm_content: sp.utm_content ?? null,
        ref: sp.ref ?? null,
      }}
    />
  )
}
