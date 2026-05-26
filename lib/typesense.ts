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

type MultiSearchResponse<T> = {
  results?: Array<TypesenseSearchResponse<T>>
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

  // Toujours utiliser POST /multi_search : compatible avec les gros filter_by
  // (>4KB) qu'un GET ne peut pas porter. Les filtres "vue Edumove" peuvent
  // facilement atteindre 16KB+ avec 1000+ contact_ids Meta.
  const url = `${base.replace(/\/+$/, '')}/multi_search`

  const search: Record<string, unknown> = {
    collection,
    q: params.q || '*',
    query_by: params.queryBy,
    page: Math.max(1, params.page),
    per_page: Math.max(1, Math.min(params.perPage, 250)),
    include_fields: 'hubspot_contact_id',
  }
  if (params.filterBy) search.filter_by = params.filterBy
  if (params.sortBy) search.sort_by = params.sortBy

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-TYPESENSE-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ searches: [search] }),
  })
  if (!res.ok) return null

  const json = await res.json() as MultiSearchResponse<TypesenseCrmDoc>
  const result = json.results?.[0]
  if (!result) return null

  const ids = (result.hits ?? [])
    .map(h => h.document?.hubspot_contact_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
  return { ids, found: Number(result.found ?? 0) }
}
