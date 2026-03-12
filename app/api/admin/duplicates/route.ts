import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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
  }
}

interface EnrichedContact extends HubSpotContact {
  teleproId: string
  teleproName: string
  teleproColor: string
}

interface DuplicateGroup {
  id: string
  contacts: EnrichedContact[]
  reason: 'same_phone' | 'same_email' | 'same_name'
  confidence: 'high' | 'medium'
  crossTelepro: boolean
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

  for (let page = 0; page < 5; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId }] }],
      properties: ['email', 'firstname', 'lastname', 'phone', 'mobilephone', 'hubspot_owner_id', 'createdate', 'hs_last_activity_date', 'notes_last_contacted', 'num_associated_deals'],
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
  const db = createServiceClient()

  // 1. Récupérer les télépros actifs avec hubspot_owner_id
  const { data: telepros } = await db
    .from('rdv_users')
    .select('id, name, avatar_color, hubspot_owner_id')
    .eq('role', 'telepro')
    .not('hubspot_owner_id', 'is', null)

  if (!telepros || telepros.length === 0) {
    return NextResponse.json({ groups: [], stats: { totalContacts: 0, totalGroups: 0, scannedTelepros: 0, ignoredCount: 0 } })
  }

  // 2. Récupérer les contacts ignorés
  const { data: ignored } = await db.from('ignored_duplicates').select('contact_id_a, contact_id_b')
  const ignoredSet = new Set<string>((ignored || []).map(r => `${r.contact_id_a}_${r.contact_id_b}`))

  // 3. Fetch tous les contacts de chaque télépro (séquentiel pour respecter rate limit HubSpot)
  const allContacts: EnrichedContact[] = []
  for (const tp of telepros) {
    const contacts = await fetchContactsForOwner(tp.hubspot_owner_id!)
    for (const c of contacts) {
      allContacts.push({ ...c, teleproId: tp.id, teleproName: tp.name, teleproColor: tp.avatar_color })
    }
    await new Promise(r => setTimeout(r, 200))
  }

  // 4. Déduplication par ID (un contact peut être dans 2 buckets télépro)
  const seen = new Set<string>()
  const uniqueContacts = allContacts.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  // 5. Détection des doublons
  const groups: DuplicateGroup[] = []
  const addedPairs = new Set<string>()

  function pairKey(a: string, b: string) {
    const [x, y] = [a, b].sort()
    return `${x}_${y}`
  }

  function isIgnored(a: string, b: string) {
    return ignoredSet.has(pairKey(a, b))
  }

  function addGroup(contacts: EnrichedContact[], reason: DuplicateGroup['reason'], confidence: DuplicateGroup['confidence']) {
    // Générer toutes les paires de ce groupe
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const key = pairKey(contacts[i].id, contacts[j].id)
        if (addedPairs.has(key) || isIgnored(contacts[i].id, contacts[j].id)) continue
        addedPairs.add(key)
        groups.push({
          id: key,
          contacts: [contacts[i], contacts[j]],
          reason,
          confidence,
          crossTelepro: contacts[i].teleproId !== contacts[j].teleproId,
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
  for (const members of phoneMap.values()) {
    if (members.length < 2) continue
    const emails = new Set(members.map(c => c.properties.email?.toLowerCase()).filter(Boolean))
    if (emails.size < 2) continue
    addGroup(members, 'same_phone', 'high')
  }

  // Passe 2: Même email exact (vrais doublons HubSpot)
  const emailMap = new Map<string, EnrichedContact[]>()
  for (const c of uniqueContacts) {
    const email = c.properties.email?.toLowerCase().trim()
    if (!email) continue
    if (!emailMap.has(email)) emailMap.set(email, [])
    emailMap.get(email)!.push(c)
  }
  for (const members of emailMap.values()) {
    if (members.length < 2) continue
    addGroup(members, 'same_email', 'high')
  }

  // Passe 3: Même nom complet normalisé, emails différents
  const nameMap = new Map<string, EnrichedContact[]>()
  for (const c of uniqueContacts) {
    const key = normalizeName(c.properties.firstname, c.properties.lastname)
    if (!key || key.length < 4) continue
    if (!nameMap.has(key)) nameMap.set(key, [])
    nameMap.get(key)!.push(c)
  }
  for (const members of nameMap.values()) {
    if (members.length < 2) continue
    const emails = new Set(members.map(c => c.properties.email?.toLowerCase()).filter(Boolean))
    if (emails.size < 2) continue
    addGroup(members, 'same_name', 'medium')
  }

  // Trier : cross-télépro en premier, puis par raison (phone > email > name)
  const reasonOrder = { same_phone: 0, same_email: 1, same_name: 2 }
  groups.sort((a, b) => {
    if (a.crossTelepro !== b.crossTelepro) return a.crossTelepro ? -1 : 1
    return reasonOrder[a.reason] - reasonOrder[b.reason]
  })

  return NextResponse.json({
    groups,
    stats: {
      totalContacts: uniqueContacts.length,
      totalGroups: groups.length,
      scannedTelepros: telepros.length,
      ignoredCount: ignored?.length || 0,
    },
  })
}
