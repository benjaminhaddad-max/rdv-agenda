/**
 * HubSpot enregistre souvent `Page: Formulaire "Candidater Header" - Diploma Santé`
 * alors que le filtre CRM stocke le nom interne `NS - Candidater Header`.
 * Ces helpers relient les deux.
 */

export function formEventDisplayNeedle(name: string): string {
  let rest = String(name || '').trim().replace(/^facebook lead ads:\s*/i, '').trim()
  rest = rest.replace(/^NS\s*-\s*/i, '').trim()
  rest = rest.replace(/^Formulaire\s+/i, '').trim()
  rest = rest.replace(/\s*-\s*Diploma Santé\s*$/i, '').trim()
  rest = rest.replace(/^["«]\s*/, '').replace(/\s*["»]$/, '').trim()
  return rest
}

export function formEventIlikePatterns(name: string): string[] {
  const n = String(name || '').trim()
  if (!n) return []
  const needle = formEventDisplayNeedle(n)
  const escapeIlike = (v: string) => v.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const patterns = new Set<string>()
  if (needle.length >= 4) {
    const e = escapeIlike(needle)
    patterns.add(`%Formulaire "${e}"%`)
    patterns.add(`%Formulaire « ${e} »%`)
    // Unquoted only for multi-word needles ("Financement" seul est trop large).
    if (/\s/.test(needle)) patterns.add(`%Formulaire ${e}%`)
  }
  return [...patterns]
}

export function conversionEventMatchesFormNames(
  eventName: string | null | undefined,
  formNames: readonly string[],
): boolean {
  const raw = String(eventName || '').trim()
  if (!raw || formNames.length === 0) return false
  const rawLc = raw.toLowerCase()
  const strippedLc = rawLc.replace(/^facebook lead ads:\s*/i, '').trim()
  for (const formName of formNames) {
    const form = String(formName || '').trim()
    if (!form) continue
    const formLc = form.toLowerCase()
    if (rawLc === formLc || strippedLc === formLc) return true
    const needle = formEventDisplayNeedle(form).toLowerCase()
    if (needle.length < 4) continue
    if (rawLc.includes(`formulaire "${needle}"`) || rawLc.includes(`formulaire « ${needle} »`)) return true
    if (/\s/.test(needle) && rawLc.includes(`formulaire ${needle}`)) return true
    if (strippedLc === needle) return true
  }
  return false
}
