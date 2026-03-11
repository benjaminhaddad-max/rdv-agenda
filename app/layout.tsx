import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agenda RDV — Diploma Santé',
  description: 'Gestion des rendez-vous commerciaux',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
