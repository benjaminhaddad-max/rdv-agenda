import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { EVENTS_SUPABASE_URL_DEFAULT } from './config'

/** Anon key publique (même que la SPA Events) — fallback si pas de service role. */
const EVENTS_ANON_FALLBACK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3B3cXBiYWl5amZvZ2d2Y2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI2OTEsImV4cCI6MjA4ODYyODY5MX0.rz3TJZryPxEf3P5kQgpzQkwN9aF8_F4eo4F03CEYVPs'

export function getEventsSupabaseUrl(): string {
  return process.env.EVENTS_SUPABASE_URL?.trim() || EVENTS_SUPABASE_URL_DEFAULT
}

export function getEventsSupabaseKey(): string {
  return (
    process.env.EVENTS_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.EVENTS_SUPABASE_ANON_KEY?.trim() ||
    EVENTS_ANON_FALLBACK
  )
}

export function createEventsClient(): SupabaseClient {
  const key = getEventsSupabaseKey()
  const usingServiceRole = !!process.env.EVENTS_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!usingServiceRole && process.env.NODE_ENV !== 'test') {
    // Writes require service role (Events RLS). Reads work with anon.
    console.warn(
      '[events-studio] EVENTS_SUPABASE_SERVICE_ROLE_KEY manquant — les écritures events échoueront (RLS).',
    )
  }
  return createClient(getEventsSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function eventsEdgeUrl(fn: string): string {
  return `${getEventsSupabaseUrl()}/functions/v1/${fn}`
}
