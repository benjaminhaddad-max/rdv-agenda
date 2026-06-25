'use client'

import { useEffect, useState } from 'react'

/**
 * Renvoie `true` quand la largeur de l'écran est inférieure ou égale au
 * breakpoint (768px par défaut). Sert à adapter les layouts à inline-styles
 * (qui ne peuvent pas être ciblés par des media queries CSS) pour le mobile.
 *
 * SSR-safe : retourne `false` au premier rendu serveur, puis se met à jour
 * côté client après le montage.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}
