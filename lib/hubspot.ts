const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
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

const CONTACT_PROPS = 'email,firstname,lastname,phone,departement,classe_actuelle,diploma_sante___formation_demandee,hubspot_owner_id,recent_conversion_date,recent_conversion_event_name'

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

// ─── Créer un deal lors d'un RDV ──────────────────────────────────────────
export async function createDeal(params: {
  prospectName: string
  prospectEmail: string
  prospectPhone?: string | null
  ownerId?: string | null       // optionnel — null si pas encore assigné
  appointmentDate: string     // ISO
  appointmentId: string
  formationType?: string | null
  hubspotContactId?: string | null  // ID contact déjà connu → évite doublon
  callNotes?: string | null         // Notes d'appel → ajoutées sur le deal
}) {
  // 1. Créer le deal
  const dealProperties: Record<string, string> = {
    dealname: `RDV Découverte — ${params.prospectName}`,
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
