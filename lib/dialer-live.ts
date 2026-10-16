'use client'

/**
 * État en direct du power dialer, partagé avec la liste « Mes contacts » :
 * la ligne du lead en cours s'allume (ça sonne, en ligne, messagerie…), les
 * leads déjà appelés montrent leur résultat, les suivants leur rang.
 * Publié par DialerSession, lu par CRMContactsTable (vide hors session).
 */

import { useSyncExternalStore } from 'react'

export type DialerLiveState = 'dialing' | 'ringing' | 'live' | 'voicemail' | 'ended' | 'error'

export type DialerLive = {
  current: { id: string; state: DialerLiveState; label: string } | null
  /** Résultat noté pendant la session, par contact (reached : vraie conversation) */
  results: Record<string, { label: string; color: string; reached: boolean }>
  /** Statut du lead posé par le dialer : la liste l'affiche sans attendre de se recharger */
  statuses: Record<string, string>
  /** Prochains contacts, dans l'ordre */
  upcoming: string[]
}

const EMPTY: DialerLive = { current: null, results: {}, statuses: {}, upcoming: [] }
let state: DialerLive = EMPTY
const listeners = new Set<() => void>()

function set(next: DialerLive) {
  state = next
  listeners.forEach(l => l())
}

export function useDialerLive(): DialerLive {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l) } },
    () => state,
    () => EMPTY,
  )
}

export function publishDialerLive(current: DialerLive['current'], upcoming: string[]) {
  const same = state.current?.id === current?.id && state.current?.state === current?.state && state.current?.label === current?.label
    && state.upcoming.length === upcoming.length && state.upcoming.every((id, i) => id === upcoming[i])
  if (!same) set({ ...state, current, upcoming })
}

export function recordDialerResult(id: string, r: { label: string; color: string; reached: boolean; status: string | null }) {
  set({
    ...state,
    results: { ...state.results, [id]: { label: r.label, color: r.color, reached: r.reached } },
    statuses: r.status ? { ...state.statuses, [id]: r.status } : state.statuses,
  })
}

/** Nouvelle session : on repart de zéro (les statuts posés restent vrais, on les garde) */
export function resetDialerLive() {
  set({ ...EMPTY, statuses: state.statuses })
}
