import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAllDealsForSync, batchGetContacts, getContactsModifiedSince } from '@/lib/hubspot'

const CRON_SECRET = process.env.CRON_SECRET

// GET /api/cron/crm-sync
// Synchronise HubSpot → Supabase (contacts + deals)
// Stratégie rapide :
//   1. Sync tous les deals du pipeline (filtré → ~500-2000 deals max)
//   2. Batch-read des contacts liés aux deals (100/batch → ~20 appels)
//   3. Sync incrémentale des contacts modifiés depuis le dernier sync
//
// Paramètres :
//   ?force=1      — ignore le délai de 55 min
//   ?full=1       — sync incrémentale depuis 2024-09-01 (premier run)
export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = req.nextUrl.searchParams.get('force') === '1'
  const fullSync = req.nextUrl.searchParams.get('full') === '1'
  const db = createServiceClient()
  const startMs = Date.now()

  // Dernier sync réussi
  const { data: lastSync } = await db
    .from('crm_sync_log')
    .select('synced_at')
    .is('error_message', null)
    .order('synced_at', { ascending: false })
    .limit(1)
    .single()

  // Skip si sync récente (sauf force/full)
  if (!force && !fullSync && lastSync?.synced_at) {
    const msSinceSync = Date.now() - new Date(lastSync.synced_at).getTime()
    if (msSinceSync < 55 * 60 * 1000) {
      return NextResponse.json({
        skipped: true,
        reason: `Sync trop récente (il y a ${Math.round(msSinceSync / 60000)} min)`,
      })
    }
  }

  // Date de référence pour le sync incrémental des contacts
  // - Sync horaire : depuis le dernier sync réussi
  // - Premier run / ?full=1 : depuis le début de l'année scolaire 2024-2025
  const contactSinceFallback = '2024-09-01T00:00:00.000Z'
  const contactSince = fullSync
    ? contactSinceFallback
    : (lastSync?.synced_at ?? contactSinceFallback)

  let contactsUpserted = 0
  let dealsUpserted = 0
  let errorMessage: string | null = null

  try {
    // ── 1. Sync Deals (pipeline filtré → rapide) ─────────────────────────
    const allDeals: typeof [] = []
    let dealCursor: string | undefined = undefined

    do {
      const { deals, nextCursor } = await getAllDealsForSync(dealCursor)

      if (deals.length > 0) {
        // Récupérer les appt_ids liés aux deals via hubspot_deal_id
        const dealIds = deals.map(d => d.id)
        const { data: linkedAppts } = await db
          .from('rdv_appointments')
          .select('id, hubspot_deal_id')
          .in('hubspot_deal_id', dealIds)

        const apptByDeal: Record<string, string> = {}
        for (const appt of linkedAppts ?? []) {
          if (appt.hubspot_deal_id) apptByDeal[appt.hubspot_deal_id] = appt.id
        }

        const rows = deals.map(d => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contactId = (d as any).associations?.contacts?.results?.[0]?.id ?? null
          return {
            hubspot_deal_id: d.id,
            hubspot_contact_id: contactId,
            dealname: d.properties.dealname ?? null,
            dealstage: d.properties.dealstage ?? null,
            pipeline: d.properties.pipeline ?? null,
            hubspot_owner_id: d.properties.hubspot_owner_id ?? null,
            teleprospecteur: d.properties.teleprospecteur ?? null,
            formation: d.properties.diploma_sante___formation ?? null,
            closedate: d.properties.closedate
              ? new Date(d.properties.closedate).toISOString()
              : null,
            createdate: d.properties.createdate
              ? new Date(d.properties.createdate).toISOString()
              : null,
            description: d.properties.description ?? null,
            supabase_appt_id: apptByDeal[d.id] ?? null,
            synced_at: new Date().toISOString(),
          }
        })

        await db.from('crm_deals').upsert(rows, { onConflict: 'hubspot_deal_id' })
        dealsUpserted += rows.length

        // Collecter les contact IDs pour le batch-read
        for (const d of deals) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cid = (d as any).associations?.contacts?.results?.[0]?.id
          if (cid) (allDeals as string[]).push(cid)
        }
      }

      dealCursor = nextCursor
    } while (dealCursor)

    // ── 2. Batch-read des contacts liés aux deals ─────────────────────────
    // Déduplique les IDs et lit 100 par 100 — beaucoup plus rapide que GET all
    const uniqueContactIds = [...new Set(allDeals as string[])]
    const BATCH = 100
    const now = new Date().toISOString()

    for (let i = 0; i < uniqueContactIds.length; i += BATCH) {
      const chunk = uniqueContactIds.slice(i, i + BATCH)
      const contacts = await batchGetContacts(chunk)

      if (contacts.length > 0) {
        const rows = contacts.map(c => ({
          hubspot_contact_id: c.id,
          firstname: c.properties.firstname ?? null,
          lastname: c.properties.lastname ?? null,
          email: c.properties.email ?? null,
          phone: c.properties.phone ?? null,
          departement: c.properties.departement ?? null,
          classe_actuelle: c.properties.classe_actuelle ?? null,
          zone_localite: c.properties.zone___localite ?? null,
          hubspot_owner_id: c.properties.hubspot_owner_id ?? null,
          recent_conversion_date: c.properties.recent_conversion_date
            ? new Date(parseInt(c.properties.recent_conversion_date)).toISOString()
            : null,
          recent_conversion_event: c.properties.recent_conversion_event_name ?? null,
          synced_at: now,
        }))
        await db.from('crm_contacts').upsert(rows, { onConflict: 'hubspot_contact_id' })
        contactsUpserted += rows.length
      }
    }

    // ── 3. Sync incrémentale : contacts modifiés depuis le dernier sync ───
    // Attrape les contacts sans deal (orphelins) et les mises à jour récentes
    let incrCursor: string | undefined = undefined
    let incrRounds = 0
    const MAX_INCREMENTAL_PAGES = fullSync ? 500 : 50 // 50 pages = 5000 contacts max en mode horaire

    do {
      const { contacts, nextCursor } = await getContactsModifiedSince(contactSince, incrCursor)

      if (contacts.length > 0) {
        const rows = contacts.map(c => ({
          hubspot_contact_id: c.id,
          firstname: c.properties.firstname ?? null,
          lastname: c.properties.lastname ?? null,
          email: c.properties.email ?? null,
          phone: c.properties.phone ?? null,
          departement: c.properties.departement ?? null,
          classe_actuelle: c.properties.classe_actuelle ?? null,
          zone_localite: c.properties.zone___localite ?? null,
          hubspot_owner_id: c.properties.hubspot_owner_id ?? null,
          recent_conversion_date: c.properties.recent_conversion_date
            ? new Date(parseInt(c.properties.recent_conversion_date)).toISOString()
            : null,
          recent_conversion_event: c.properties.recent_conversion_event_name ?? null,
          synced_at: now,
        }))
        await db.from('crm_contacts').upsert(rows, { onConflict: 'hubspot_contact_id' })
        // Ne pas double-compter les contacts déjà vus dans le batch-read
        const newIds = rows.filter(r => !uniqueContactIds.includes(r.hubspot_contact_id))
        contactsUpserted += newIds.length
      }

      incrCursor = nextCursor
      incrRounds++
    } while (incrCursor && incrRounds < MAX_INCREMENTAL_PAGES)

  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[crm-sync] Error:', errorMessage)
  }

  const durationMs = Date.now() - startMs

  // Enregistrer le log
  await db.from('crm_sync_log').insert({
    contacts_upserted: contactsUpserted,
    deals_upserted: dealsUpserted,
    duration_ms: durationMs,
    error_message: errorMessage,
  })

  return NextResponse.json({
    ok: !errorMessage,
    contacts_upserted: contactsUpserted,
    deals_upserted: dealsUpserted,
    duration_ms: durationMs,
    error: errorMessage,
    mode: fullSync ? 'full' : 'incremental',
    contact_since: contactSince,
  })
}
