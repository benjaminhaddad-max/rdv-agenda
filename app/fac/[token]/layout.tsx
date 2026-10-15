import type { Metadata } from 'next'

// Lien fac Edumove : page privée (code secret dans l'URL), jamais indexée.
export const metadata: Metadata = {
  title: 'Edumove · Candidats',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function FacLayout({ children }: { children: React.ReactNode }) {
  return children
}
