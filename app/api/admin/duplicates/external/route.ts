/**
 * GET /api/admin/duplicates/external
 *
 * Détecte les doublons entre les contacts de l'équipe externe (Benjamin Delacour)
 * et les contacts de l'équipe interne (télépros + closers).
 *
 * Même algorithme que /api/admin/duplicates mais filtré cross-team uniquement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const EXTERNAL_OWNER_ID = process.env.EXTERNAL_TEAM_OWNER_ID

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

interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    mobilephone?: string
    hubspot_owner_id?: string
    createdate?: string
    hs_last_activity_date?: string
    notes_last_contacted?: string
    num_associated_deals?: string
    hs_lead_status?: string
    lifecyclestage?: string
  }
}

interface EnrichedContact extends HubSpotContact {
  team: 'interne' | 'externe'
  ownerName: string
  ownerColor: string
  dealStage?: string
}

interface DuplicateGroup {
  id: string
  contacts: EnrichedContact[]
  reason: 'same_phone' | 'same_email' | 'same_name'
  confidence: 'high' | 'medium'
  matchedValue?: string
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('+33')) p = '0' + p.slice(3)
  if (p.startsWith('0033')) p = '0' + p.slice(4)
  return p
}

function normalizeName(firstname?: string, lastname?: string): string {
  return `${firstname || ''} ${lastname || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchContactsForOwner(ownerId: string): Promise<HubSpotContact[]> {
  const contacts: HubSpotContact[] = []
  let after: string | undefined = undefined

  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId }] }],
      properties: [
        'email', 'firstname', 'lastname', 'phone', 'mobilephone',
        'hubspot_owner_id', 'createdate', 'hs_last_activity_date',
        'notes_last_contacted', 'num_associated_deals',
        'hs_lead_status', 'lifecyclestage',
      ],
      limit: 200,
    }
    if (after) body.after = after

    try {
      const res = await hubspotFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      contacts.push(...(res.results || []))
      after = res.paging?.next?.after
      if (!after) break
      await new Promise(r => setTimeout(r, 150))
    } catch {
      break
    }
  }

  return contacts
}

export async function GET(_req: NextRequest) {
  if (!EXTERNAL_OWNER_ID) {
    return NextResponse.json(
      { error: 'EXTERNAL_TEAM_OWNER_ID non configuré' },
      { status: 500 }
    )
  }

  const db = createServiceClient()

  // 1. Récupérer les users internes (télépros + closers) avec hubspot_owner_id
  const { data: internalUsers } = await db
    .from('rdv_users')
    .select('id, name, avatar_color, hubspot_owner_id, role')
    .in('role', ['telepro', 'closer'])
    .not('hubspot_owner_id', 'is', null)

  if (!internalUsers || internalUsers.length === 0) {
    return NextResponse.json({
      groups: [],
      stats: { externalContacts: 0, internalContacts: 0, totalGroups: 0, ignoredCount: 0 },
    })
  }

  // 2. Récupérer les contacts ignorés
  const { data: ignored } = await db.from('ignored_duplicates').select('contact_id_a, contact_id_b')
  const ignoredSet = new Set<string>(
    (ignored || []).map(r => {
      const [a, b] = [r.contact_id_a, r.contact_id_b].sort()
      return `${a}_${b}`
    })
  )

  // 3. Fetch contacts de l'équipe externe (Benjamin Delacour)
  const externalRaw = await fetchContactsForOwner(EXTERNAL_OWNER_ID)
  const externalContacts: EnrichedContact[] = externalRaw.map(c => ({
    ...c,
    team: 'externe' as const,
    ownerName: 'Benjamin Delacour',
    ownerColor: '#f59e0b',
  }))

  // 4. Fetch contacts de l'équipe interne (séquentiel pour respecter rate limit)
  const internalContacts: EnrichedContact[] = []
  for (const user of internalUsers) {
    const contacts = await fetchContactsForOwner(user.hubspot_owner_id!)
    for (const c of contacts) {
      internalContacts.push({
        ...c,
        team: 'interne' as const,
        ownerName: user.name,
        ownerColor: user.avatar_color || '#4cabdb',
      })
    }
    await new Promise(r => setTimeout(r, 200))
  }

  // 5. Déduplication par ID
  const allContacts: EnrichedContact[] = [...externalContacts, ...internalContacts]
  const seen = new Set<string>()
  const uniqueContacts = allContacts.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  // 6. Détection des doublons (cross-team uniquement)
  const groups: DuplicateGroup[] = []
  const addedPairs = new Set<string>()

  function pairKey(a: string, b: string) {
    const [x, y] = [a, b].sort()
    return `${x}_${y}`
  }

  function isIgnored(a: string, b: string) {
    return ignoredSet.has(pairKey(a, b))
  }

  function addGroupCrossTeam(
    contacts: EnrichedContact[],
    reason: DuplicateGroup['reason'],
    confidence: DuplicateGroup['confidence'],
    matchedValue?: string,
  ) {
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        // CROSS-TEAM uniquement : un contact externe + un contact interne
        if (contacts[i].team === contacts[j].team) continue
        const key = pairKey(contacts[i].id, contacts[j].id)
        if (addedPairs.has(key) || isIgnored(contacts[i].id, contacts[j].id)) continue
        addedPairs.add(key)
        groups.push({
          id: key,
          contacts: [contacts[i], contacts[j]],
          reason,
          confidence,
          matchedValue,
        })
      }
    }
  }

  // Passe 1: Même téléphone
  const phoneMap = new Map<string, EnrichedContact[]>()
  for (const c of uniqueContacts) {
    const phones = [c.properties.phone, c.properties.mobilephone]
      .filter(Boolean)
      .map(p => normalizePhone(p!))
      .filter(p => p.length >= 8)
    for (const phone of phones) {
      if (!phoneMap.has(phone)) phoneMap.set(phone, [])
      phoneMap.get(phone)!.push(c)
    }
  }
  for (const [phone, members] of phoneMap.entries()) {
    if (members.length < 2) continue
    addGroupCrossTeam(members, 'same_phone', 'high', phone)
  }

  // Passe 2: Même email exact
  const emailMap = new Map<string, EnrichedContact[]>()
  for (const c of uniqueContacts) {
    const email = c.properties.email?.toLowerCase().trim()
    if (!email) continue
    if (!emailMap.has(email)) emailMap.set(email, [])
    emailMap.get(email)!.push(c)
  }
  for (const [email, members] of emailMap.entries()) {
    if (members.length < 2) continue
    addGroupCrossTeam(members, 'same_email', 'high', email)
  }

  // Passe 3: Même nom complet normalisé
  const nameMap = new Map<string, EnrichedContact[]>()
  for (const c of uniqueContacts) {
    const key = normalizeName(c.properties.firstname, c.properties.lastname)
    if (!key || key.length < 4) continue
    if (!nameMap.has(key)) nameMap.set(key, [])
    nameMap.get(key)!.push(c)
  }
  for (const [name, members] of nameMap.entries()) {
    if (members.length < 2) continue
    const emails = new Set(members.map(c => c.properties.email?.toLowerCase()).filter(Boolean))
    if (emails.size < 2) continue
    addGroupCrossTeam(members, 'same_name', 'medium', name)
  }

  // Trier par raison (phone > email > name)
  const reasonOrder = { same_phone: 0, same_email: 1, same_name: 2 }
  groups.sort((a, b) => reasonOrder[a.reason] - reasonOrder[b.reason])

  // 7. Enrichir avec deal stages (batch, best-effort)
  const contactIdsInGroups = [...new Set(groups.flatMap(g => g.contacts.map(c => c.id)))]
  if (contactIdsInGroups.length > 0) {
    try {
      const chunkArray = <T,>(arr: T[], size: number): T[][] =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

      const contactDealMap = new Map<string, string[]>()
      for (const chunk of chunkArray(contactIdsInGroups, 100)) {
        try {
          const assocRes = await hubspotFetch('/crm/v4/associations/contacts/deals/batch/read', {
            method: 'POST',
            body: JSON.stringify({ inputs: chunk.map(id => ({ id })) }),
          })
          for (const result of (assocRes.results || [])) {
            const dealIds = (result.to || [])
              .map((t: { toObjectId?: string | number; id?: string }) =>
                String(t.toObjectId ?? t.id ?? ''))
              .filter((id: string) => id && id !== 'undefined' && id !== 'null')
            if (dealIds.length > 0) contactDealMap.set(String(result.from.id), dealIds)
          }
        } catch { /* chunk échoué */ }
      }

      const allDealIds = [...new Set([...contactDealMap.values()].flat())]
      if (allDealIds.length > 0) {
        const dealStageMap = new Map<string, { stage: string; pipeline: string }>()
        for (const chunk of chunkArray(allDealIds, 100)) {
          try {
            const dealsRes = await hubspotFetch('/crm/v3/objects/deals/batch/read', {
              method: 'POST',
              body: JSON.stringify({
                inputs: chunk.map(id => ({ id })),
                properties: ['dealstage', 'pipeline', 'closedate'],
              }),
            })
            for (const deal of (dealsRes.results || [])) {
              dealStageMap.set(deal.id, { stage: deal.properties.dealstage, pipeline: deal.properties.pipeline })
            }
          } catch { /* chunk échoué */ }
        }

        const PIPELINE = process.env.HUBSPOT_PIPELINE_ID || '2313043166'
        for (const group of groups) {
          for (const contact of group.contacts) {
            const dealIds = contactDealMap.get(contact.id) || []
            const pipelineDeals = dealIds.map(id => dealStageMap.get(id)).filter(d => d && d.pipeline === PIPELINE)
            if (pipelineDeals.length > 0) {
              contact.dealStage = pipelineDeals[0]!.stage
            }
          }
        }
      }
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    groups,
    stats: {
      externalContacts: externalContacts.length,
      internalContacts: internalContacts.length,
      totalGroups: groups.length,
      ignoredCount: ignored?.length || 0,
    },
  })
}
