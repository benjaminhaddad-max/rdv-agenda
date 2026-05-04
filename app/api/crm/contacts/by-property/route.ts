import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/by-property?prop=NAME&op=is&value=X&page=0&limit=50&storage=column|hubspot_raw
 *
 * Recherche de contacts sur n'importe quelle propriété (parmi les 829).
 * - storage=column      : la prop est stockée dans une colonne dédiée
 * - storage=hubspot_raw : la prop est dans hubspot_raw JSONB (par défaut pour les non-mappées)
 *
 * Operators : is | is_not | contains | is_empty | is_not_empty
 */

const VALID_OPS = new Set(['is', 'is_not', 'contains', 'is_empty', 'is_not_empty'])

// Liste des colonnes connues stockées en colonnes dédiées sur crm_contacts
const KNOWN_COLUMNS = new Set([
  'hubspot_contact_id', 'firstname', 'lastname', 'email', 'phone',
  'hubspot_owner_id', 'classe_actuelle', 'formation_souhaitee', 'formation_demandee',
  'departement', 'zone_localite', 'origine', 'hs_lead_status',
  'recent_conversion_date', 'recent_conversion_event', 'contact_createdate',
  'synced_at',
])

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const prop = sp.get('prop') || ''
  const op = sp.get('op') || 'is'
  const value = sp.get('value') || ''
  const page = Math.max(0, parseInt(sp.get('page') || '0', 10))
  const limit = Math.min(200, Math.max(10, parseInt(sp.get('limit') || '50', 10)))
  let storage = sp.get('storage') as 'column' | 'hubspot_raw' | null

  if (!prop || !/^[a-zA-Z0-9_]+$/.test(prop)) {
    return NextResponse.json({ error: 'Propriété invalide' }, { status: 400 })
  }
  if (!VALID_OPS.has(op)) {
    return NextResponse.json({ error: `Opérateur invalide. Autorisés : ${[...VALID_OPS].join(', ')}` }, { status: 400 })
  }
  if (!storage) storage = KNOWN_COLUMNS.has(prop) ? 'column' : 'hubspot_raw'

  const db = createServiceClient()
  const offset = page * limit

  const fnName = storage === 'column' ? 'crm_search_contacts_by_column' : 'crm_search_contacts_by_jsonb'
  const argName = storage === 'column' ? 'p_column' : 'p_property'

  const { data, error } = await db.rpc(fnName, {
    [argName]: prop,
    p_operator: op,
    p_value: value,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    return NextResponse.json({ error: error.message, hint: 'La migration v24 est-elle appliquée ?' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as Array<any>) || []
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0

  return NextResponse.json({
    data: rows.map(r => ({
      hubspot_contact_id: r.hubspot_contact_id,
      firstname: r.firstname,
      lastname: r.lastname,
      email: r.email,
      phone: r.phone,
      classe_actuelle: r.classe_actuelle,
      formation_souhaitee: r.formation_souhaitee,
      recent_conversion_date: r.recent_conversion_date,
      matched_value: r.matched_value,
    })),
    total,
    page,
    limit,
    storage,
  })
}
