import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAllContactsForSync, getAllDealsForSync } from '@/lib/hubspot'

const CRON_SECRET = process.env.CRON_SECRET

// GET /api/cron/crm-sync
// Synchronise HubSpot → Supabase (contacts + deals)
// Appelé par le cron Vercel toutes les heures (0 * * * *)
// Peut être forcé manuellement avec ?force=1
export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = req.nextUrl.searchParams.get('force') === '1'
  const db = createServiceClient()
  const startMs = Date.now()

  // Vérifier si un sync a eu lieu dans les 55 dernières minutes (sauf force)
  if (!force) {
    const { data: lastSync } = await db
      .from('crm_sync_log')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()

    if (lastSync?.synced_at) {
      const msSinceSync = Date.now() - new Date(lastSync.synced_at).getTime()
      if (msSinceSync < 55 * 60 * 1000) {
        return NextResponse.json({
          skipped: true,
          reason: `Sync trop récente (il y a ${Math.round(msSinceSync / 60000)} min)`,
        })
      }
    }
  }

  let contactsUpserted = 0
  let dealsUpserted = 0
  let errorMessage: string | null = null

  try {
    // ── 1. Sync Contacts ────────────────────────────────────────────
    let contactCursor: string | undefined = undefined
    do {
      const { contacts, nextCursor } = await getAllContactsForSync(contactCursor)

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
          synced_at: new Date().toISOString(),
        }))

        await db.from('crm_contacts').upsert(rows, { onConflict: 'hubspot_contact_id' })
        contactsUpserted += rows.length
      }

      contactCursor = nextCursor
    } while (contactCursor)

    // ── 2. Sync Deals ───────────────────────────────────────────────
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
          // Extraire le contact associé (via associations)
          const contactId =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d as any).associations?.contacts?.results?.[0]?.id ?? null

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
      }

      dealCursor = nextCursor
    } while (dealCursor)

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
  })
}
