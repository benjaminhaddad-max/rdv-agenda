// Config Sentry pour le navigateur. Activé seulement si SENTRY_DSN est défini.
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    // Performance monitoring : 10% des requêtes en prod, 100% en dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Replay : 0% par défaut (coûteux), 100% sur les erreurs
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Skip noisy errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Network request failed',
      'NetworkError',
      'Load failed',
    ],
  })
}
