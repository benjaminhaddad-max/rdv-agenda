'use client'

/**
 * Route courte de confirmation de présence : /c/[token]
 *
 * Alias court (et brandé via NEXT_PUBLIC_CONFIRM_URL) de /confirm/[token].
 * Réutilise la même page : à l'ouverture, la présence est confirmée
 * automatiquement (un seul clic depuis le SMS/email, aucune action requise).
 */

import ConfirmPage from '@/app/confirm/[token]/page'

export default function ShortConfirmPage() {
  return <ConfirmPage />
}
