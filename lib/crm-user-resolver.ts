/**
 * Resolver pour les propriétés HubSpot de type "User" ou "Owner".
 *
 * Dans HubSpot, certaines propriétés stockent l'ID numérique d'un utilisateur
 * (ex: `teleprospecteur`, `closer_hs_id`, `hubspot_owner_id`) plutôt qu'un
 * label lisible. En base on a `crm_owners` qui mappe ces IDs vers les noms.
 *
 * Ce helper :
 *   - dit si une propriété est de type User/Owner
 *   - convertit un ID en "Prénom Nom"
 */

export type Owner = {
  hubspot_owner_id: string
  user_id?: string | null
  firstname?: string | null
  lastname?: string | null
  email?: string | null
}

/**
 * Liste connue des propriétés HubSpot qui stockent un ID utilisateur/owner.
 * À étendre quand on en croise de nouvelles.
 */
export const USER_TYPE_PROPS = new Set<string>([
  'teleprospecteur',
  'hubspot_owner_id',
  'closer_hs_id',
  'contact_owner_hs_id',
  'last_engagement_owner',
  'hs_created_by_user_id',
  'hs_updated_by_user_id',
])

/** Détermine si une prop stocke un ID utilisateur/owner (heuristique). */
export function isUserTypeProperty(name: string): boolean {
  if (USER_TYPE_PROPS.has(name)) return true
  const n = name.toLowerCase()
  return n.endsWith('_owner_id')
      || n.endsWith('_user_id')
      || n.endsWith('_owner')
      || n === 'teleprospecteur'
}

/**
 * Construit un index { id → "Firstname Lastname" } à partir d'une liste d'owners.
 * Indexe sur hubspot_owner_id ET user_id pour gérer les 2 types de props.
 */
export function buildUserNameIndex(owners: Owner[]): Map<string, string> {
  const idx = new Map<string, string>()
  for (const o of owners) {
    const name = [o.firstname, o.lastname].filter(Boolean).join(' ').trim()
      || o.email
      || o.hubspot_owner_id
    if (o.hubspot_owner_id) idx.set(String(o.hubspot_owner_id), name)
    if (o.user_id)         idx.set(String(o.user_id), name)
  }
  return idx
}

/** Résout un ID en nom (ou retourne l'ID brut si pas trouvé). */
export function resolveUserName(id: string | null | undefined, index: Map<string, string>): string {
  if (!id) return ''
  return index.get(String(id)) || String(id)
}
