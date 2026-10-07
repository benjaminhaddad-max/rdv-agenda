import ServiceTechniqueV2 from '@/components/crm-v2/admin/ServiceTechniqueV2'

export const metadata = { title: 'Service technique' }

export default async function ServiceTechniquePage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>
}) {
  const { ticket } = await searchParams
  // Vue admin V2 (onglets + tableau + tiroir). La page /support garde SupportClient.
  return <ServiceTechniqueV2 initialTicketId={ticket ?? null} />
}
