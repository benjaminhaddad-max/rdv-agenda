import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agenda RDV — Diploma Santé',
  description: 'Gestion des rendez-vous commerciaux',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/logo-diploma-mark.png', type: 'image/png', sizes: '1024x1024' },
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
