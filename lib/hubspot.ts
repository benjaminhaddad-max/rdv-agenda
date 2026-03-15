const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

export async function hubspotFetch(path: string, options: RequestInit = {}, _retry = 0): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  // Retry sur 429 (rate limit) avec backoff exponentiel — max 4 tentatives
  if (res.status === 429 && _retry < 4) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10)
    const waitMs = Math.max(retryAfter * 1000, (2 ** _retry) * 600)
    await new Promise(r => setTimeout(r, waitMs))
    return hubspotFetch(path, options, _retry + 1)
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot ${res.status}: ${err}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const STAGES = {
  aReplanifier: process.env.HUBSPOT_STAGE_A_REPLANIFIER || '3165428979',
  rdvPris: process.env.HUBSPOT_STAGE_RDV_PRIS || '3165428980',
  delaiReflexion: process.env.HUBSPOT_STAGE_DELAI_REFLEXION || '3165428981',
  preinscription: process.env.HUBSPOT_STAGE_PREINSCRIPTION || '3165428982',
  finalisation: '3165428983',
  inscriptionConfirmee: '3165428984',
  fermePerdu: '3165428985',
}

export const PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID || '2313043166'
export const PIPELINE_2026_2027 = process.env.HUBSPOT_PIPELINE_2026_2027 || '2313043166'

const CONTACT_PROPS = 'email,firstname,lastname,phone,departement,classe_actuelle,diploma_sante___formation_demandee,hubspot_owner_id,recent_conversion_date,recent_conversion_event_name,email_parent,zone___localite'

export interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    departement?: string
    classe_actuelle?: string
    diploma_sante___formation_demandee?: string
    hubspot_owner_id?: string
    /** ms timestamp en string — date de la dernière soumission de formulaire */
    recent_conversion_date?: string
    /** Nom du formulaire HubSpot soumis en dernier */
    recent_conversion_event_name?: string
    /** Email du/des parent(s) — propriété custom HubSpot */
    email_parent?: string
    zone___localite?: string
  }
}

// ─── Récupérer un contact par son ID HubSpot ───────────────────────────────
export async function getContact(contactId: string): Promise<HubSpotContact> {
  return hubspotFetch(`/crm/v3/objects/contacts/${contactId}?properties=${CONTACT_PROPS}`)
}

// ─── Chercher un contact par téléphone ─────────────────────────────────────
export async function searchContactByPhone(phone: string): Promise<{ results: HubSpotContact[] }> {
  // Essaie phone ET mobilephone (OR entre filterGroups)
  return hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] },
        { filters: [{ propertyName: 'mobilephone', operator: 'EQ', value: phone }] },
      ],
      properties: CONTACT_PROPS.split(','),
      limit: 5,
    }),
  })
}

// ─── Créer un contact HubSpot ──────────────────────────────────────────────
export async function createHubSpotContact(properties: {
  firstname: string
  lastname: string
  email: string
  phone?: string
  departement?: string
  classe_actuelle?: string
  diploma_sante___formation_demandee?: string
}): Promise<HubSpotContact> {
  return hubspotFetch('/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  })
}

// ─── Mettre à jour les propriétés d'un contact ────────────────────────────
export async function updateContact(
  contactId: string,
  properties: Record<string, string | number | null>
) {
  return hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  })
}

// ─── Ajouter une note sur un deal (et optionnellement le contact) ──────────
// Utilise l'API Engagements v1 (plus simple pour les notes)
export async function addNoteToEngagements(params: {
  dealId: string
  contactId?: string | null
  body: string
}) {
  const associations: Record<string, number[]> = {
    dealIds: [parseInt(params.dealId)],
  }
  if (params.contactId) {
    associations.contactIds = [parseInt(params.contactId)]
  }

  return hubspotFetch('/engagements/v1/engagements', {
    method: 'POST',
    body: JSON.stringify({
      engagement: {
        active: true,
        type: 'NOTE',
        timestamp: Date.now(),
      },
      associations,
      metadata: {
        body: params.body,
      },
    }),
  })
}

