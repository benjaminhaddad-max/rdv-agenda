import type { Metadata } from 'next'
import ScanClient from './ScanClient'

export const metadata: Metadata = {
  title: 'Scanner QR — Diploma Santé',
  description: 'Scanner les QR codes d’entrée, sans connexion.',
  robots: { index: false, follow: false },
}

export default async function PublicScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ScanClient eventId={eventId} />
}
