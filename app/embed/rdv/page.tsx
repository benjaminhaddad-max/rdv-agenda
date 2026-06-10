import BookingDiploma from '@/components/BookingDiploma'

// Version iframe — ouverte en popup par le script /api/booking/widget.js.
// Hérite du layout /embed (fond transparent, body overflow hidden) :
// le composant gère son propre scroll interne en mode embedded.

export default async function EmbedRdvPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const sp = await searchParams
  return (
    <BookingDiploma
      embedded
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
