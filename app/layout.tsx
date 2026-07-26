import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hub Diploma',
  description: 'CRM et gestion des rendez-vous — Hub Diploma',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/logo-hub-diploma-mark.png', type: 'image/png', sizes: '362x362' },
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
