import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/properties?object=contacts|deals&search=&limit=
 *   Liste les propriétés
 *
 * POST /api/crm/properties
 *   { object_type, name, label, type, field_type, group_name?, options?, description? }
 *   Crée une nouvelle propriété custom
 */

const VALID_OBJECTS = new Set(['contacts', 'deals', 'tickets', 'companies'])
const VALID_TYPES = new Set(['string', 'number', 'date', 'datetime', 'enumeration', 'bool', 'phone_number'])
const VALID_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'date', 'datetime', 'select', 'radio', 'checkbox', 'booleancheckbox', 'phonenumber', 'calculation_equation'])

export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl
  const objectType = searchParams.get('object') || 'contacts'
  const search = (searchParams.get('search') || '').toLowerCase().trim()
  const limit = Math.min(parseInt(searchParams.get('limit') || '1000', 10), 5000)
  const includeArchived = searchParams.get('include_archived') === '1'

  let query = db
    .from('crm_properties')
    .select('name, label, description, group_name, type, field_type, options, display_order, archived, object_type, hubspot_defined')
    .eq('object_type', objectType)
    .order('group_name', { ascending: true, nullsFirst: false })
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true })
    .limit(limit)

  if (!includeArchived) query = query.eq('archived', false)
  if (search) {
    query = query.or(`name.ilike.%${search}%,label.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ properties: data ?? [], total: data?.length ?? 0 })
}

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const objectType = String(body.object_type || 'contacts')
  const name = String(body.name || '').trim()
  const label = String(body.label || '').trim()
  const type = String(body.type || 'string')
  const fieldType = String(body.field_type || 'text')
  const groupName = body.group_name ? String(body.group_name) : 'custom'
  const description = body.description ? String(body.description) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = Array.isArray(body.options) ? (body.options as any[]) : null

  if (!VALID_OBJECTS.has(objectType)) {
    return NextResponse.json({ error: 'object_type invalide' }, { status: 400 })
  }
  if (!name) return NextResponse.json({ error: 'name manquant' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'label manquant' }, { status: 400 })
  if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'type invalide' }, { status: 400 })
  if (!VALID_FIELD_TYPES.has(fieldType)) return NextResponse.json({ error: 'field_type invalide' }, { status: 400 })

  // name doit être en snake_case ASCII
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return NextResponse.json({
      error: 'name doit être en snake_case (lettres minuscules, chiffres, underscores) — ex: ma_propriete_custom',
    }, { status: 400 })
  }

  // Check unicité
  const { data: existing } = await db
    .from('crm_properties')
    .select('name')
    .eq('object_type', objectType)
    .eq('name', name)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Une propriété avec ce nom existe déjà' }, { status: 409 })
  }

  // Insert
  const { data, error } = await db
    .from('crm_properties')
    .insert({
      object_type: objectType,
      name,
      label,
      description,
      type,
      field_type: fieldType,
      group_name: groupName,
      options: options ? options : null,
      archived: false,
      hubspot_defined: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, property: data })
}
