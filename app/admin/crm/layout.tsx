import type { Metadata } from 'next'
import CRMLayoutClient from './CRMLayoutClient'

export const metadata: Metadata = {
  title: 'CRM · Hub Diploma',
}

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return <CRMLayoutClient>{children}</CRMLayoutClient>
}
