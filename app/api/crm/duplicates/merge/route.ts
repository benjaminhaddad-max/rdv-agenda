import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/crm/duplicates/merge
 *
 * Body : { primary_id: string, duplicate_ids: string[] }
 *
 * Action :
 *  1. Re-link tous les FK (crm_deals, crm_tasks, crm_activities,
 *     crm_form_submissions, email_events) des duplicates vers le primary.
 *  2. Merge les valeurs non-vides des duplicates dans le primary
 *     (uniquement si le champ correspondant est vide sur le primary).
 *  3. Supprime les contacts duplicates.
 */

const RELINK_TABLES: Array<{ table: string; column: string }> = [
  { table: 'crm_deals',            column: 'hubspot_contact_id' },
  { table: 'crm_tasks',            column: 'hubspot_contact_id' },
  { table: 'crm_activities',       column: 'hubspot_contact_id' },
  { table: 'crm_form_submissions', column: 'hubspot_contact_id' },
]

const MERGE_FIELDS = [
  'firstname', 'lastname', 'email', 'phone',
  'classe_actuelle', 'departement', 'zone_localite',
  'formation_souhaitee', 'formation_demandee',
  'hs_lead_status', 'origine', 'hubspot_owner_id',
]

export async function POST(req: NextRequest) {
  const db = createServiceClient()

  let body: { primary_id?: string; duplicate_ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const primaryId = body.primary_id
  const dupIds = (body.duplicate_ids || []).filter(id => id && id !== primaryId)

  if (!primaryId) return NextResponse.json({ error: 'primary_id manquant' }, { status: 400 })
  if (dupIds.length === 0) return NextResponse.json({ error: 'Aucun doublon à fusionner' }, { status: 400 })
  if (dupIds.length > 20) return NextResponse.json({ error: 'Maximum 20 doublons par merge' }, { status: 400 })

  // 1. Charge le primary + les duplicates
  const allIds = [primaryId, ...dupIds]
  const { data: contacts, error: cErr } = await db
    .from('crm_contacts')
    .select('*')
    .in('hubspot_contact_id', allIds)

  if (cErr || !contacts) {
    return NextResponse.json({ error: 'Erreur chargement contacts' }, { status: 500 })
  }

  const primary = contacts.find(c => c.hubspot_contact_id === primaryId)
  const dupes = contacts.filter(c => dupIds.includes(c.hubspot_contact_id))

  if (!primary) {
    return NextResponse.json({ error: 'Primary contact introuvable' }, { status: 404 })
  }

  // 2. Merge des valeurs : pour chaque champ vide sur primary, prend la première valeur non-vide d'un duplicate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  for (const field of MERGE_FIELDS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (primary as any)[field]
    if (cur !== null && cur !== undefined && String(cur).trim() !== '') continue
    for (const d of dupes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (d as any)[field]
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        updates[field] = v
        break
      }
    }
  }
  // recent_conversion_date / contact_createdate : prend la plus récente / ancienne
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = [primary, ...dupes] as any[]
  const allRecentDates = allRows.map(r => r.recent_conversion_date).filter(Boolean)
  const allCreateDates = allRows.map(r => r.contact_createdate).filter(Boolean)
  if (allRecentDates.length > 0) {
    const newest = allRecentDates.sort().reverse()[0]
    if (newest && (!primary.recent_conversion_date || newest > primary.recent_conversion_date)) {
      updates.recent_conversion_date = newest
    }
  }
  if (allCreateDates.length > 0) {
    const oldest = allCreateDates.sort()[0]
    if (oldest && (!primary.contact_createdate || oldest < primary.contact_createdate)) {
      updates.contact_createdate = oldest
    }
  }
  updates.synced_at = new Date().toISOString()

  if (Object.keys(updates).length > 1) {
    const { error: upErr } = await db
      .from('crm_contacts')
      .update(updates)
      .eq('hubspot_contact_id', primaryId)
    if (upErr) {
      return NextResponse.json({ error: 'Erreur mise à jour primary: ' + upErr.message }, { status: 500 })
    }
  }

  // 3. Re-link les FK des duplicates vers le primary
  let relinked = 0
  for (const t of RELINK_TABLES) {
    for (const dupId of dupIds) {
      const { error: relErr, count } = await db
        .from(t.table)
        .update({ [t.column]: primaryId } as Record<string, string>, { count: 'exact' })
        .eq(t.column, dupId)
      if (!relErr && count) relinked += count
    }
  }

  // email_events : table peut ne pas exister, best-effort
  if (primary.email) {
    for (const d of dupes) {
      if (d.email && d.email !== primary.email) {
        try {
          await db.from('email_events').update({ email: primary.email }).eq('email', d.email)
        } catch { /* ignore */ }
      }
    }
  }

  // 4. Supprime les contacts duplicates
  const { error: delErr, count: deleted } = await db
    .from('crm_contacts')
    .delete({ count: 'exact' })
    .in('hubspot_contact_id', dupIds)

  if (delErr) {
    return NextResponse.json({ error: 'Erreur suppression doublons: ' + delErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    primary_id: primaryId,
    deleted_count: deleted ?? 0,
    relinked_records: relinked,
    merged_fields: Object.keys(updates).filter(k => k !== 'synced_at'),
  })
}
