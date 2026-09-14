import type { Metadata } from 'next'
import { dealPageMetadata } from '@/lib/page-metadata'

type Props = { params: Promise<{ id: string }>; children: React.ReactNode }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return dealPageMetadata(id)
}

export default function DealLayout({ children }: Props) {
  return children
}
