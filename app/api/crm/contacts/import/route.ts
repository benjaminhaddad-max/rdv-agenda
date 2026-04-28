import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/crm/contacts/import
 *
 * Import en masse de contacts (depuis CSV transformé en JSON côté UI).
 * Body :
 *   {
 *     rows: Array<Record<string, string>>,   // chaque row = 1 contact
 *     options: {
 *       default_origine?: string,             // ex "Salon X" (mis si pas dans la row)
 *       default_owner_id?: string,            // hubspot_owner_id à attribuer
 *       skip_duplicates?: boolean,            // true = ignore si email déjà existant ; false = update
 *       dry_run?: boolean,                    // true = ne touche pas la DB, retourne juste les stats
 *     }
 *   }
 *
 * Réponse :
 *   { total, created, updated, skipped, errors: [{row_index, email, error}] }
 *
 * Le trigger DB v13 normalise dept + calcule zone_localite automatiquement.
 */

const ALLOWED_FIELDS = new Set([
  'firstname', 'lastname', 'email', 'phone',
  'classe_actuelle', 'departement', 'zone_localite',
  'formation_souhaitee', 'formation_demandee',
  'hs_lead_status', 'origine',
  'hubspot_owner_id',
])

const MAX_ROWS = 5000

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  let body: { rows?: Array<Record<string, string>>; options?: Record<string, unknown> }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  const opts = body.options || {}

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne à importer' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ROWS} lignes par import (reçu ${rows.length})` },
      { status: 400 }
    )
  }

  const defaultOrigine: string | undefined = typeof opts.default_origine === 'string' ? opts.default_origine : undefined
  const defaultOwnerId: string | undefined = typeof opts.default_owner_id === 'string' ? opts.default_owner_id : undefined
  const skipDuplicates: boolean = opts.skip_duplicates === true
  const dryRun: boolean = opts.dry_run === true

  const stats = { total: rows.length, created: 0, updated: 0, skipped: 0 }
  const errors: Array<{ row_index: number; email?: string; error: string }> = []

  // Pré-charge les emails existants en 1 query (efficace pour 5000 rows)
  const incomingEmails = rows
    .map(r => (r.email || '').toString().toLowerCase().trim())
    .filter(Boolean)
  const incomingPhones = rows
    .map(r => (r.phone || '').toString().replace(/\s+/g, ''))
    .filter(Boolean)

  let existingByEmail = new Map<string, string>()
  let existingByPhone = new Map<string, string>()

  if (incomingEmails.length > 0) {
    // Batch en chunks de 1000 pour éviter URL trop longue
    for (let i = 0; i < incomingEmails.length; i += 1000) {
      const chunk = incomingEmails.slice(i, i + 1000)
      const { data } = await db.from('crm_contacts')
        .select('hubspot_contact_id, email')
        .in('email', chunk)
      for (const c of data ?? []) {
        if (c.email) existingByEmail.set(String(c.email).toLowerCase(), c.hubspot_contact_id)
      }
    }
  }
  if (incomingPhones.length > 0) {
    for (let i = 0; i < incomingPhones.length; i += 1000) {
      const chunk = incomingPhones.slice(i, i + 1000)
      const { data } = await db.from('crm_contacts')
        .select('hubspot_contact_id, phone')
        .in('phone', chunk)
      for (const c of data ?? []) {
        if (c.phone) existingByPhone.set(String(c.phone), c.hubspot_contact_id)
      }
    }
  }

  // Prépare les inserts et updates
  const toInsert: Array<Record<string, unknown>> = []
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = []

  const nowIso = new Date().toISOString()

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const email = (r.email || '').toString().toLowerCase().trim()
    const phone = (r.phone || '').toString().replace(/\s+/g, '')

    if (!email && !phone) {
      errors.push({ row_index: i, error: 'Pas d\'email ni de téléphone' })
      continue
    }

    // Construit l'objet à stocker (n'inclut que les champs autorisés)
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (!ALLOWED_FIELDS.has(k)) continue
      const val = (v ?? '').toString().trim()
      if (val !== '') data[k] = val
    }

    // Email/phone toujours présents si fournis
    if (email) data.email = email
    if (phone) data.phone = phone

    // Defaults
    if (!data.origine && defaultOrigine) data.origine = defaultOrigine
    if (!data.hubspot_owner_id && defaultOwnerId) data.hubspot_owner_id = defaultOwnerId

    // Métadonnées sync
    data.synced_at = nowIso

    // Détection doublon
    const existingId = (email && existingByEmail.get(email)) || (phone && existingByPhone.get(phone)) || null

    if (existingId) {
      if (skipDuplicates) {
        stats.skipped++
        continue
      }
      toUpdate.push({ id: existingId, data })
    } else {
      data.hubspot_contact_id = 'NATIVE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + i
      data.contact_createdate = nowIso
      if (!data.origine) data.origine = 'Import CSV'
      toInsert.push(data)
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      total: stats.total,
      to_create: toInsert.length,
      to_update: toUpdate.length,
      to_skip: stats.skipped,
      errors,
    })
  }

  // Exécution réelle
  // ── Inserts par chunks de 500 (limite Supabase pour éviter timeout / payload trop gros)
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error: insertErr } = await db.from('crm_contacts').insert(chunk)
    if (insertErr) {
      errors.push({ row_index: -1, error: `Insert chunk ${i}-${i + chunk.length}: ${insertErr.message}` })
    } else {
      stats.created += chunk.length
    }
  }

  // ── Updates ligne par ligne (pas de bulk update natif Supabase qui marche bien avec PK différente)
  for (const u of toUpdate) {
    const { error: updErr } = await db.from('crm_contacts')
      .update(u.data)
      .eq('hubspot_contact_id', u.id)
    if (updErr) {
      errors.push({ row_index: -1, email: String(u.data.email || ''), error: updErr.message })
    } else {
      stats.updated++
    }
  }

  return NextResponse.json({
    total: stats.total,
    created: stats.created,
    updated: stats.updated,
    skipped: stats.skipped,
    errors: errors.slice(0, 50), // évite payload trop gros
    error_count: errors.length,
  })
}
