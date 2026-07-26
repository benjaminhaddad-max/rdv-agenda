import { Nunito } from 'next/font/google'
import CRMLayoutClientV2 from './CRMLayoutClientV2'

/* Police ronde et lisible — identité Design B */
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--crm-v2-font',
})

export default function CRMV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={nunito.variable} style={{ display: 'contents' }}>
      <CRMLayoutClientV2>{children}</CRMLayoutClientV2>
    </div>
  )
}
