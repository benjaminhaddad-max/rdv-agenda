/**
 * Comptes « accès restreint » (migration v78) : rdv_users.role = 'restreint'
 * + rdv_users.allowed_pages = liste des pages du CRM autorisées.
 * Le middleware limite la navigation à ces pages, la sidebar n'affiche
 * qu'elles, et seules les API de ces pages acceptent le compte
 * (requireApiRoleOrPage / requireCrmUserId) — getApiUserContext() le refuse.
 * Fichier sans dépendance serveur (middleware + client + API).
 */

export const RESTRICTED_ROLE = 'restreint'

/** Clé de page (= clé de la sidebar V2) → URL de la page. */
export const RESTRICTED_PAGES = {
  'ads-dashboard': '/admin/crm-v2/ads-dashboard',
  'creas-ads': '/admin/crm-v2/creas-ads',
  'events': '/admin/crm-v2/events',
  'forms': '/admin/crm-v2/forms',
  'meta-ads': '/admin/crm-v2/meta-ads',
  // Demandes soumises à l'approbation d'Aaron (support_tickets.approval_status, v84)
  'service-technique': '/admin/crm-v2/service-technique',
} as const

export type RestrictedPage = keyof typeof RESTRICTED_PAGES

export function normalizeAllowedPages(value: unknown): RestrictedPage[] {
  if (!Array.isArray(value)) return []
  return (Object.keys(RESTRICTED_PAGES) as RestrictedPage[]).filter(p => value.includes(p))
}

/** Page d'accueil d'un compte restreint (première page autorisée). */
export function restrictedHome(pages: unknown): string | null {
  const first = normalizeAllowedPages(pages)[0]
  return first ? RESTRICTED_PAGES[first] : null
}

/** La page (et ses sous-pages) est-elle autorisée pour ce compte ? */
export function isRestrictedPathAllowed(pathname: string, pages: unknown): boolean {
  return normalizeAllowedPages(pages).some(p => {
    const href = RESTRICTED_PAGES[p]
    return pathname === href || pathname.startsWith(href + '/')
  })
}