// ─── Formate le nom d'un deal pour les stages RDV/Délai/Replanifier ────────
export function formatDealName(params: {
  prospectName: string
  classeActuelle?: string | null
  formationType?: string | null
}): string {
  const parts = [
    params.prospectName.trim(),
    params.classeActuelle?.trim() || null,
    params.formationType?.trim() || null,
  ].filter(Boolean)
  return parts.join(' - ')
}

// ─── Créer un deal lors d'un RDV ──────────────────────────────────────────
export async function createDeal(params: {
  prospectName: string
  prospectEmail: string
  prospectPhone?: string | null
  ownerId?: string | null       // optionnel — null si pas encore assigné
  appointmentDate: string     // ISO
  appointmentId: string
  formationType?: string | null
  classeActuelle?: string | null  // pour le nom du deal
  hubspotContactId?: string | null  // ID contact déjà connu → évite doublon
  callNotes?: string | null         // Notes d'appel → ajoutées sur le deal
}) {
  // 1. Créer le deal
  const dealProperties: Record<string, string> = {
    dealname: formatDealName({
      prospectName: params.prospectName,
      classeActuelle: params.classeActuelle,
      formationType: params.formationType,
    }),
    pipeline: PIPELINE_ID,
    dealstage: STAGES.rdvPris,
    closedate: params.appointmentDate,
    description: [
      params.formationType ? `Formation souhaitée : ${params.formationType}` : '',
      `RDV via agenda interne — ID : ${params.appointmentId}`,
    ].filter(Boolean).join('\n'),
  }
  if (params.ownerId) {
    dealProperties.hubspot_owner_id = params.ownerId
  }

  const deal = await hubspotFetch('/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({ properties: dealProperties }),
  })

  // 2. Trouver ou créer le contact associé
  let contactId: string | null = params.hubspotContactId || null

  if (!contactId) {
    try {
      const search = await hubspotFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: 'email', operator: 'EQ', value: params.prospectEmail }],
          }],
          properties: ['email', 'firstname', 'lastname'],
          limit: 1,
        }),
      })
      if (search.results?.length > 0) {
        contactId = search.results[0].id
      } else {
        const nameParts = params.prospectName.split(' ')
        const created = await hubspotFetch('/crm/v3/objects/contacts', {
          method: 'POST',
          body: JSON.stringify({
            properties: {
              email: params.prospectEmail,
              firstname: nameParts[0] || params.prospectName,
              lastname: nameParts.slice(1).join(' ') || '',
              phone: params.prospectPhone || '',
            },
          }),
        })
        contactId = created.id
      }
    } catch (_e) {
      console.error('Contact search/create failed:', _e)
    }
  }

  // 3. Associer le contact au deal
  if (contactId) {
    try {
      await hubspotFetch(
        `/crm/v3/objects/deals/${deal.id}/associations/contacts/${contactId}/deal_to_contact`,
        { method: 'PUT' }
      )
    } catch (_e) { /* best-effort */ }
  }

  // 4. Ajouter les notes d'appel sur le deal
  if (params.callNotes?.trim() && deal.id) {
    try {
      await addNoteToEngagements({
        dealId: deal.id,
        contactId,
        body: params.callNotes,
      })
    } catch (_e) {
      console.error('Note creation failed:', _e)
    }
  }

  return { ...deal, contactId }
}

// ─── Mettre à jour le stade d'un deal ─────────────────────────────────────
export async function updateDealStage(dealId: string, stage: keyof typeof STAGES) {
  return hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: { dealstage: STAGES[stage] },
    }),
  })
}

// ─── Supprimer un deal HubSpot ────────────────────────────────────────────
export async function deleteDeal(dealId: string) {
  return hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: 'DELETE',
  })
}

// ─── Mettre à jour le propriétaire d'un deal ─────────────────────────────
export async function updateDealOwner(dealId: string, ownerId: string) {
  return hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: { hubspot_owner_id: ownerId },
    }),
  })
}

