import { Quicksand } from 'next/font/google'
import CRMLayoutClientV2 from './CRMLayoutClientV2'

/* Police très ronde et géométrique — identité Design B */
const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--crm-v2-font',
})

export default function CRMV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={quicksand.variable} style={{ display: 'contents' }}>
      <CRMLayoutClientV2>{children}</CRMLayoutClientV2>
    </div>
  )
}
