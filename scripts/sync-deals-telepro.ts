/**
 * sync-deals-telepro.ts
 *
 * Rattrapage en masse : synchronise le Téléprospecteur et le Propriétaire
 * du contact vers tous les deals HubSpot associés.
 *
 * Ce script est l'équivalent manuel du workflow "DS - Sync Télépro + Propriétaire → Transaction"
 * pour les deals existants qui n'ont pas encore été mis à jour.
 *
 * Usage : bun run scripts/sync-deals-telepro.ts
 *         bun run scripts/sync-deals-telepro.ts --dry-run   (simulation sans modifier)
 */

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const BASE_URL = 'https://api.hubapi.com'
const DRY_RUN = process.argv.includes('--dry-run')

if (!HUBSPOT_TOKEN) {
  console.error('❌  HUBSPOT_ACCESS_TOKEN manquant — charge le .env.local avant de lancer le script')
  process.exit(1)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function hs<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

// ─── HubSpot API calls ───────────────────────────────────────────────────────

interface HSDeal {
  id: string
  properties: {
    dealname: string
    hubspot_owner_id: string | null
    teleprospecteur: string | null
    closedate: string | null
    hs_createdate: string | null
  }
}

interface HSPaging {
  next?: { after: string }
}

// Filtre : deals créés depuis le 1er septembre 2025 (promo 2026-2027)
// ET uniquement dans le pipeline principal Diploma Santé
const FILTER_FROM_DATE = '2025-09-01T00:00:00Z'
const PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID ?? '2313043166'

async function getAllDeals(): Promise<HSDeal[]> {
  const deals: HSDeal[] = []
  let after: string | null = null

  do {
    // On utilise l'API Search pour filtrer par date de création ET pipeline
    const body: Record<string, unknown> = {
      properties: ['dealname', 'hubspot_owner_id', 'teleprospecteur', 'closedate', 'hs_createdate', 'pipeline'],
      limit: 100,
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'hs_createdate',
              operator: 'GTE',
              value: FILTER_FROM_DATE,
            },
            {
              propertyName: 'pipeline',
              operator: 'EQ',
              value: PIPELINE_ID,
            },
          ],
        },
      ],
      sorts: [{ propertyName: 'hs_createdate', direction: 'ASCENDING' }],
    }
    if (after) body.after = after

    const data = await hs<{ results: HSDeal[]; paging?: HSPaging }>(
      'POST',
      '/crm/v3/objects/deals/search',
      body
    )
    deals.push(...data.results)
    after = data.paging?.next?.after ?? null
    process.stdout.write(`\r  Chargement des deals pipeline 2026-2027... ${deals.length} trouvés`)

    if (after) await sleep(250)
  } while (after)

  console.log('')
  return deals
}

interface HSAssocResult {
  from: { id: string }
  // v4 API uses toObjectId (number), not id
  to: { toObjectId: number; associationTypes?: unknown[] }[]
}

async function batchGetContactAssociations(
  dealIds: string[]
): Promise<Map<string, string>> {
  // dealId → first contactId
  const dealToContact = new Map<string, string>()
  if (!dealIds.length) return dealToContact

  // Process in chunks of 100 (API limit)
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100)
    const data = await hs<{ results: HSAssocResult[] }>(
      'POST',
      '/crm/v4/associations/deals/contacts/batch/read',
      { inputs: chunk.map(id => ({ id })) }
    )
    for (const item of data.results ?? []) {
      if (item.to?.length && item.to[0]?.toObjectId) {
        dealToContact.set(item.from.id, String(item.to[0].toObjectId))
      }
    }
    if (i + 100 < dealIds.length) await sleep(250)
  }

  return dealToContact
}

interface HSContact {
  id: string
  properties: {
    hubspot_owner_id: string | null
    teleprospecteur: string | null
  }
}

async function batchGetContacts(
  contactIds: string[]
): Promise<Map<string, HSContact>> {
  const map = new Map<string, HSContact>()
  const uniqueIds = [...new Set(contactIds)].filter(id => id && id !== 'undefined' && id !== 'null')
  if (!uniqueIds.length) return map

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100)
    const data = await hs<{ results: HSContact[] }>(
      'POST',
      '/crm/v3/objects/contacts/batch/read',
      {
        properties: ['hubspot_owner_id', 'teleprospecteur'],
        inputs: chunk.map(id => ({ id })),
      }
    )
    for (const contact of data.results ?? []) {
      map.set(contact.id, contact)
    }
    if (i + 100 < uniqueIds.length) await sleep(250)
  }

  return map
}

