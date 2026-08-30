/** Étapes email / SMS par type d’événement (aligné Events Studio). */

import type { EventBrand, EventTypeId } from './config'

export type CommsStep = { id: string; label: string }

export function emailStepsFor(ev: {
  event_type?: string | null
  brand?: string | null
  zoom_join_url?: string | null
}): CommsStep[] {
  const type = (ev.event_type || 'autre') as EventTypeId
  const brand = (ev.brand || 'diploma') as EventBrand
  const isWebinar = type === 'webinaire' || !!ev.zoom_join_url || brand === 'edumove'

  if (brand === 'edumove' && isWebinar) {
    return [
      { id: 'confirmation', label: 'Confirmation' },
      { id: 'j-7', label: 'J-7' },
      { id: 'j-1', label: 'J-1 (veille)' },
      { id: 'j-0-10h', label: 'Jour J 10h' },
      { id: 'j-0-18h25', label: '5 min avant' },
    ]
  }

  if (isWebinar) {
    return [
      { id: 'confirmation', label: 'Confirmation' },
      { id: 'j-3', label: 'J-3' },
      { id: 'j-1', label: 'J-1' },
      { id: 'j-0-matin', label: 'Jour J' },
    ]
  }

  return [
    { id: 'confirmation', label: 'Confirmation' },
    { id: 'j-5', label: 'J-5' },
    { id: 'j-3', label: 'J-3' },
    { id: 'j-2', label: 'J-2' },
    { id: 'j-1', label: 'J-1' },
  ]
}

export function smsStepsFor(ev: {
  event_type?: string | null
  brand?: string | null
  zoom_join_url?: string | null
}): CommsStep[] {
  const type = (ev.event_type || 'autre') as EventTypeId
  const brand = (ev.brand || 'diploma') as EventBrand
  const isWebinar = type === 'webinaire' || !!ev.zoom_join_url || brand === 'edumove'

  if (brand === 'edumove' && isWebinar) {
    return [
      { id: 'confirmation', label: 'Confirmation' },
      { id: 'j-1', label: 'J-1 (veille)' },
      { id: 'j-0-matin', label: 'J-0 matin' },
      { id: 'j-0-11h', label: 'J-0 11h' },
      { id: 'j-0-14h', label: 'J-0 14h' },
      { id: 'j-0-10min', label: '10 min avant' },
      { id: 'j-0-5min', label: '5 min avant' },
    ]
  }

  if (isWebinar) {
    return [
      { id: 'confirmation', label: 'Confirmation' },
      { id: 'j-1', label: 'J-1 (veille)' },
      { id: 'j-0-matin', label: 'J-0 matin' },
      { id: 'j-0-11h', label: 'J-0 11h' },
      { id: 'j-0-14h', label: 'J-0 14h' },
      { id: 'j-0-10min', label: '10 min avant' },
      { id: 'j-0-5min', label: '5 min avant' },
    ]
  }

  return [
    { id: 'confirmation', label: 'Confirmation' },
    { id: 'j-5', label: 'J-5' },
    { id: 'j-3', label: 'J-3' },
    { id: 'j-1', label: 'J-1' },
    { id: 'j-0-matin', label: 'Jour J matin' },
  ]
}
