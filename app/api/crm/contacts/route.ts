import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/crm/contacts
// Retourne les contacts + leur deal associé (depuis Supabase)
//
// Paramètres :
//   search           — recherche nom / email / téléphone
//   stage            — filtre étape deal
//   closer_hs_id     — filtre closer deal (hubspot_owner_id du deal)
//   telepro_hs_id    — filtre télépro deal
//   formation        — filtre formation
//   no_telepro=1     — uniquement leads sans télépro assigné
//   with_telepro=1   — uniquement leads avec télépro assigné
//   owner_exclude    — exclure contacts avec ce hubspot_owner_id (contact owner)
//   owner_include    — uniquement contacts avec ce hubspot_owner_id (contact owner)
//   recent_form_months=N — uniquement contacts avec recent_conversion_date dans les N derniers mois
//   page / limit     — pagination (appliquée après tous les filtres)
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl

  const search           = searchParams.get('search') ?? ''
  const stage            = searchParams.get('stage') ?? ''
  const closerHsId       = searchParams.get('closer_hs_id') ?? ''
  const teleproHsId      = searchParams.get('telepro_hs_id') ?? ''
  const formation        = searchParams.get('formation') ?? ''
  const noTelepro        = searchParams.get('no_telepro') === '1'
  const withTelepro      = searchParams.get('with_telepro') === '1'
  const ownerExclude     = searchParams.get('owner_exclude') ?? ''
  const ownerInclude     = searchParams.get('owner_include') ?? ''
  const recentFormMonths = parseInt(searchParams.get('recent_form_months') ?? '0', 10)
  const page             = parseInt(searchParams.get('page') ?? '0', 10)
  const limit            = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  // ── 1. Requête Supabase avec filtres SQL (sur crm_contacts) ────────────────
  // On ramène jusqu'à 2000 contacts (couvre les pipelines actuels).
  // Les filtres liés aux deals sont appliqués en JS (limitation Supabase JS).
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
    `)
    .order('recent_conversion_date', { ascending: false, nullsFirst: false })
    .limit(2000)

  // Recherche textuelle (SQL)
  if (search) {
    query = query.or(
      `firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  // Exclure un propriétaire de contact spécifique (ex. Benjamin Delacour)
  // NULL inclus volontairement (pas de propriétaire = doit être attribué)
  if (ownerExclude) {
    query = query.or(`hubspot_owner_id.is.null,hubspot_owner_id.neq.${ownerExclude}`)
  }

  // N'inclure qu'un propriétaire de contact spécifique
  if (ownerInclude) {
    query = query.eq('hubspot_owner_id', ownerInclude)
  }

  // Formulaires récents (recent_conversion_date dans les N derniers mois)
  if (recentFormMonths > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - recentFormMonths)
    query = query.gte('recent_conversion_date', since.toISOString())
  }

  const { data: contacts, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 2. Charger rdv_users pour enrichissement ──────────────────────────────
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, hubspot_user_id, role, avatar_color')

  const userByOwnerId: Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  const userByUserId:  Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  for (const u of users ?? []) {
    if (u.hubspot_owner_id) userByOwnerId[u.hubspot_owner_id] = u
    if (u.hubspot_user_id)  userByUserId[u.hubspot_user_id]  = u
  }

  // ── 3. Filtrage JS (filtres liés aux deals) ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (contacts ?? []) as any[]

  if (stage || closerHsId || teleproHsId || formation || noTelepro || withTelepro) {
    rows = rows.filter(c => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deal = (c.crm_deals as any[])?.[0]

      // Filtre "sans télépro" (vue "À attribuer")
      if (noTelepro && deal?.teleprospecteur) return false

      // Filtre "avec télépro"
      if (withTelepro && !deal?.teleprospecteur) return false

      // Filtres deal — n'exclure que si le filtre est actif
      if (stage     && (!deal || deal.dealstage         !== stage))     return false
      if (closerHsId  && (!deal || deal.hubspot_owner_id !== closerHsId))  return false
      if (teleproHsId && (!deal || deal.teleprospecteur  !== teleproHsId)) return false
      if (formation   && (!deal || deal.formation        !== formation))    return false

      return true
    })
  }

  // ── 4. Total filtré + pagination JS ──────────────────────────────────────
  const totalFiltered = rows.length
  const offset = page * limit
  const paginatedRows = rows.slice(offset, offset + limit)

  // ── 5. Enrichissement avec noms des closers/télépros ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = paginatedRows.map((c: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (c.crm_deals as any[])?.[0] ?? null
    const closer       = deal?.hubspot_owner_id  ? userByOwnerId[deal.hubspot_owner_id]  ?? null : null
    const telepro      = deal?.teleprospecteur   ? userByUserId[deal.teleprospecteur]    ?? null : null
    const contactOwner = c.hubspot_owner_id      ? userByOwnerId[c.hubspot_owner_id]     ?? null : null

    return {
      hubspot_contact_id:      c.hubspot_contact_id,
      firstname:               c.firstname,
      lastname:                c.lastname,
      email:                   c.email,
      phone:                   c.phone,
      departement:             c.departement,
      classe_actuelle:         c.classe_actuelle,
      zone_localite:           c.zone_localite,
      hubspot_owner_id:        c.hubspot_owner_id,
      recent_conversion_date:  c.recent_conversion_date,
      recent_conversion_event: c.recent_conversion_event,
      contact_owner:           contactOwner,
      deal: deal ? {
        hubspot_deal_id:  deal.hubspot_deal_id,
        dealstage:        deal.dealstage,
        formation:        deal.formation,
        closedate:        deal.closedate,
        createdate:       deal.createdate,
        supabase_appt_id: deal.supabase_appt_id,
        hubspot_owner_id: deal.hubspot_owner_id,
        teleprospecteur:  deal.teleprospecteur,
        closer,
        telepro,
      } : null,
    }
  })

  return NextResponse.json({
    data: enriched,
    total: totalFiltered,
    page,
    limit,
  })
}
