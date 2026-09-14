import type { Metadata } from 'next'
import { contactPageMetadata } from '@/lib/page-metadata'

type Props = { params: Promise<{ id: string }>; children: React.ReactNode }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return contactPageMetadata(id)
}

export default function ContactLayout({ children }: Props) {
  return children
}
