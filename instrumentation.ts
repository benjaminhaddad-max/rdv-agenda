/**
 * Hook officiel Next.js pour capturer les erreurs runtime côté serveur.
 * Cf. https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Toute erreur non catchée dans une route API ou un Server Component finit ici,
 * et on l'envoie au logger natif (table crm_error_logs).
 */

export async function register() {
  // Rien à faire au boot — le logger se connecte à Supabase à la demande.
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  errorContext: { routerKind: string; routePath?: string; routeType?: string },
) {
  try {
    const { logger } = await import('./lib/logger')
    logger.error('next-runtime', err, {
      path: request.path,
      method: request.method,
      routerKind: errorContext.routerKind,
      routeType: errorContext.routeType,
    })
    // Force flush avant que la fonction serverless meurt
    await logger.flush()
  } catch {
    // Si même le logger plante, console et on lâche
    console.error('[onRequestError] failed:', err)
  }
}