async function batchUpdateDeals(
  updates: { id: string; properties: Record<string, string> }[]
): Promise<void> {
  if (!updates.length) return

  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100)
    await hs('POST', '/crm/v3/objects/deals/batch/update', { inputs: chunk })
    if (i + 100 < updates.length) await sleep(250)
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  Sync Téléprospecteur + Propriétaire → Deals HubSpot   ║')
  if (DRY_RUN) {
    console.log('║                *** MODE SIMULATION ***                  ║')
  }
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  // ── 1. Récupérer tous les deals ──────────────────────────────────────────
  console.log(`📥  Étape 1/4 : Chargement des deals 2026-2027 (pipeline ${PIPELINE_ID}, depuis ${FILTER_FROM_DATE})...`)
  const allDeals = await getAllDeals()
  console.log(`    → ${allDeals.length} deals chargés\n`)

  // ── 2. Récupérer les associations deal → contact ─────────────────────────
  console.log('🔗  Étape 2/4 : Chargement des associations deal → contact...')
  const dealIds = allDeals.map(d => d.id)
  const dealToContact = await batchGetContactAssociations(dealIds)
  console.log(`    → ${dealToContact.size} deals ont un contact associé\n`)

  // ── 3. Récupérer les propriétés des contacts ─────────────────────────────
  console.log('👤  Étape 3/4 : Chargement des propriétés contacts...')
  const contactIds = [...dealToContact.values()]
  const contactMap = await batchGetContacts(contactIds)
  console.log(`    → ${contactMap.size} contacts chargés\n`)

  // ── 4. Calculer et appliquer les mises à jour ────────────────────────────
  console.log('⚡  Étape 4/4 : Calcul et application des mises à jour...\n')

  const toUpdate: { id: string; properties: Record<string, string> }[] = []
  let alreadyOk = 0
  let noContact = 0
  let noData = 0

  for (const deal of allDeals) {
    const contactId = dealToContact.get(deal.id)
    if (!contactId) {
      noContact++
      continue
    }

    const contact = contactMap.get(contactId)
    if (!contact) {
      noContact++
      continue
    }

    const contactTelePro = contact.properties?.teleprospecteur
    const contactOwner = contact.properties?.hubspot_owner_id

    if (!contactTelePro && !contactOwner) {
      noData++
      continue
    }

    // Vérifier si déjà à jour
    const dealTelePro = deal.properties?.teleprospecteur
    const dealOwner = deal.properties?.hubspot_owner_id

    const teleproChanged = contactTelePro && dealTelePro !== contactTelePro
    const ownerChanged = contactOwner && dealOwner !== contactOwner

    if (!teleproChanged && !ownerChanged) {
      alreadyOk++
      continue
    }

    const updateProps: Record<string, string> = {}
    if (teleproChanged && contactTelePro) updateProps.teleprospecteur = contactTelePro
    if (ownerChanged && contactOwner) updateProps.hubspot_owner_id = contactOwner

    toUpdate.push({ id: deal.id, properties: updateProps })

    const name = deal.properties.dealname ?? `Deal #${deal.id}`
    const changes = [
      teleproChanged ? `télépro: ${dealTelePro ?? 'vide'} → ${contactTelePro}` : '',
      ownerChanged ? `owner: ${dealOwner ?? 'vide'} → ${contactOwner}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    console.log(`  📝 ${name}`)
    console.log(`     ${changes}`)
  }

  console.log(`\n  ──────────────────────────────────────────────────`)
  console.log(`  Deals à mettre à jour : ${toUpdate.length}`)
  console.log(`  Déjà à jour           : ${alreadyOk}`)
  console.log(`  Sans contact associé  : ${noContact}`)
  console.log(`  Contact sans données  : ${noData}`)
  console.log(`  ──────────────────────────────────────────────────\n`)

  if (!toUpdate.length) {
    console.log('✅  Rien à faire — tous les deals sont déjà synchronisés.\n')
    return
  }

  if (DRY_RUN) {
    console.log(`🔍  Mode simulation : ${toUpdate.length} deals AURAIENT été mis à jour.`)
    console.log('    Relancez sans --dry-run pour appliquer les changements.\n')
    return
  }

  console.log(`🚀  Application des mises à jour sur ${toUpdate.length} deals...`)
  await batchUpdateDeals(toUpdate)
  console.log(`\n✅  ${toUpdate.length} deals mis à jour avec succès !\n`)
}

main().catch(err => {
  console.error('\n❌  Erreur fatale:', err.message ?? err)
  process.exit(1)
})
