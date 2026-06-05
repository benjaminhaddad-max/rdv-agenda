import type { SupabaseClient } from '@supabase/supabase-js'

export type IdentityPatch = {
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  departement?: string
  classe_actuelle?: string
}

function hasVal(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== ''
}

function titleCaseWord(s: string): string {
  const t = s.trim().toLowerCase()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function titleCaseName(s: string): string {
  return s.split(/(\s+|-)/).map(p => /(\s+|-)/.test(p) ? p : titleCaseWord(p)).join('')
}

/** Fiche sans aucune colonne d'identité remplie. */
export function isIdentityGhost(contact: {
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
}): boolean {
  return !hasVal(contact.firstname) && !hasVal(contact.lastname) && !hasVal(contact.email) && !hasVal(contact.phone)
}

/** Extrait nom/email/tél depuis le tsvector Postgres (search_vector). */
export function parseSearchVectorIdentity(searchVector: string | null | undefined): IdentityPatch {
  if (!searchVector) return {}
  const tokens: Array<{ text: string; weight: string }> = []
  const re = /'([^']+)':\d+([ABC])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(searchVector)) !== null) {
    tokens.push({ text: m[1].replace(/\\'/g, "'"), weight: m[2] })
  }
  const a = tokens.filter(t => t.weight === 'A').map(t => t.text)
  const email = tokens.find(t => t.weight === 'B')?.text
  const phone = tokens.find(t => t.weight === 'C')?.text
  const patch: IdentityPatch = {}
  if (a.length > 0) {
    patch.firstname = titleCaseWord(a[0])
    if (a.length > 1) patch.lastname = a.slice(1).map(titleCaseWord).join(' ')
  }
  if (email && email.includes('@')) patch.email = email.toLowerCase()
  if (phone) patch.phone = phone
  return patch
}

/** Extrait identité depuis hubspot_raw.properties (coquilles HubSpot). */
export function parseHubspotRawIdentity(raw: unknown): IdentityPatch {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const props = (r.properties && typeof r.properties === 'object')
    ? (r.properties as Record<string, unknown>)
    : r
  const patch: IdentityPatch = {}
  if (hasVal(props.firstname)) patch.firstname = String(props.firstname).trim()
  if (hasVal(props.lastname)) patch.lastname = String(props.lastname).trim()
  if (hasVal(props.email)) patch.email = String(props.email).trim().toLowerCase()
  if (hasVal(props.phone)) patch.phone = String(props.phone).trim()
  if (hasVal(props.departement)) patch.departement = String(props.departement).trim()
  if (hasVal(props.classe_actuelle)) patch.classe_actuelle = String(props.classe_actuelle).trim()
  return patch
}

/** Extrait identité depuis meta_lead_events.field_data. */
export function parseMetaFieldDataIdentity(
  fieldData: Array<{ name?: string; values?: string[] }> | null | undefined,
): IdentityPatch {
  if (!fieldData?.length) return {}
  const map: Record<string, string> = {}
  for (const f of fieldData) {
    const v = f.values?.[0]
    if (!f.name || !hasVal(v)) continue
    map[f.name.toLowerCase()] = String(v).trim()
  }
  const patch: IdentityPatch = {}
  const fn = map.first_name || map.firstname || map.prenom
  const ln = map.last_name || map.lastname || map.nom
  const em = map.email
  const ph = map.phone_number || map.phone || map.mobilephone
  if (fn) patch.firstname = fn
  if (ln) patch.lastname = ln
  if (em) patch.email = em.toLowerCase()
  if (ph) patch.phone = ph
  const dept = map['département_(ex_:_75)'] || map.departement || map.département
  if (dept) patch.departement = dept
  const classe = map.niveau_d_études || map.niveau_d_etudes || map.classe_actuelle
  if (classe) patch.classe_actuelle = classe
  return patch
}

function mergePatches(...patches: IdentityPatch[]): IdentityPatch {
  const out: IdentityPatch = {}
  for (const p of patches) {
    for (const [k, v] of Object.entries(p)) {
      if (hasVal(v) && !hasVal(out[k as keyof IdentityPatch])) {
        (out as Record<string, string>)[k] = String(v).trim()
      }
    }
  }
  return out
}

/**
 * Tente de restaurer les colonnes d'identité d'une fiche fantôme depuis
 * search_vector, hubspot_raw.properties ou meta_lead_events.
 */
export async function repairContactIdentity(
  db: SupabaseClient,
  contactId: string,
  contact?: Record<string, unknown> | null,
): Promise<{ repaired: boolean; patch: IdentityPatch; source: string }> {
  let row = contact
  if (!row) {
    const { data } = await db.from('crm_contacts').select('*').eq('hubspot_contact_id', contactId).maybeSingle()
    row = data
  }
  if (!row || !isIdentityGhost(row as { firstname?: string | null; lastname?: string | null; email?: string | null; phone?: string | null })) {
    return { repaired: false, patch: {}, source: 'not_ghost' }
  }

  const fromVector = parseSearchVectorIdentity(row.search_vector as string | null)
  const fromRaw = parseHubspotRawIdentity(row.hubspot_raw)
  let fromMeta: IdentityPatch = {}
  const { data: metaEv } = await db.from('meta_lead_events')
    .select('field_data')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (metaEv?.field_data) {
    fromMeta = parseMetaFieldDataIdentity(metaEv.field_data as Array<{ name?: string; values?: string[] }>)
  }

  const patch = mergePatches(fromMeta, fromRaw, fromVector)
  if (!hasVal(patch.firstname) && !hasVal(patch.email) && !hasVal(patch.phone)) {
    return { repaired: false, patch: {}, source: 'no_source' }
  }

  const source = hasVal(fromMeta.firstname) || hasVal(fromMeta.email) ? 'meta_lead_events'
    : hasVal(fromRaw.firstname) || hasVal(fromRaw.email) ? 'hubspot_raw'
    : 'search_vector'

  const { error } = await db.from('crm_contacts')
    .update({ ...patch, synced_at: new Date().toISOString() })
    .eq('hubspot_contact_id', contactId)

  if (error) return { repaired: false, patch: {}, source: `error:${error.message}` }
  return { repaired: true, patch, source }
}
