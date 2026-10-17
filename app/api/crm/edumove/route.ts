import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEdumoveStaff } from '@/lib/edumove-auth'
import { edumoveMissingDocs } from '@/lib/edumove-stage'

/**
 * GET /api/crm/edumove — tous les dossiers Edumove (copie crm_edumove_candidatures)
 * pour l'onglet Edumove : liste légère, sans liens de pièces (le détail passe
 * par /api/crm/contacts/[id]/edumove).
 */

export const dynamic = 'force-dynamic'

type Row = {
  candidature_id: string
  hubspot_contact_id: string | null
  stage: string
  status: string | null
  situation_actuelle: string | null
  email: string | null
  prenom: string | null
  nom: string | null
  tel: string | null
  departement: string | null
  profil: string | null
  filieres: string[] | null
  destinations: string[] | null
  uni_selections: Record<string, unknown> | null
  uni_tracking: Record<string, unknown> | null
  documents: Record<string, unknown> | null
  details: Record<string, unknown> | null
  candidature_created_at: string | null
  synced_at: string | null
}

export async function GET() {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const db = createServiceClient()
  const rows: Row[] = []
  // Pagination PostgREST (1 000 lignes max par requête)
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db
      .from('crm_edumove_candidatures')
      .select('candidature_id, hubspot_contact_id, stage, status, situation_actuelle, email, prenom, nom, tel, departement, profil, filieres, destinations, uni_selections, uni_tracking, documents, details, candidature_created_at, synced_at')
      .order('candidature_created_at', { ascending: false, nullsFirst: false })
      .order('candidature_id', { ascending: true })
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  let lastSync: string | null = null
  const dossiers = rows.map(r => {
    if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at
    const det = r.details ?? {}
    const docs = r.documents ?? {}
    return {
      candidature_id: r.candidature_id,
      contact_id: r.hubspot_contact_id,
      stage: r.stage,
      status: r.status,
      situation: r.situation_actuelle,
      email: r.email,
      prenom: r.prenom,
      nom: r.nom,
      tel: r.tel,
      departement: r.departement,
      profil: r.profil,
      filieres: r.filieres ?? [],
      destinations: r.destinations ?? [],
      facs: Object.keys(r.uni_selections ?? {}),
      tracking: r.uni_tracking ?? {},
      // Pour les variables de mail ({{facs}}, {{pieces_manquantes}}) : clés seulement
      uni_selections: r.uni_selections ?? {},
      documents: Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v === false ? false : !!v])),
      missing: edumoveMissingDocs(r.uni_selections ?? {}, docs),
      callback: det.callback_requested === true,
      created_at: r.candidature_created_at,
    }
  })
  return NextResponse.json({ dossiers, lastSync })
}
