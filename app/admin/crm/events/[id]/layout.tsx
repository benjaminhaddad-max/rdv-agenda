import type { Metadata } from 'next'
import { eventPageMetadata } from '@/lib/page-metadata'

type Props = { params: Promise<{ id: string }>; children: React.ReactNode }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return eventPageMetadata(id)
}

export default function EventLayout({ children }: Props) {
  return children
}