// ─── Chercher les deals d'un télépro (pour l'historique) ──────────────────
// Utilise la propriété custom "teleprospecteur" (conservée même quand le deal
// est réassigné à un closer) — identique à l'approche de telepro-stats
export async function searchDealsByOwner(
  ownerId: string,
  pipelineId: string,
  sinceMs: number
): Promise<Array<{
  id: string
  properties: { dealname: string; dealstage: string; closedate: string; createdate: string; description?: string; diploma_sante___formation?: string }
}>> {
  try {
    const data = await hubspotFetch('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: 'teleprospecteur', operator: 'EQ', value: ownerId },
            { propertyName: 'pipeline', operator: 'EQ', value: pipelineId },
          ],
        }],
        properties: ['dealname', 'dealstage', 'closedate', 'createdate', 'description', 'diploma_sante___formation'],
        sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
        limit: 200,
      }),
    })
    return data.results ?? []
  } catch {
    return []
  }
}

// ─── Chercher les deals d'un closer (pour l'historique closer) ────────────
// Filtre par hubspot_owner_id (le propriétaire du deal = le closer)
export async function searchDealsByCloser(
  ownerId: string,
  pipelineId: string,
  sinceMs: number
): Promise<Array<{
  id: string
  properties: { dealname: string; dealstage: string; closedate: string; createdate: string; description?: string; diploma_sante___formation?: string }
}>> {
  try {
    const data = await hubspotFetch('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
            { propertyName: 'pipeline', operator: 'EQ', value: pipelineId },
          ],
        }],
        properties: ['dealname', 'dealstage', 'closedate', 'createdate', 'description', 'diploma_sante___formation'],
        sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
        limit: 200,
      }),
    })
    return data.results ?? []
  } catch {
    return []
  }
}

// ─── Chercher les deals passés encore en "RDV Pris" (pour l'audit admin) ──
// Utilise la pagination HubSpot (cursor `after`) pour dépasser la limite de 200
export async function searchPastRdvPrisDeals(pipelineId: string): Promise<Array<{
  id: string
  properties: {
    dealname: string
    dealstage: string
    closedate: string
    createdate: string
    hubspot_owner_id: string
    teleprospecteur: string
  }
}>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allResults: any[] = []
  const now = Date.now()
  let after: string | undefined = undefined

  try {
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        filterGroups: [{
          filters: [
            { propertyName: 'pipeline',  operator: 'EQ', value: pipelineId },
            { propertyName: 'dealstage', operator: 'EQ', value: STAGES.rdvPris },
          ],
        }],
        properties: ['dealname', 'dealstage', 'closedate', 'createdate', 'hubspot_owner_id', 'teleprospecteur'],
        sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
        limit: 200,
      }
      if (after) body.after = after

      const data = await hubspotFetch('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = data.results ?? []
      allResults.push(...results)
      after = data.paging?.next?.after ?? undefined
    } while (after)

    return allResults.filter(d => {
      if (!d.properties.closedate) return false
      return new Date(d.properties.closedate).getTime() <= now
    })
  } catch {
    return allResults
  }
}

// ─── Lire un deal HubSpot ─────────────────────────────────────────────────
export async function getDeal(dealId: string): Promise<{
  dealname: string; dealstage: string; closedate: string; pipeline: string
} | null> {
  try {
    const data = await hubspotFetch(
      `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,closedate,pipeline`
    )
    return data.properties as { dealname: string; dealstage: string; closedate: string; pipeline: string }
  } catch {
    return null
  }
}

// ─── Récupérer les engagements (notes, appels…) d'un deal ─────────────────
export async function getDealEngagements(dealId: string): Promise<Array<{
  engagement: { id: number; type: string; createdAt: number; timestamp: number }
  metadata: { body?: string; status?: string; direction?: string }
}>> {
  try {
    const data = await hubspotFetch(
      `/engagements/v1/engagements/associated/deal/${dealId}/paged?count=20`
    )
    return data.results ?? []
  } catch {
    return []
  }
}

// ─── Récupérer le contact associé à un deal (via API associations) ────────
export async function getDealContactInfo(dealId: string): Promise<HubSpotContact | null> {
  try {
    const assoc = await hubspotFetch(`/crm/v3/objects/deals/${dealId}/associations/contacts`)
    const contactId = assoc.results?.[0]?.id
    if (!contactId) return null
    return getContact(String(contactId))
  } catch {
    return null
  }
}

