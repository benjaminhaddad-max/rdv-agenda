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

  // 1. Total des contacts sans origine
  const { count: totalUnknown } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id', { count: 'exact', head: true })
    .or('origine.is.null,origine.eq.,origine.eq.Autre,origine.eq.Inconnu')

  // 2. Charge les contacts sans origine (limit pour rester perf)
  const { data: unknowns, error: errU } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate')
    .or('origine.is.null,origine.eq.,origine.eq.Autre,origine.eq.Inconnu')
    .order('contact_createdate', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (errU) return NextResponse.json({ error: errU.message }, { status: 500 })
  if (!unknowns || unknowns.length === 0) {
    return NextResponse.json({ matches: [], total_unknown: 0, processed: 0 })
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
      // On cherche les contacts avec ce numéro (différents UUID, avec origine)
      const { data: phoneMatches } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate')
        .neq('hubspot_contact_id', u.hubspot_contact_id)
        .not('origine', 'is', null)
        .not('origine', 'in', '(,Autre,Inconnu)')
        .ilike('phone', `%${cleanedPhone.slice(-9)}%`) // matching tolérant
        .limit(5)
      for (const p of phoneMatches ?? []) {
        if (cleanPhone(p.phone) === cleanedPhone) {
          candidates.push({ ...p, match_type: 'phone' })
        }
      }
    }

    // b) Match par prénom + nom (uniquement si on n'a pas déjà des matches téléphone)
    if (candidates.length === 0 && fname && lname && fname.length > 1 && lname.length > 1) {
      const { data: nameMatches } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate')
        .neq('hubspot_contact_id', u.hubspot_contact_id)
        .not('origine', 'is', null)
        .not('origine', 'in', '(,Autre,Inconnu)')
        .ilike('firstname', fname)
        .ilike('lastname', lname)
        .limit(5)
      for (const p of nameMatches ?? []) {
        candidates.push({ ...p, match_type: 'name' })
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
