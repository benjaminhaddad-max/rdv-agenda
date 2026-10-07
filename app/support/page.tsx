import SupportClient from './SupportClient'

export const metadata = { title: 'Support technique' }

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>
}) {
  const { ticket } = await searchParams
  return <SupportClient initialTicketId={ticket ?? null} />
}
