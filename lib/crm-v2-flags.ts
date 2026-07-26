/**
 * Feature flags CRM Design B (Version V2).
 *
 * Design B = shell / look uniquement. Zéro réécriture de logique métier.
 * Cutover admin : redirection middleware /admin/crm → /admin/crm-v2.
 * Télépro / closer : skin Design B appliquée par défaut sur leurs shells.
 */
export const CRM_V2_FLAGS = {
  PARALLEL_ENABLED: true,
  /** Cutover admin déjà actif via middleware. */
  CRM_V2_DEFAULT_FOR_ADMIN: true,
  /** Conservé pour compat éventuelle ; la skin est maintenant le défaut. */
  USER_CRM_V2_QUERY: 'ui=v2',
} as const

export function crmV2AdminEntryHref() {
  return '/admin/crm-v2'
}

export function classicCrmHrefFromV2(pathname: string) {
  if (pathname === '/admin/crm-v2') return '/admin/crm'
  return pathname.replace(/^\/admin\/crm-v2/, '/admin/crm')
}
