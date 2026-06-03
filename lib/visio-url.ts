/**
 * lib/visio-url.ts
 *
 * Personnalise un lien de visio interne (/visio/rdv-xxx) en y ajoutant le
 * paramètre ?name= pour pré-remplir automatiquement le prénom sur l'écran
 * de pré-jointure.
 *
 * - N'agit que sur NOS liens internes (contenant "/visio/").
 * - Laisse les liens Google Meet (ou autres) intacts : Meet ignore ?name=.
 */
export function personalizeVisioUrl(
  link: string | null | undefined,
  name: string | null | undefined,
): string {
  const url = (link || '').trim()
  const cleanName = (name || '').trim()
  if (!url || !cleanName) return url
  // Uniquement nos salles internes ; on ne touche pas aux liens externes (Meet, etc.)
  if (!/\/visio\//i.test(url)) return url
  try {
    const u = new URL(url)
    u.searchParams.set('name', cleanName)
    return u.toString()
  } catch {
    // Lien relatif ou non parsable → fallback manuel
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}name=${encodeURIComponent(cleanName)}`
  }
}

/** Renvoie le prénom (premier mot) à partir d'un nom complet. */
export function firstNameOf(fullName: string | null | undefined): string {
  return String(fullName || '').trim().split(/\s+/)[0] || ''
}
