// Hook officiel Next.js pour charger Sentry sur le bon runtime.
// Cf. https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Capture les erreurs uncaught côté serveur
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
) {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureException(err, {
    tags: { route: request.path, method: request.method },
  })
}
