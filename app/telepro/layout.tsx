import { Quicksand } from 'next/font/google'

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--crm-v2-font',
})

export default function TeleproLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={quicksand.variable} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
