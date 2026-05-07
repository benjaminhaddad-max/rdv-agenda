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
  // Limit haute par défaut pour analyser TOUS les unknowns en un seul appel
  // (cap à 2000 pour la sécurité Supabase / timeout serverless).
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '1000'), 2000)
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

  // ─── Stratégie hybride pour rester rapide ─────────────────────────────────
  // 1) On charge TOUS les candidats avec origine — SANS hubspot_raw (juste les
  //    colonnes nécessaires pour matcher par téléphone et nom). Pagination 1k.
  // 2) On indexe en mémoire byPhone et byName.
  // 3) Pour le matching responsable_legal_1, on fait des SQL ciblées sur
  //    hubspot_raw->>'...' uniquement pour les unknowns qui n'ont pas trouvé
  //    de match phone/name (max ~100 sous-requêtes).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getResponsableLegal = (raw: any): { prenom: string | null; nom: string | null } => {
    if (!raw || typeof raw !== 'object') return { prenom: null, nom: null }
    const prenom = raw.prenom_du_responsable_legal_1 || raw.prenom_responsable_legal_1 || raw.prenom_parent || raw.prenom_parent_1 || null
    const nom = raw.nom_du_responsable_legal_1 || raw.nom_responsable_legal_1 || raw.nom_parent || raw.nom_parent_1 || null
    return { prenom, nom }
  }

  // 1) Charge candidats LIGHT (sans hubspot_raw) — rapide même sur 30k contacts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatesPool: any[] = []
  const PAGE_SIZE = 1000
  for (let offset = 0; offset < 100000; offset += PAGE_SIZE) {
    const { data: batch, error: errC } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate')
      .not('origine', 'is', null)
      .not('origine', 'in', '(,Autre,Inconnu)')
      .range(offset, offset + PAGE_SIZE - 1)
    if (errC) return NextResponse.json({ error: errC.message }, { status: 500 })
    if (!batch || batch.length === 0) break
    candidatesPool.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }

  // 2) Index en mémoire (uniquement phone et name — pas de responsable_legal ici)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPhone = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byName  = new Map<string, any[]>()

  for (const c of candidatesPool ?? []) {
    const cp = cleanPhone(c.phone)
    if (cp) {
      if (!byPhone.has(cp)) byPhone.set(cp, [])
      byPhone.get(cp)!.push(c)
    }
    const cf = c.firstname?.trim().toLowerCase()
    const cl = c.lastname?.trim().toLowerCase()
    if (cf && cl && cf.length > 1 && cl.length > 1) {
      const k = `${cf}|${cl}`
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k)!.push(c)
    }
  }

  // 3) Phase 1 : matching phone + name (in-memory) pour TOUS les unknowns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchesByContactId = new Map<string, { contact: any; candidates: any[] }>()
  for (const u of unknowns) {
    const cleanedPhone = cleanPhone(u.phone)
    const fname = u.firstname?.trim().toLowerCase()
    const lname = u.lastname?.trim().toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: any[] = []

    if (cleanedPhone) {
      for (const c of byPhone.get(cleanedPhone) ?? []) {
        if (c.hubspot_contact_id !== u.hubspot_contact_id) candidates.push({ ...c, match_type: 'phone' })
      }
    }
    if (fname && lname && fname.length > 1 && lname.length > 1) {
      for (const c of byName.get(`${fname}|${lname}`) ?? []) {
        if (c.hubspot_contact_id !== u.hubspot_contact_id) candidates.push({ ...c, match_type: 'name' })
      }
    }
    if (candidates.length > 0) {
      matchesByContactId.set(u.hubspot_contact_id, { contact: u, candidates })
    }
  }

  // 4) Phase 2 : matching responsable_legal_1 pour TOUS les unknowns (en parallèle)
  // → ne suppose plus qu'il faut SKIP les unknowns ayant déjà un match phone/name
  //    (un contact peut avoir 3 types de match en parallèle)
  const allUnknownsForRl = unknowns
    .map(u => ({
      u,
      fname: u.firstname?.trim().toLowerCase(),
      lname: u.lastname?.trim().toLowerCase(),
    }))
    .filter(x => x.fname && x.lname && x.fname.length > 1 && x.lname.length > 1)

  const BATCH_SIZE = 25
  let rlMatchCount = 0
  for (let i = 0; i < allUnknownsForRl.length; i += BATCH_SIZE) {
    const batch = allUnknownsForRl.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async ({ u, fname, lname }) => {
      const { data: rlMatches } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, origine, contact_createdate, hubspot_raw')
        .neq('hubspot_contact_id', u.hubspot_contact_id)
        .not('origine', 'is', null)
        .not('origine', 'in', '(,Autre,Inconnu)')
        .or([
          `hubspot_raw->>prenom_du_responsable_legal_1.ilike.${fname}`,
          `hubspot_raw->>prenom_responsable_legal_1.ilike.${fname}`,
          `hubspot_raw->>prenom_parent.ilike.${fname}`,
        ].join(','))
        .limit(10)
      for (const p of rlMatches ?? []) {
        const rl = getResponsableLegal(p.hubspot_raw)
        if (rl.prenom?.trim().toLowerCase() === fname && rl.nom?.trim().toLowerCase() === lname) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { hubspot_raw, ...rest } = p
          const cand = { ...rest, match_type: 'responsable_legal', responsable_legal: rl }
          const existing = matchesByContactId.get(u.hubspot_contact_id)
          if (existing) {
            existing.candidates.push(cand)
          } else {
            matchesByContactId.set(u.hubspot_contact_id, { contact: u, candidates: [cand] })
          }
          rlMatchCount++
        }
      }
    }))
  }

  const matches = Array.from(matchesByContactId.values())

  return NextResponse.json({
    matches,
    total_unknown: totalUnknown ?? 0,
    processed: unknowns.length,
    candidates_pool_size: candidatesPool.length,
    rl_match_count: rlMatchCount,
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
