/**
 * Casquettes d'équipe (page Équipe) : rdv_users.role est le rôle principal
 * (accès) ; rdv_users.extra_roles (migration v56) ajoute des casquettes —
 * un admin qui close (Pascal), un télépro qui close aussi, un closer qui
 * place aussi des RDV. Fichier sans dépendance serveur (client + API).
 */

export const PASCAL_OWNER_ID = '76299546'

export type TeamRole = 'telepro' | 'closer'
export const TEAM_ROLES: TeamRole[] = ['telepro', 'closer']

export const TEAM_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  closer: 'Closer',
  telepro: 'Télépro',
}

export function normalizeExtraRoles(value: unknown): TeamRole[] {
  if (!Array.isArray(value)) return []
  return TEAM_ROLES.filter(r => value.includes(r))
}

/**
 * Le compte a-t-il cette casquette (rôle principal ou rôle en plus) ?
 * Pascal est toujours closer (filet de sécurité avant la migration v56).
 */
export function hasTeamRole(
  u: { role?: unknown; extra_roles?: unknown; hubspot_owner_id?: unknown },
  role: TeamRole,
): boolean {
  if (u.role === role) return true
  if (normalizeExtraRoles(u.extra_roles).includes(role)) return true
  return role === 'closer' && String(u.hubspot_owner_id ?? '') === PASCAL_OWNER_ID
}

/** Toutes les casquettes du compte, rôle principal en premier. */
export function teamRolesOf(u: { role?: unknown; extra_roles?: unknown; hubspot_owner_id?: unknown }): string[] {
  const main = String(u.role ?? '')
  const out = main ? [main] : []
  for (const r of TEAM_ROLES) if (r !== main && hasTeamRole(u, r)) out.push(r)
  return out
}
