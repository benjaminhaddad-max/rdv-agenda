import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/duplicates?type=email|phone|name
 *
 * Renvoie les groupes de doublons trouvés dans crm_contacts :
 *  - email   : même email (case-insensitive)
 *  - phone   : même téléphone (après normalisation +33 → 0)
 *  - name    : même prénom + nom (case-insensitive, accents retirés)
 *
 * Réponse : Array<{ key, contacts: Contact[] }>
 */

interface ContactRow {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  contact_createdate: string | null
  recent_conversion_date: string | null
  hubspot_owner_id: string | null
  classe_actuelle: string | null
  zone_localite: string | null
  origine: string | null
  hs_lead_status: string | null
}

const FIELDS = 'hubspot_contact_id, firstname, lastname, email, phone, contact_createdate, recent_conversion_date, hubspot_owner_id, classe_actuelle, zone_localite, origine, hs_lead_status'

function normalizePhone(p: string): string {
  let v = p.replace(/[\s\-.()]/g, '')
  if (v.startsWith('+33')) v = '0' + v.slice(3)
  if (v.startsWith('0033')) v = '0' + v.slice(4)
  return v
}

function normalizeName(fn: string | null, ln: string | null): string {
  return `${fn || ''} ${ln || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl
  const type = (searchParams.get('type') || 'phone_name') as 'email' | 'phone' | 'name' | 'phone_name'
  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000)

  // 1. Identifie les valeurs apparaissant plus d'une fois via RPC dédiée
  let groupValues: Array<{ key: string; count: number }> = []

  if (type === 'email') {
    const { data } = await db.rpc('crm_duplicate_emails', { lim: limit })
    groupValues = (data ?? []) as Array<{ key: string; count: number }>
  } else if (type === 'phone') {
    const { data } = await db.rpc('crm_duplicate_phones', { lim: limit })
    groupValues = (data ?? []) as Array<{ key: string; count: number }>
  } else if (type === 'name') {
    const { data } = await db.rpc('crm_duplicate_names', { lim: limit })
    groupValues = (data ?? []) as Array<{ key: string; count: number }>
  } else {
    // phone_name : "vrais doublons" (même téléphone ET même nom)
    const { data } = await db.rpc('crm_duplicate_phone_and_name', { lim: limit })
    groupValues = (data ?? []) as Array<{ key: string; count: number }>
  }

  if (groupValues.length === 0) {
    return NextResponse.json({ groups: [], type })
  }

  // 2. Charge les contacts pour chaque groupe
  const groups: Array<{ key: string; contacts: ContactRow[] }> = []

  for (const g of groupValues) {
    let contacts: ContactRow[] = []
    if (type === 'email') {
      const { data } = await db
        .from('crm_contacts')
        .select(FIELDS)
        .ilike('email', g.key)
      contacts = (data ?? []) as ContactRow[]
    } else if (type === 'phone') {
      // g.key est déjà normalisé, mais on peut chercher les variantes
      const { data } = await db
        .from('crm_contacts')
        .select(FIELDS)
        .or(`phone.eq.${g.key},phone.eq.+33${g.key.slice(1)}`)
      contacts = ((data ?? []) as ContactRow[]).filter(c => normalizePhone(c.phone || '') === g.key)
    } else if (type === 'name') {
      // name search : on doit re-filtrer côté JS
      const [firstname, ...rest] = g.key.split(' ')
      const lastname = rest.join(' ')
      const { data } = await db
        .from('crm_contacts')
        .select(FIELDS)
        .ilike('firstname', firstname)
        .ilike('lastname', lastname)
      contacts = ((data ?? []) as ContactRow[]).filter(c => normalizeName(c.firstname, c.lastname) === g.key)
    } else {
      // phone_name : key = "phone|fullname" → on cherche par téléphone PUIS filtre par nom
      const [normPhone, fullName] = g.key.split('|')
      const { data } = await db
        .from('crm_contacts')
        .select(FIELDS)
        .or(`phone.eq.${normPhone},phone.eq.+33${normPhone.slice(1)}`)
      contacts = ((data ?? []) as ContactRow[]).filter(c =>
        normalizePhone(c.phone || '') === normPhone &&
        normalizeName(c.firstname, c.lastname) === fullName
      )
    }

    if (contacts.length > 1) {
      groups.push({ key: g.key, contacts })
    }
  }

  return NextResponse.json({ groups, type, total: groups.length })
}
