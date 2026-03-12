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

const CONTACT_PROPS = 'email,firstname,lastname,phone,departement,classe_actuelle,diploma_sante___formation_demandee,hubspot_owner_id'

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

// ─── Mettre à jour le propriétaire d'un deal ─────────────────────────────
export async function updateDealOwner(dealId: string, ownerId: string) {
  return hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: { hubspot_owner_id: ownerId },
    }),
  })
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
