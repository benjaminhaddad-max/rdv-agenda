/**
 * Logger natif Diploma. Écrit dans la table Supabase crm_error_logs.
 * Zéro dépendance externe — si Sentry/Datadog/etc tombent, on s'en fout.
 *
 * Visualisable dans /admin/errors.
 *
 * Usage :
 *   import { logger } from '@/lib/logger'
 *
 *   try { ... } catch (err) {
 *     logger.error('crm-sync', err, { contactId, formId })
 *     throw err
 *   }
 *
 *   logger.warn('quota-near-limit', 'HubSpot daily quota at 90%', { remaining: 100 })
 *   logger.info('webhook-received', 'meta lead reçu', { source: 'meta', count: 3 })
 *
 * Le logger est best-effort : si Supabase est down, on log juste en console
 * et on ne bloque jamais l'appelant.
 */

import { createServiceClient } from './supabase'

type LogLevel = 'error' | 'warn' | 'info'

interface LogPayload {
  level: LogLevel
  label: string
  message: string
  stack?: string | null
  context?: Record<string, unknown> | null
  request_path?: string | null
  request_method?: string | null
}

// Buffer pour éviter de spammer Supabase si beaucoup d'erreurs en même temps.
// Flush toutes les 2 sec ou quand >20 entrées.
const buffer: LogPayload[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  flushTimer = null
  if (buffer.length === 0) return
  const batch = buffer.splice(0, buffer.length)
  try {
    const db = createServiceClient()
    await db.from('crm_error_logs').insert(batch)
  } catch (e) {
    console.error('[logger] flush failed:', e instanceof Error ? e.message : e)
  }
}

function scheduleFlush() {
  if (flushTimer) return
  const delay = buffer.length >= 20 ? 0 : 2000
  flushTimer = setTimeout(flush, delay)
}

function record(payload: LogPayload) {
  if (process.env.NODE_ENV !== 'production') {
    const prefix = `[${payload.level}][${payload.label}]`
    if (payload.level === 'error') console.error(prefix, payload.message, payload.context || '')
    else if (payload.level === 'warn') console.warn(prefix, payload.message, payload.context || '')
    else console.log(prefix, payload.message, payload.context || '')
  }
  buffer.push(payload)
  scheduleFlush()
}

export const logger = {
  /** Erreur runtime. */
  error(label: string, err: unknown, context?: Record<string, unknown>) {
    const errorObj = err instanceof Error ? err : new Error(String(err))
    record({
      level: 'error',
      label,
      message: errorObj.message,
      stack: errorObj.stack || null,
      context: context || null,
    })
  },

  /** Warning : situation anormale mais récupérable. */
  warn(label: string, message: string, context?: Record<string, unknown>) {
    record({
      level: 'warn',
      label,
      message,
      context: context || null,
    })
  },

  /** Info : traçabilité (à utiliser avec parcimonie sinon ça inonde la table). */
  info(label: string, message: string, context?: Record<string, unknown>) {
    record({
      level: 'info',
      label,
      message,
      context: context || null,
    })
  },

  /** Force le flush immédiat (utile en fin de cron / serverless). */
  async flush() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    await flush()
  },
}