// ─── Chercher des deals par étapes (pour le Journal des Repop) ────────────
// Retourne les deals d'un pipeline dont le stage est dans la liste fournie.
// Optionnellement filtré par owner (hubspot_owner_id pour les closers,
// teleprospecteur pour les télépros). Sans option = tous les deals (admin).
export async function searchDealsByStages(
  pipelineId: string,
  stages: string[],
  options?: {
    ownerId?: string
    ownerType?: 'closer' | 'telepro'
  }
): Promise<Array<{
  id: string
  properties: {
    dealname: string
    dealstage: string
    closedate: string
    createdate: string
    hubspot_owner_id?: string
    teleprospecteur?: string
    description?: string
    diploma_sante___formation?: string
  }
}>> {
  // Construire les filterGroups : OR entre les stages, AND avec le pipeline et l'owner éventuel
  const stageFilters = stages.map(stage => ({
    filters: [
      { propertyName: 'pipeline',   operator: 'EQ', value: pipelineId },
      { propertyName: 'dealstage',  operator: 'EQ', value: stage },
      ...(options?.ownerId ? [{
        propertyName: options.ownerType === 'telepro' ? 'teleprospecteur' : 'hubspot_owner_id',
        operator: 'EQ',
        value: options.ownerId,
      }] : []),
    ],
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allResults: any[] = []
  let after: string | undefined = undefined

  try {
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        filterGroups: stageFilters,
        properties: ['dealname', 'dealstage', 'closedate', 'createdate', 'hubspot_owner_id', 'teleprospecteur', 'description', 'diploma_sante___formation'],
        sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
        limit: 100,
      }
      if (after) body.after = after

      const data = await hubspotFetch('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = data.results ?? []
      allResults.push(...results)
      after = data.paging?.next?.after ?? undefined
    } while (after)

    return allResults
  } catch {
    return allResults
  }
}

// ─── Chercher les deals récemment modifiés (pour sync bidirectionnelle) ───
// Retourne les deals du pipeline modifiés dans les N dernières minutes.
// Inclut hs_lastmodifieddate, dealstage, hubspot_owner_id pour la comparaison.
export async function searchRecentlyModifiedDeals(
  pipelineId: string,
  sinceMinutes: number = 10
): Promise<Array<{
  id: string
  properties: {
    dealname: string
    dealstage: string
    hubspot_owner_id: string
    hs_lastmodifieddate: string
    description?: string
  }
}>> {
  const sinceMs = Date.now() - sinceMinutes * 60 * 1000

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allResults: any[] = []
  let after: string | undefined = undefined

  try {
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        filterGroups: [{
          filters: [
            { propertyName: 'pipeline', operator: 'EQ', value: pipelineId },
            { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(sinceMs) },
          ],
        }],
        properties: ['dealname', 'dealstage', 'hubspot_owner_id', 'hs_lastmodifieddate', 'description'],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
        limit: 100,
      }
      if (after) body.after = after

      const data = await hubspotFetch('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = data.results ?? []
      allResults.push(...results)
      after = data.paging?.next?.after ?? undefined
    } while (after)

    return allResults
  } catch {
    return allResults
  }
}

// ─── Fusionner deux contacts HubSpot ──────────────────────────────────────
export async function mergeContacts(primaryContactId: string, secondaryContactId: string) {
  return hubspotFetch('/crm/v3/objects/contacts/merge', {
    method: 'POST',
    body: JSON.stringify({
      primaryObjectId: primaryContactId,
      objectIdToMerge: secondaryContactId,
    }),
  })
}

// ─── Sync CRM : récupérer les contacts modifiés depuis une date ───────────
// Utilise l'API Search (plus efficace que GET all) avec filtre lastmodifieddate
// Pour le sync incrémental horaire : since = dernier sync (~50-500 contacts)
// Pour le sync initial : since = '2024-09-01' (début année scolaire)
export async function getContactsModifiedSince(
  since: string, // ISO date string
  after?: string,
): Promise<{ contacts: HubSpotContact[]; nextCursor?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    filterGroups: [{
      filters: [{
        propertyName: 'lastmodifieddate',
        operator: 'GTE',
        value: new Date(since).getTime().toString(),
      }],
    }],
    properties: CONTACT_PROPS.split(','),
    sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
    limit: 100,
  }
  if (after) body.after = after

  const data = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    contacts: data.results ?? [],
    nextCursor: data.paging?.next?.after,
  }
}

