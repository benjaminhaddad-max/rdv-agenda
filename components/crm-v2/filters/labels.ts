/**
 * Libellés neutres : le mot « HubSpot » ne doit jamais apparaître dans l'UI.
 * Les noms techniques des propriétés (hubspot_owner_id…) restent inchangés en
 * base et dans les requêtes : seul le texte affiché passe par ici.
 */

const HUBSPOT_RE = /hub\s*-?\s*spot/i

/** Correspondances connues (clé ou libellé en minuscules → libellé affiché). */
const KNOWN: Record<string, string> = {
  'hubspot owner id': 'ID propriétaire',
  'hubspot_owner_id': 'ID propriétaire',
  'hubspot owner': 'Propriétaire',
  'hubspot owner assigned date': 'Date d’attribution du propriétaire',
  'hubspot_owner_assigneddate': 'Date d’attribution du propriétaire',
  'hubspot team': 'Équipe',
  'hubspot_team_id': 'Équipe',
  'hubspot score': 'Score',
  'hubspotscore': 'Score',
  'hubspot user id': 'ID utilisateur',
  'hubspot_user_id': 'ID utilisateur',
  'hubspot contact id': 'ID contact',
  'hubspot_contact_id': 'ID contact',
  'hubspot deal id': 'ID transaction',
  'hubspot_deal_id': 'ID transaction',
}

/** Vrai si le texte mentionne HubSpot. */
export function mentionsHubspot(text: string | null | undefined): boolean {
  return !!text && HUBSPOT_RE.test(text)
}

/**
 * Libellé affichable d'une propriété : `label` s'il existe, sinon `name`,
 * débarrassé de toute mention de HubSpot.
 */
export function neutralPropLabel(label: string | null | undefined, name?: string | null): string {
  const raw = (label || name || '').trim()
  if (!mentionsHubspot(raw)) return raw
  const known = KNOWN[raw.toLowerCase()]
  if (known) return known
  // Clé technique (snake_case) : on la rend lisible
  const readable = /\s/.test(raw) ? raw : raw.replace(/_/g, ' ')
  const cleaned = readable
    .replace(/hub\s*-?\s*spot/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:·,]+|[\s\-–—:·,]+$/g, '')
    .trim()
  if (!cleaned) return 'Propriété'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}
