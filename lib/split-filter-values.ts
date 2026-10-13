/**
 * Découpe une valeur de filtre multi-valeurs (« a,b,c ») en conservant les
 * virgules internes aux libellés : les valeurs sont jointes par « , » sans
 * espace, alors qu'un nom de formulaire comme
 * « Santé, social, paramédical et sport — 10/10/2026 » contient « , » suivi
 * d'un espace. On ne coupe donc que sur les virgules non suivies d'un blanc.
 */
export function splitFilterValues(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/,(?!\s)/).map(s => s.trim()).filter(Boolean)
}