// ─── Sync CRM : batch-read de contacts par IDs ────────────────────────────
// 100 IDs max par requête — beaucoup plus rapide que paginer toute la base
export async function batchGetContacts(contactIds: string[]): Promise<HubSpotContact[]> {
  if (contactIds.length === 0) return []
  const data = await hubspotFetch('/crm/v3/objects/contacts/batch/read', {
    method: 'POST',
    body: JSON.stringify({
      inputs: contactIds.map(id => ({ id })),
      properties: CONTACT_PROPS.split(','),
    }),
  })
  return data.results ?? []
}

// ─── Sync CRM : récupérer tous les contacts (paginé, pour sync Supabase) ──
// @deprecated — utiliser getContactsModifiedSince + batchGetContacts
export async function getAllContactsForSync(after?: string): Promise<{
  contacts: HubSpotContact[]
  nextCursor?: string
}> {
  const params = new URLSearchParams({
    properties: CONTACT_PROPS,
    limit: '100',
  })
  if (after) params.set('after', after)

  const data = await hubspotFetch(`/crm/v3/objects/contacts?${params.toString()}`)
  return {
    contacts: data.results ?? [],
    nextCursor: data.paging?.next?.after,
  }
}

// ─── Sync CRM : récupérer tous les deals du pipeline (paginé) ─────────────
const DEAL_SYNC_PROPS = [
  'dealname', 'dealstage', 'pipeline', 'hubspot_owner_id',
  'teleprospecteur', 'diploma_sante___formation',
  'closedate', 'createdate', 'description',
].join(',')

export async function getAllDealsForSync(after?: string): Promise<{
  deals: Array<{
    id: string
    properties: {
      dealname: string; dealstage: string; pipeline: string
      hubspot_owner_id?: string; teleprospecteur?: string
      diploma_sante___formation?: string; closedate?: string
      createdate?: string; description?: string
    }
  }>
  nextCursor?: string
}> {
  // NOTE: associations: ['contacts'] n'est PAS supporté dans le body du endpoint
  // search v3 → 400 Bad Request. Les associations sont récupérées séparément
  // via batchGetDealContactAssociations (v4).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    filterGroups: [{
      filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID }],
    }],
    properties: DEAL_SYNC_PROPS.split(','),
    limit: 100,
  }
  if (after) body.after = after

  const data = await hubspotFetch('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    deals: data.results ?? [],
    nextCursor: data.paging?.next?.after,
  }
}

// ─── Sync CRM : contacts par classe (Terminale / Première / Seconde) ──────
// Utilise l'API Search avec filtre IN sur classe_actuelle.
// Pagine jusqu'à `maxPages` × 100 contacts (defaut 500 = 50 000 contacts max).
export async function getContactsByPriorityClass(
  after?: string,
): Promise<{ contacts: HubSpotContact[]; nextCursor?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    filterGroups: [
      { filters: [{ propertyName: 'classe_actuelle', operator: 'EQ', value: 'Terminale' }] },
      { filters: [{ propertyName: 'classe_actuelle', operator: 'EQ', value: 'Première' }] },
      { filters: [{ propertyName: 'classe_actuelle', operator: 'EQ', value: 'Seconde' }] },
    ],
    properties: CONTACT_PROPS.split(','),
    sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
    limit: 100,
  }
  if (after) body.after = after

  const data = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    contacts: data.results ?? [],
    nextCursor: data.paging?.next?.after,
  }
}

// ─── Sync CRM : associations deals → contacts (batch, API v4) ─────────────
// Retourne un map dealId → contactId pour 100 deals max par appel
export async function batchGetDealContactAssociations(
  dealIds: string[]
): Promise<Record<string, string>> {
  if (dealIds.length === 0) return {}
  try {
    const data = await hubspotFetch('/crm/v4/associations/deals/contacts/batch/read', {
      method: 'POST',
      body: JSON.stringify({
        inputs: dealIds.map(id => ({ id })),
      }),
    })
    const result: Record<string, string> = {}
    for (const item of data.results ?? []) {
      const contactId = item.to?.[0]?.toObjectId
      if (contactId) result[String(item.from.id)] = String(contactId)
    }
    return result
  } catch {
    return {}
  }
}
