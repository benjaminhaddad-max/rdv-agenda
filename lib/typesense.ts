type TypesenseHit<T> = {
  document: T
}

type TypesenseSearchResponse<T> = {
  found: number
  hits?: Array<TypesenseHit<T>>
}

export type TypesenseCrmDoc = {
  hubspot_contact_id: string
}

function getTypesenseEnv() {
  const host = process.env.TYPESENSE_HOST?.trim()
  const apiKey = process.env.TYPESENSE_API_KEY?.trim()
  const collection = process.env.TYPESENSE_COLLECTION_CRM_CONTACTS?.trim() || 'crm_contacts'
  return { host, apiKey, collection }
}

export function isTypesenseEnabled(): boolean {
  const { host, apiKey } = getTypesenseEnv()
  return !!host && !!apiKey
}

export async function searchTypesenseCrmContacts(params: {
  q: string
  queryBy: string
  filterBy?: string
  sortBy?: string
  page: number
  perPage: number
}): Promise<{ ids: string[]; found: number } | null> {
  const { host, apiKey, collection } = getTypesenseEnv()
  if (!host || !apiKey) return null

  const base = host.startsWith('http://') || host.startsWith('https://')
    ? host
    : `https://${host}`
  const url = new URL(`${base.replace(/\/+$/, '')}/collections/${encodeURIComponent(collection)}/documents/search`)
  url.searchParams.set('q', params.q || '*')
  url.searchParams.set('query_by', params.queryBy)
  url.searchParams.set('page', String(Math.max(1, params.page)))
  url.searchParams.set('per_page', String(Math.max(1, Math.min(params.perPage, 250))))
  url.searchParams.set('include_fields', 'hubspot_contact_id')
  if (params.filterBy) url.searchParams.set('filter_by', params.filterBy)
  if (params.sortBy) url.searchParams.set('sort_by', params.sortBy)

  const res = await fetch(url.toString(), {
    headers: { 'X-TYPESENSE-API-KEY': apiKey },
  })
  if (!res.ok) return null

  const json = await res.json() as TypesenseSearchResponse<TypesenseCrmDoc>
  const ids = (json.hits ?? [])
    .map(h => h.document?.hubspot_contact_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
  return { ids, found: Number(json.found ?? 0) }
}
