/**
 * Logger central. Wrappe Sentry quand SENTRY_DSN est défini, sinon
 * console.* en local. Permet de remplacer les console.error éparpillés
 * (45+ occurrences dans le codebase) par un canal centralisé.
 *
 * Usage :
 *   import { logger } from '@/lib/logger'
 *
 *   try { ... } catch (err) {
 *     logger.error('crm-sync', err, { contactId, formId })
 *     throw err  // ou return Response error
 *   }
 *
 *   logger.info('webhook-received', { source: 'meta', count: 3 })
 *   logger.warn('quota-near-limit', { remaining: 100 })
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sentry = any
let sentry: Sentry | null = null

// Lazy import pour ne pas charger Sentry si DSN absent (dev local)
async function getSentry(): Promise<Sentry | null> {
  if (sentry !== null) return sentry
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) {
    sentry = false
    return null
  }
  try {
    sentry = await import('@sentry/nextjs')
    return sentry
  } catch {
    sentry = false
    return null
  }
}

export const logger = {
  /** Erreur : envoyée à Sentry + console.error en local. */
  error(label: string, err: unknown, context?: Record<string, unknown>) {
    const errorObj = err instanceof Error ? err : new Error(String(err))
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[${label}]`, errorObj.message, context || '')
    }
    getSentry().then(s => {
      if (s?.captureException) {
        s.captureException(errorObj, {
          tags: { label },
          extra: context,
        })
      }
    })
  },

  /** Warning : Sentry breadcrumb + console.warn en local. */
  warn(label: string, message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[${label}]`, message, context || '')
    }
    getSentry().then(s => {
      if (s?.addBreadcrumb) {
        s.addBreadcrumb({ category: label, message, level: 'warning', data: context })
      }
    })
  },

  /** Info : breadcrumb only (utile pour le contexte autour d'une erreur). */
  info(label: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${label}]`, context || '')
    }
    getSentry().then(s => {
      if (s?.addBreadcrumb) {
        s.addBreadcrumb({ category: label, level: 'info', data: context })
      }
    })
  },
}
