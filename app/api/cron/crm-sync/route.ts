import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAllDealsForSync, batchGetContacts, getContactsModifiedSince, batchGetDealContactAssociations, getContactsByClass, getAllContactsForSync, getAllPropertyNames, getAllPropertiesMeta, getContactEngagements, getContactFormSubmissions, getAllOwners } from '@/lib/hubspot'

// Étend le timeout Vercel à 5 min (nécessite plan Pro)
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

// Nombre de pages HubSpot (×100 contacts) max par appel
// 50 pages = 5 000 contacts ≈ 8-10 secondes — bien en dessous du timeout
const MAX_PAGES_PER_CHUNK = 50

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force         = req.nextUrl.searchParams.get('force') === '1'
  const fullSync      = req.nextUrl.searchParams.get('full') === '1'
  // Paramètre de reprise pour le sync complet (chunked)
  const contactCursor = req.nextUrl.searchParams.get('contact_cursor') ?? null
  const db            = createServiceClient()
  const startMs       = Date.now()
  const now           = new Date().toISOString()

  // ── Mode reprise (contact_cursor fourni) : uniquement Phase 6 ─────────────
  // Le frontend appelle ce mode en boucle après le premier appel full=1
  if (contactCursor !== null) {
    let contactsUpserted = 0
    let errorMessage: string | null = null
    let nextContactCursor: string | null = null

    try {
      // En mode reprise, on récupère aussi toutes les propriétés
      const allContactPropsChunk = await getAllPropertyNames('contacts')
      const chunkPropsToFetch = allContactPropsChunk.length > 0 ? allContactPropsChunk : undefined

      let cursor: string | undefined = contactCursor
      let rounds = 0
      const buffer: ReturnType<typeof buildContactRow>[] = []

      while (rounds < MAX_PAGES_PER_CHUNK) {
        const { contacts: batch, nextCursor } = await getAllContactsForSync(cursor, chunkPropsToFetch)

        if (batch.length > 0) {
          buffer.push(...batch.map(c => buildContactRow(c, now)))
        }

        cursor = nextCursor
        rounds++

        if (!nextCursor) break
      }

      // Upsert en une seule fois (moins de round-trips Supabase)
      if (buffer.length > 0) {
        await db.from('crm_contacts').upsert(dedupContactRows(buffer), { onConflict: 'hubspot_contact_id' })
        contactsUpserted = buffer.length
      }

      nextContactCursor = cursor ?? null

    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[crm-sync] Chunk error:', errorMessage)
    }

    const durationMs = Date.now() - startMs

    // Log uniquement si c'est le dernier chunk (pas de cursor suivant)
    if (!nextContactCursor) {
      await db.from('crm_sync_log').insert({
        contacts_upserted: contactsUpserted,
        deals_upserted:    0,
        duration_ms:       durationMs,
        error_message:     errorMessage,
      })
    }

    return NextResponse.json({
      ok:                !errorMessage,
      contacts_upserted: contactsUpserted,
      deals_upserted:    0,
      duration_ms:       durationMs,
      error:             errorMessage,
      mode:              'full_chunk',
      next_cursor:       nextContactCursor,
      done:              !nextContactCursor,
    })
  }

  // ── Mode normal (incremental ou premier appel full) ────────────────────────

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
    const msSince = Date.now() - new Date(lastSync.synced_at).getTime()
    if (msSince < 55 * 60 * 1000) {
      return NextResponse.json({
        skipped: true,
        reason: `Sync trop récente (il y a ${Math.round(msSince / 60000)} min)`,
      })
    }
  }

  const contactSinceFallback = '2024-09-01T00:00:00.000Z'
  const contactSince = fullSync
    ? contactSinceFallback
    : (lastSync?.synced_at ?? contactSinceFallback)

  let contactsUpserted = 0
  let dealsUpserted    = 0
  let errorMessage: string | null = null
  let nextContactCursor: string | null = null

  let currentPhase = 0

  try {
    // ── Phase 0 : Récupérer tous les noms de propriétés HubSpot ──────────
    currentPhase = 0
    const [allContactProps, allDealProps] = await Promise.all([
      getAllPropertyNames('contacts'),
      getAllPropertyNames('deals'),
    ])
    // Fallback sur les props hardcodées si l'API échoue
    const contactPropsToFetch = allContactProps.length > 0 ? allContactProps : undefined
    const dealPropsToFetch    = allDealProps.length > 0    ? allDealProps    : undefined

    // ── Phase 1 : Récupérer tous les deals du pipeline ────────────────────
    currentPhase = 1
    const allDealRows: ReturnType<typeof buildDealRow>[] = []
    const allDealIds: string[] = []
    let dealCursor: string | undefined = undefined

    do {
      const { deals, nextCursor } = await getAllDealsForSync(dealCursor, dealPropsToFetch)

      for (const d of deals) {
        allDealIds.push(d.id)
        allDealRows.push(buildDealRow(d))
      }

      dealCursor = nextCursor
    } while (dealCursor)

    // ── Phase 2 : Associations deals → contacts (batch v4) ───────────────
    currentPhase = 2
    const dealToContact: Record<string, string> = {}
    const ASSOC_BATCH = 100
    for (let i = 0; i < allDealIds.length; i += ASSOC_BATCH) {
      const chunk = allDealIds.slice(i, i + ASSOC_BATCH)
      const assocMap = await batchGetDealContactAssociations(chunk)
      Object.assign(dealToContact, assocMap)
    }

    // ── Phase 3 : Lier appt Supabase + upsert deals ───────────────────────
    currentPhase = 3
    const DEAL_BATCH = 200
    for (let i = 0; i < allDealRows.length; i += DEAL_BATCH) {
      const chunk = allDealRows.slice(i, i + DEAL_BATCH)
      const chunkIds = chunk.map(r => r.hubspot_deal_id)

      for (const row of chunk) {
        row.hubspot_contact_id = dealToContact[row.hubspot_deal_id] ?? null
      }

      const { data: linkedAppts } = await db
        .from('rdv_appointments')
        .select('id, hubspot_deal_id')
        .in('hubspot_deal_id', chunkIds)

      for (const appt of linkedAppts ?? []) {
        const row = chunk.find(r => r.hubspot_deal_id === appt.hubspot_deal_id)
        if (row && appt.hubspot_deal_id) row.supabase_appt_id = appt.id
      }

      await db.from('crm_deals').upsert(chunk, { onConflict: 'hubspot_deal_id' })
      dealsUpserted += chunk.length
    }

    // ── Phase 4 : Batch-read des contacts liés aux deals ─────────────────
    currentPhase = 4
    const uniqueContactIds = [...new Set(Object.values(dealToContact))]
    const CONTACT_BATCH = 100

    for (let i = 0; i < uniqueContactIds.length; i += CONTACT_BATCH) {
      const chunk = uniqueContactIds.slice(i, i + CONTACT_BATCH)
      const contacts = await batchGetContacts(chunk, contactPropsToFetch)

      if (contacts.length > 0) {
        const rows = contacts.map(c => buildContactRow(c, now))
        await db.from('crm_contacts').upsert(dedupContactRows(rows), { onConflict: 'hubspot_contact_id' })
        contactsUpserted += rows.length
      }
    }

    // ── Phase 5 : Sync incrémentale (contacts récents sans deal) ─────────
    currentPhase = 5
    const MAX_INCR = fullSync ? 50 : 20
    let incrCursor: string | undefined = undefined
    let incrRounds = 0

    do {
      const { contacts, nextCursor } = await getContactsModifiedSince(contactSince, incrCursor, contactPropsToFetch)

      if (contacts.length > 0) {
        const rows = contacts.map(c => buildContactRow(c, now))
        await db.from('crm_contacts').upsert(dedupContactRows(rows), { onConflict: 'hubspot_contact_id' })
        const newOnes = rows.filter(r => !uniqueContactIds.includes(r.hubspot_contact_id))
        contactsUpserted += newOnes.length
      }

      incrCursor = nextCursor
      incrRounds++
    } while (incrCursor && incrRounds < MAX_INCR)

    // ── Phase 6 : Sync contacts ───────────────────────────────────────────────
    currentPhase = 6

    if (fullSync) {
      // Sync complet : premier chunk de MAX_PAGES_PER_CHUNK pages
      // Le reste est traité par les appels suivants (contact_cursor)
      let allCursor: string | undefined = undefined
      let allRounds = 0
      const buffer: ReturnType<typeof buildContactRow>[] = []

      while (allRounds < MAX_PAGES_PER_CHUNK) {
        const { contacts: batch, nextCursor } = await getAllContactsForSync(allCursor, contactPropsToFetch)

        if (batch.length > 0) {
          buffer.push(...batch.map(c => buildContactRow(c, now)))
        }

        allCursor = nextCursor
        allRounds++

        if (!nextCursor) break
      }

      if (buffer.length > 0) {
        await db.from('crm_contacts').upsert(dedupContactRows(buffer), { onConflict: 'hubspot_contact_id' })
        const newOnes = buffer.filter(r => !uniqueContactIds.includes(r.hubspot_contact_id))
        contactsUpserted += newOnes.length
      }

      // Retourner le curseur pour le prochain chunk
      nextContactCursor = allCursor ?? null

    } else {
      // Sync incrémental : classes prioritaires uniquement
      const PRIORITY_CLASSES_SYNC = ['Terminale', 'Premi\u00e8re', 'Seconde']

      for (const classe of PRIORITY_CLASSES_SYNC) {
        let classCursor: string | undefined = undefined
        let classRounds = 0

        do {
          const { contacts: prioContacts, nextCursor: prioNext } = await getContactsByClass(classe, classCursor, contactPropsToFetch)

          if (prioContacts.length > 0) {
            const rows = prioContacts.map(c => buildContactRow(c, now))
            await db.from('crm_contacts').upsert(dedupContactRows(rows), { onConflict: 'hubspot_contact_id' })
            const newOnes = rows.filter(r => !uniqueContactIds.includes(r.hubspot_contact_id))
            contactsUpserted += newOnes.length
          }

          classCursor = prioNext
          classRounds++
        } while (classCursor && classRounds < 1)
      }
    }

    // ── Phase 7 : Properties metadata + Owners ───────────────────────────
    // Import one-way : on stocke label/groupe/options/type pour que l'UI
    // soit autonome et ne dépende pas de HubSpot au runtime.
    currentPhase = 7
    if (fullSync || force) {
      try {
        const [contactPropsMeta, dealPropsMeta, owners] = await Promise.all([
          getAllPropertiesMeta('contacts'),
          getAllPropertiesMeta('deals'),
          getAllOwners(),
        ])

        const propRows = [
          ...contactPropsMeta.map(p => ({
            object_type:     'contacts',
            name:            p.name,
            label:           p.label ?? null,
            description:     p.description ?? null,
            group_name:      p.groupName ?? null,
            type:            p.type ?? null,
            field_type:      p.fieldType ?? null,
            options:         p.options ?? null,
            hubspot_defined: p.hubspotDefined ?? true,
            archived:        p.archived ?? false,
            display_order:   p.displayOrder ?? null,
            synced_at:       now,
          })),
          ...dealPropsMeta.map(p => ({
            object_type:     'deals',
            name:            p.name,
            label:           p.label ?? null,
            description:     p.description ?? null,
            group_name:      p.groupName ?? null,
            type:            p.type ?? null,
            field_type:      p.fieldType ?? null,
            options:         p.options ?? null,
            hubspot_defined: p.hubspotDefined ?? true,
            archived:        p.archived ?? false,
            display_order:   p.displayOrder ?? null,
            synced_at:       now,
          })),
        ]
        if (propRows.length > 0) {
          await db.from('crm_properties').upsert(propRows, { onConflict: 'object_type,name' })
        }

        if (owners.length > 0) {
          const ownerRows = owners.map(o => ({
            hubspot_owner_id: o.id,
            email:            o.email ?? null,
            firstname:        o.firstName ?? null,
            lastname:         o.lastName ?? null,
            user_id:          o.userId ? String(o.userId) : null,
            archived:         o.archived ?? false,
            teams:            o.teams ?? null,
            synced_at:        now,
          }))
          await db.from('crm_owners').upsert(ownerRows, { onConflict: 'hubspot_owner_id' })
        }
      } catch (e) {
        console.error('[crm-sync] Phase 7 metadata error:', e)
      }
    }

    // ── Phase 8 : Activities + Form submissions ──────────────────────────
    // Pull timeline HubSpot → crm_activities, et formulaires → crm_form_submissions
    // Limité aux contacts récemment modifiés pour tenir en un run.
    currentPhase = 8
    try {
      // On cible les contacts ayant des deals (prioritaires commercialement).
      const targetContactIds = Array.from(new Set(Object.values(dealToContact)))
      // Limite max par run (on traite 200 contacts max par run pour rester sous la limite Vercel)
      const MAX_ACTIVITY_CONTACTS = fullSync ? 500 : 200
      const slice = targetContactIds.slice(0, MAX_ACTIVITY_CONTACTS)

      for (const cid of slice) {
        // Engagements (notes, appels, emails, meetings) — 1 page max par run
        try {
          const { results } = await getContactEngagements(cid)
          if (results.length > 0) {
            const rows = results.map(e => ({
              hubspot_engagement_id: String(e.engagement.id),
              activity_type:         (e.engagement.type || 'NOTE').toLowerCase(),
              hubspot_contact_id:    cid,
              hubspot_deal_id:       e.associations?.dealIds?.[0] ? String(e.associations.dealIds[0]) : null,
              owner_id:              e.engagement.ownerId ? String(e.engagement.ownerId) : null,
              subject:               e.metadata?.subject ?? e.metadata?.title ?? null,
              body:                  e.metadata?.body ?? e.metadata?.text ?? null,
              direction:             e.metadata?.direction ?? null,
              status:                e.metadata?.status ?? null,
              metadata:              e.metadata ?? null,
              occurred_at:           new Date(e.engagement.timestamp || e.engagement.createdAt).toISOString(),
            }))
            await db
              .from('crm_activities')
              .upsert(rows, { onConflict: 'hubspot_engagement_id', ignoreDuplicates: false })
          }
        } catch (e) {
          console.error('[crm-sync] engagements error for', cid, e)
        }

        // Form submissions
        try {
          const subs = await getContactFormSubmissions(cid)
          if (subs.length > 0) {
            const rows = subs.map(s => ({
              hubspot_contact_id: cid,
              form_id:            s['form-id'],
              form_title:         s.title ?? null,
              form_type:          s['form-type'] ?? null,
              page_url:           s['page-url'] ?? null,
              page_title:         null as string | null,
              values:             s.values ?? null,
              submitted_at:       new Date(s.timestamp).toISOString(),
            }))
            await db
              .from('crm_form_submissions')
              .upsert(rows, {
                onConflict: 'hubspot_contact_id,form_id,submitted_at',
                ignoreDuplicates: true,
              })
          }
        } catch (e) {
          console.error('[crm-sync] forms error for', cid, e)
        }
      }
    } catch (e) {
      console.error('[crm-sync] Phase 8 activities/forms error:', e)
    }

  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err)
    errorMessage = `[Phase ${currentPhase}] ${rawMsg}`
    console.error('[crm-sync] Error:', errorMessage)
  }

  const durationMs = Date.now() - startMs

  await db.from('crm_sync_log').insert({
    contacts_upserted: contactsUpserted,
    deals_upserted:    dealsUpserted,
    duration_ms:       durationMs,
    error_message:     errorMessage,
  })

  return NextResponse.json({
    ok:                 !errorMessage,
    contacts_upserted:  contactsUpserted,
    deals_upserted:     dealsUpserted,
    duration_ms:        durationMs,
    error:              errorMessage,
    mode:               fullSync ? 'full' : 'incremental',
    contact_since:      contactSince,
    next_cursor:        nextContactCursor,
    done:               !nextContactCursor,
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Déduplique un batch de contact rows par email (case-insensitive).
 * Si plusieurs contacts ont le même email, on garde le PREMIER (en pratique
 * le plus récent vu que le batch est déjà ordonné par lastmodifieddate desc).
 * Évite que l'upsert crée des doublons côté Supabase (l'email doit être unique).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupContactRows(rows: any[]): any[] {
  const seen = new Set<string>()
  const out: typeof rows = []
  for (const r of rows) {
    if (!r.email) { out.push(r); continue }
    const e = String(r.email).toLowerCase().trim()
    if (seen.has(e)) continue
    seen.add(e)
    out.push(r)
  }
  return out
}

/**
 * HubSpot renvoie recent_conversion_date soit comme Unix ms en string ("1710498600000")
 * soit comme ISO string ("2025-03-15T10:30:00.000Z").
 * parseInt("2025-03-15T...") = 2025 → new Date(2025) = 1970 — on évite ça.
 */
function parseHubSpotDate(raw?: string | null): string | null {
  if (!raw) return null
  const asNum = /^\d+$/.test(raw.trim()) ? Number(raw) : NaN
  const d = !isNaN(asNum) && asNum > 1e10
    ? new Date(asNum)
    : new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDealRow(d: any) {
  return {
    hubspot_deal_id:    d.id,
    hubspot_contact_id: null as string | null,
    dealname:           d.properties.dealname   ?? null,
    dealstage:          d.properties.dealstage  ?? null,
    pipeline:           d.properties.pipeline   ?? null,
    hubspot_owner_id:   d.properties.hubspot_owner_id ?? null,
    teleprospecteur:    d.properties.teleprospecteur  ?? null,
    formation:          d.properties.diploma_sante___formation ?? null,
    closedate:          d.properties.closedate
      ? new Date(d.properties.closedate).toISOString() : null,
    createdate:         d.properties.createdate
      ? new Date(d.properties.createdate).toISOString() : null,
    description:        d.properties.description ?? null,
    supabase_appt_id:   null as string | null,
    synced_at:          new Date().toISOString(),
    // Toutes les propriétés HubSpot brutes (migration future)
    hubspot_raw:        d.properties,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContactRow(c: any, now: string) {
  return {
    hubspot_contact_id:         c.id,
    firstname:                  c.properties.firstname  ?? null,
    lastname:                   c.properties.lastname   ?? null,
    email:                      c.properties.email      ?? null,
    phone:                      c.properties.phone      ?? null,
    departement:                c.properties.departement ?? null,
    classe_actuelle:            c.properties.classe_actuelle ?? null,
    zone_localite:              c.properties.zone___localite ?? null,
    hubspot_owner_id:           c.properties.hubspot_owner_id ?? null,
    contact_createdate:         parseHubSpotDate(c.properties.createdate),
    recent_conversion_date:     parseHubSpotDate(c.properties.recent_conversion_date),
    recent_conversion_event:    c.properties.recent_conversion_event_name ?? null,
    hs_lead_status:             c.properties.hs_lead_status ?? null,
    origine:                    c.properties.origine ?? null,
    formation_demandee:         c.properties.diploma_sante___formation_demandee ?? null,
    formation_souhaitee:        c.properties.formation_souhaitee ?? null,
    synced_at:                  now,
    // Toutes les propriétés HubSpot brutes (migration future)
    hubspot_raw:                c.properties,
  }
}
