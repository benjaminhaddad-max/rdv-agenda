import type { Metadata } from 'next'
import BookingDiploma from '@/components/BookingDiploma'

// Page publique autonome — lien individuel envoyé par les télépros.
// Route statique : prioritaire sur /book/[slug] dans le routeur Next.

export const metadata: Metadata = {
  title: "Rendez-vous d'information — Diploma Santé",
  description: 'Planifiez votre rendez-vous d\u2019information avec Diploma Santé.',
}

export default async function BookDiplomaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const sp = await searchParams
  return (
    <BookingDiploma
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
