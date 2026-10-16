'use client'

/**
 * Téléphone Aircall intégré au CRM (SDK Aircall Everywhere) : Aircall Workspace
 * tourne dans une iframe de la page télépro. Le télépro raccroche avec le bouton
 * rouge du téléphone, sans changer d'appli (l'API Aircall ne sait pas raccrocher).
 * - Activé par appareil (localStorage), ordinateur uniquement.
 * - Le power dialer appelle via `dialNumber` au lieu de l'API Aircall.
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
let workspace: AircallWorkspace | null = null

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
  workspace = ws
  if (!ws) { set({ loggedIn: false, inCall: false }); return }
  // Appel qui démarre : le téléphone se déplie pour que le bouton raccrocher soit visible
  ws.on('outgoing_call', () => set({ inCall: true, expanded: true }))
  ws.on('incoming_call', () => set({ inCall: true, expanded: true }))
  ws.on('call_end_ringtone', d => { if (d.answer_status !== 'answered') set({ inCall: false }) })
  ws.on('call_ended', () => set({ inCall: false }))
}

export function setAircallLoggedIn(v: boolean) {
  set(v ? { loggedIn: true } : { loggedIn: false, inCall: false })
}

/** Aircall Workspace ne fonctionne que dans Google Chrome (Safari bloque sa connexion dans le CRM) */
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|edg|fxios|android/i.test(navigator.userAgent)
}

export type EmbedDialResult = { ok: true } | { ok: false; code: string; message: string }

const DIAL_ERRORS: Record<string, string> = {
  in_call: 'Le téléphone Aircall est encore en appel : raccroche avec le bouton rouge.',
  not_ready: 'Connecte-toi dans le téléphone Aircall (à gauche), puis relance l\'appel.',
  no_answer: 'Le téléphone Aircall ne répond pas : vérifie que tu es connecté (à gauche), puis relance l\'appel.',
}

/** Compose le numéro dans le téléphone intégré (format E.164) */
export function dialNumber(phoneE164: string): Promise<EmbedDialResult> {
  const ws = workspace
  if (!ws) return Promise.resolve({ ok: false, code: 'not_ready', message: DIAL_ERRORS.not_ready })
  return new Promise(resolve => {
    let done = false
    const finish = (r: EmbedDialResult) => { if (!done) { done = true; resolve(r) } }
    // Le SDK peut ne jamais rappeler si l'iframe est bloquée
    const timer = setTimeout(() => finish({ ok: false, code: 'no_answer', message: DIAL_ERRORS.no_answer }), 10_000)
    ws.send('dial_number', { phone_number: phoneE164 }, (success, data) => {
      clearTimeout(timer)
      if (success) { set({ inCall: true, expanded: true }); finish({ ok: true }); return }
      const code = (data as { code?: string } | null)?.code ?? 'unknown_error'
      finish({ ok: false, code, message: DIAL_ERRORS[code] ?? `Le téléphone Aircall n'a pas lancé l'appel (${code}).` })
    })
  })
}
