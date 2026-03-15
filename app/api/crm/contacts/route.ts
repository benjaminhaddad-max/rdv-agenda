import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/crm/contacts
// Retourne les contacts + leur deal associé (depuis Supabase)
// Paramètres : search, stage, closer_hs_id, telepro_hs_id, formation, page, limit
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl

  const search       = searchParams.get('search') ?? ''
  const stage        = searchParams.get('stage') ?? ''
  const closerHsId   = searchParams.get('closer_hs_id') ?? ''
  const teleproHsId  = searchParams.get('telepro_hs_id') ?? ''
  const formation    = searchParams.get('formation') ?? ''
  const page         = parseInt(searchParams.get('page') ?? '0', 10)
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const offset       = page * limit

  // Construire la requête Supabase avec JOIN contacts + deals
  // On utilise une vue via select imbriqué
  let query = db
    .from('crm_contacts')
    .select(`
      hubspot_contact_id, firstname, lastname, email, phone,
      departement, classe_actuelle, zone_localite,
      hubspot_owner_id, recent_conversion_date, recent_conversion_event,
      crm_deals (
        hubspot_deal_id, dealstage, pipeline, formation,
        hubspot_owner_id, teleprospecteur, closedate, createdate,
        supabase_appt_id
      )
    `, { count: 'exact' })

  // Filtres
  if (search) {
    query = query.or(
      `firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  // Pagination
  query = query.range(offset, offset + limit - 1)
  query = query.order('recent_conversion_date', { ascending: false, nullsFirst: false })

  const { data: contacts, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Charger les rdv_users pour enrichir avec les noms des closers/télépros
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, hubspot_user_id, role, avatar_color')

  const userByOwnerId: Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  const userByUserId: Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  for (const u of users ?? []) {
    if (u.hubspot_owner_id) userByOwnerId[u.hubspot_owner_id] = u
    if (u.hubspot_user_id) userByUserId[u.hubspot_user_id] = u
  }

  // Filtrage côté serveur sur stage/closer/telepro/formation
  // (filtrage SQL sur la table liée n'est pas encore supporté directement par Supabase JS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (contacts ?? []) as any[]

  if (stage || closerHsId || teleproHsId || formation) {
    rows = rows.filter(c => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deal = (c.crm_deals as any[])?.[0]
      if (!deal) return false
      if (stage && deal.dealstage !== stage) return false
      if (closerHsId && deal.hubspot_owner_id !== closerHsId) return false
      if (teleproHsId && deal.teleprospecteur !== teleproHsId) return false
      if (formation && deal.formation !== formation) return false
      return true
    })
  }

  // Enrichir avec les noms
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = rows.map((c: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (c.crm_deals as any[])?.[0] ?? null
    const closer = deal?.hubspot_owner_id ? userByOwnerId[deal.hubspot_owner_id] ?? null : null
    const telepro = deal?.teleprospecteur ? userByUserId[deal.teleprospecteur] ?? null : null
    const contactOwner = c.hubspot_owner_id ? userByOwnerId[c.hubspot_owner_id] ?? null : null

    return {
      hubspot_contact_id: c.hubspot_contact_id,
      firstname: c.firstname,
      lastname: c.lastname,
      email: c.email,
      phone: c.phone,
      departement: c.departement,
      classe_actuelle: c.classe_actuelle,
      zone_localite: c.zone_localite,
      hubspot_owner_id: c.hubspot_owner_id,
      recent_conversion_date: c.recent_conversion_date,
      recent_conversion_event: c.recent_conversion_event,
      contact_owner: contactOwner,
      deal: deal ? {
        hubspot_deal_id: deal.hubspot_deal_id,
        dealstage: deal.dealstage,
        formation: deal.formation,
        closedate: deal.closedate,
        createdate: deal.createdate,
        supabase_appt_id: deal.supabase_appt_id,
        hubspot_owner_id: deal.hubspot_owner_id,
        teleprospecteur: deal.teleprospecteur,
        closer,
        telepro,
      } : null,
    }
  })

  return NextResponse.json({
    data: enriched,
    total: count ?? enriched.length,
    page,
    limit,
  })
}
