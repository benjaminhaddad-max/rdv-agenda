'use client'

/**
 * Téléphone Aircall intégré au CRM (SDK Aircall Everywhere) : Aircall Workspace
 * tourne dans une iframe de la page télépro. Le télépro raccroche avec le bouton
 * rouge du téléphone, sans changer d'appli (l'API Aircall ne sait pas raccrocher).
 * - Activé par appareil (localStorage), ordinateur uniquement.
 * - Le power dialer lance les appels par l'API Aircall : ils sonnent dans ce
 *   téléphone (le SDK ne sait que pré-remplir un numéro, pas appeler).
 * État partagé entre le téléphone (AircallPhone) et le dialer (DialerSession).
 */

import { useSyncExternalStore } from 'react'
import type AircallWorkspace from 'aircall-everywhere'

export type AircallEmbedState = {
  /** Téléphone intégré activé sur cet appareil */
  enabled: boolean
  /** Workspace chargé et connecté */
  loggedIn: boolean
  /** Un appel est ouvert dans le téléphone (sortant ou entrant) */
  inCall: boolean
  /** Panneau déplié (iframe visible) */
  expanded: boolean
}

const ENABLED_KEY = 'aircall_embed_enabled'
const SERVER_STATE: AircallEmbedState = { enabled: false, loggedIn: false, inCall: false, expanded: true }

function readEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1' } catch { return false }
}

let state: AircallEmbedState = typeof window === 'undefined' ? SERVER_STATE : { ...SERVER_STATE, enabled: readEnabled() }
const listeners = new Set<() => void>()

function set(patch: Partial<AircallEmbedState>) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

export function aircallEmbedState(): AircallEmbedState {
  return state
}

export function useAircallEmbed(): AircallEmbedState {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l) } },
    () => state,
    () => SERVER_STATE,
  )
}

export function setAircallEmbedEnabled(v: boolean) {
  try { localStorage.setItem(ENABLED_KEY, v ? '1' : '0') } catch { /* stockage indisponible */ }
  set({ enabled: v, expanded: true })
}

export function setAircallEmbedExpanded(v: boolean) {
  set({ expanded: v })
}

/** Branche le Workspace chargé dans la page (une seule instance) */
export function attachAircallWorkspace(ws: AircallWorkspace | null) {
  if (!ws) { set({ loggedIn: false, inCall: false }); return }
  // Appel qui démarre : le téléphone se déplie pour que le bouton raccrocher soit visible
  ws.on('outgoing_call', () => set({ inCall: true, expanded: true }))
  ws.on('incoming_call', () => set({ inCall: true, expanded: true }))
  ws.on('call_end_ringtone', d => { if (d.answer_status !== 'answered') set({ inCall: false }) })
  ws.on('call_ended', () => { set({ inCall: false }); endedListeners.forEach(l => l()) })
}

export function setAircallLoggedIn(v: boolean) {
  set(v ? { loggedIn: true } : { loggedIn: false, inCall: false })
}

/** Aircall Workspace ne fonctionne que dans Google Chrome (Safari bloque sa connexion dans le CRM) */
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|edg|fxios|android/i.test(navigator.userAgent)
}

type Listener = () => void
const endedListeners = new Set<Listener>()

/** Raccroché dans le téléphone intégré : le dialer relit l'appel tout de suite (sans attendre son tour de suivi) */
export function onAircallCallEnded(cb: Listener): () => void {
  endedListeners.add(cb)
  return () => { endedListeners.delete(cb) }
}
