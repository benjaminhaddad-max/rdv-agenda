import CRMLayoutClient from './CRMLayoutClient'

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return <CRMLayoutClient>{children}</CRMLayoutClient>
}
