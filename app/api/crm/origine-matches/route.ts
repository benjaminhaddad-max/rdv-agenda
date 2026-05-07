import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { updateContact } from '@/lib/hubspot'

/**
 * GET /api/crm/origine-matches
 *
 * Cherche les contacts SANS origine qui correspondent à des contacts AVEC
 * origine, via téléphone OU prénom+nom. Sert à récupérer l'origine d'un lead
 * quand il s'est ré-inscrit avec un email différent (mail parent / 2e mail).
 *
 * Réponse :
 *   {
 *     matches: [
 *       {
 *         contact: { hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate },
 *         candidates: [
 *           { hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate, match_type: 'phone'|'name' }
 *         ]
 *       }
 *     ],
 *     total_unknown: number,
 *     processed: number
 *   }
 */
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 200)
  // Filtre par défaut : on cible les pré-inscrits 2026/2027 sans origine
  // (les seuls qui comptent pour les stats fournisseur de leads).
  const leadStatus = req.nextUrl.searchParams.get('lead_status') ?? 'Pré-inscrit 2026/2027'
  const db = createServiceClient()

  // Helper : nettoie un téléphone → uniquement les chiffres (10+ chars utiles)
  const cleanPhone = (p: string | null | undefined): string | null => {
    if (!p) return null
    const digits = p.replace(/\D/g, '')
    // Normalise +33 6xx → 06xx pour matching
    if (digits.startsWith('33') && digits.length === 11) return '0' + digits.slice(2)
    if (digits.length >= 9) return digits.slice(-10) // garde les 10 derniers
    return null
  }

  // 1. Total des contacts cibles (sans origine + bon statut lead)
  let countQuery = db
    .from('crm_contacts')
    .select('hubspot_contact_id', { count: 'exact', head: true })
    .or('origine.is.null,origine.eq.,origine.eq.Autre,origine.eq.Inconnu')
  if (leadStatus) countQuery = countQuery.eq('hs_lead_status', leadStatus)
  const { count: totalUnknown } = await countQuery

  // 2. Charge les contacts cibles (limit pour rester perf)
  let unknownsQuery = db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate, hs_lead_status')
    .or('origine.is.null,origine.eq.,origine.eq.Autre,origine.eq.Inconnu')
    .order('contact_createdate', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (leadStatus) unknownsQuery = unknownsQuery.eq('hs_lead_status', leadStatus)
  const { data: unknowns, error: errU } = await unknownsQuery

  if (errU) return NextResponse.json({ error: errU.message }, { status: 500 })
  if (!unknowns || unknowns.length === 0) {
    return NextResponse.json({ matches: [], total_unknown: 0, processed: 0 })
  }

  // Helper : cherche dans hubspot_raw les noms de propriétés possibles pour
  // le responsable légal 1 (HubSpot peut utiliser plusieurs naming conventions).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getResponsableLegal = (raw: any): { prenom: string | null; nom: string | null } => {
    if (!raw || typeof raw !== 'object') return { prenom: null, nom: null }
    const prenom =
      raw.prenom_du_responsable_legal_1 ||
      raw.prenom_responsable_legal_1 ||
      raw.prenom_parent ||
      raw.prenom_parent_1 ||
      null
    const nom =
      raw.nom_du_responsable_legal_1 ||
      raw.nom_responsable_legal_1 ||
      raw.nom_parent ||
      raw.nom_parent_1 ||
      null
    return { prenom, nom }
  }

  // 3. Pour chaque contact sans origine, cherche un candidat avec origine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: any[] = []
  for (const u of unknowns) {
    const cleanedPhone = cleanPhone(u.phone)
    const fname = u.firstname?.trim().toLowerCase()
    const lname = u.lastname?.trim().toLowerCase()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: any[] = []

    // a) Match par téléphone — le plus fiable
    if (cleanedPhone) {
      const { data: phoneMatches } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate, hubspot_raw')
        .neq('hubspot_contact_id', u.hubspot_contact_id)
        .not('origine', 'is', null)
        .not('origine', 'in', '(,Autre,Inconnu)')
        .ilike('phone', `%${cleanedPhone.slice(-9)}%`)
        .limit(5)
      for (const p of phoneMatches ?? []) {
        if (cleanPhone(p.phone) === cleanedPhone) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { hubspot_raw, ...rest } = p
          candidates.push({ ...rest, match_type: 'phone' })
        }
      }
    }

    // b) Match par prénom + nom direct (étudiant ↔ étudiant)
    if (candidates.length === 0 && fname && lname && fname.length > 1 && lname.length > 1) {
      const { data: nameMatches } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate, hubspot_raw')
        .neq('hubspot_contact_id', u.hubspot_contact_id)
        .not('origine', 'is', null)
        .not('origine', 'in', '(,Autre,Inconnu)')
        .ilike('firstname', fname)
        .ilike('lastname', lname)
        .limit(5)
      for (const p of nameMatches ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hubspot_raw, ...rest } = p
        candidates.push({ ...rest, match_type: 'name' })
      }
    }

    // c) Match via Responsable Légal 1 — le contact "sans origine" est peut-être
    //    en réalité le PARENT d'un pré-inscrit qui a son origine renseignée.
    //    On cherche les pré-inscrits dont le responsable_legal_1 = (firstname, lastname) du contact.
    if (candidates.length === 0 && fname && lname && fname.length > 1 && lname.length > 1) {
      // hubspot_raw est un JSONB — on filtre via ->> et ilike
      // (perf : index GIN existe sur hubspot_raw)
      const { data: rlMatches } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate, hubspot_raw')
        .neq('hubspot_contact_id', u.hubspot_contact_id)
        .not('origine', 'is', null)
        .not('origine', 'in', '(,Autre,Inconnu)')
        // Construit un OR sur les variantes possibles de noms de propriétés
        .or([
          `hubspot_raw->>prenom_du_responsable_legal_1.ilike.${fname}`,
          `hubspot_raw->>prenom_responsable_legal_1.ilike.${fname}`,
          `hubspot_raw->>prenom_parent.ilike.${fname}`,
        ].join(','))
        .limit(10)
      for (const p of rlMatches ?? []) {
        const rl = getResponsableLegal(p.hubspot_raw)
        if (
          rl.prenom?.trim().toLowerCase() === fname &&
          rl.nom?.trim().toLowerCase() === lname
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { hubspot_raw, ...rest } = p
          candidates.push({
            ...rest,
            match_type: 'responsable_legal',
            responsable_legal: rl,
          })
        }
      }
    }

    if (candidates.length > 0) {
      matches.push({ contact: u, candidates })
    }
  }

  return NextResponse.json({
    matches,
    total_unknown: totalUnknown ?? 0,
    processed: unknowns.length,
  })
}

/**
 * POST /api/crm/origine-matches
 * Body : { contact_id: string, origine: string }
 *
 * Met à jour l'origine du contact (Supabase + HubSpot best-effort).
 */
export async function POST(req: NextRequest) {
  const { contact_id, origine } = await req.json()
  if (!contact_id || !origine) {
    return NextResponse.json({ error: 'contact_id et origine requis' }, { status: 400 })
  }
  const db = createServiceClient()

  const { error } = await db
    .from('crm_contacts')
    .update({ origine, synced_at: new Date().toISOString() })
    .eq('hubspot_contact_id', contact_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort : pousse aussi dans HubSpot
  try {
    await updateContact(contact_id, { origine })
  } catch (e) {
    console.error('[origine-matches] HubSpot update failed:', e)
  }

  return NextResponse.json({ ok: true })
}
