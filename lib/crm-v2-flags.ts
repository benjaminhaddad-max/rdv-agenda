/**
 * Feature flags CRM Design B (Version V2).
 *
 * Règle d’or : Design B = shell / look uniquement.
 * Zéro réécriture de logique métier — on monte les pages classiques dans /admin/crm-v2.
 *
 * Cutover prod = passer CRM_V2_DEFAULT_FOR_ADMIN à true
 * (et brancher une redirection /admin/crm → /admin/crm-v2 dans le layout A).
 * Ne pas activer sans validation métier.
 */
export const CRM_V2_FLAGS = {
  /** URL parallèle active — toujours true tant que V2 existe. */
  PARALLEL_ENABLED: true,
  /** Ne pas rediriger le CRM prod vers V2 (défaut safe). */
  CRM_V2_DEFAULT_FOR_ADMIN: false,
  /** Closer/télépro : Design B uniquement via ?ui=v2 */
  USER_CRM_V2_QUERY: 'ui=v2',
} as const

export function crmV2AdminEntryHref() {
  return '/admin/crm-v2'
}

export function classicCrmHrefFromV2(pathname: string) {
  if (pathname === '/admin/crm-v2') return '/admin/crm'
  return pathname.replace(/^\/admin\/crm-v2/, '/admin/crm')
}
