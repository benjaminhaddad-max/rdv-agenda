import SupportClient from '@/app/support/SupportClient'

export const metadata = { title: 'Service technique' }

export default async function ServiceTechniquePage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>
}) {
  const { ticket } = await searchParams
  return <SupportClient embedded initialTicketId={ticket ?? null} />
}
