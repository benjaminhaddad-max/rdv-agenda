import { createServiceClient } from '@/lib/supabase'

/** Vue CRM : leads Meta rattrapés (forms non sync juin 2026) en Terminale IDF. */
export const META_BACKFILL_TERM_IDF_VIEW_ID = 'v_meta_backfill_term_idf'

/** Formulaires Meta ingérés lors du rattrapage manuel du 25/06/2026. */
export const META_BACKFILL_FORM_IDS = [
  '1752668048907992', // EDUMOVE - Résultat Voeux Parcoursup - Form LGF 02/06/26
  '1803378267700874', // Formulaire PASS / Fin Parcousup - 02/06/26
  '1313414470938507', // Formulaire - Guide Préparer sa rentrée 2026
  '4406817482928596', // Formulaire - Guide Liste Attente Parcoursup PASS 2026
] as const

const IDF_DEPARTEMENTS = new Set(['75', '77', '78', '91', '92', '93', '94', '95'])

function normalize(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isTerminale(classe: string | null | undefined): boolean {
  return normalize(classe).includes('terminale')
}

function isIdf(departement: string | null | undefined, zone: string | null | undefined): boolean {
  const dept = String(departement ?? '').replace(/\D/g, '').slice(0, 2)
  if (IDF_DEPARTEMENTS.has(dept)) return true
  const z = normalize(zone)
  return z.includes('idf') || z.includes('ile-de-france') || z.includes('ile de france') || z.includes('paris')
}

/**
 * Contacts uniques des 4 formulaires Meta rattrapés, filtrés Terminale + IDF.
 * (62 soumissions Meta → ~56 fiches contact distinctes.)
 */
export async function resolveMetaBackfillTermIdfContactIds(
  db: ReturnType<typeof createServiceClient> = createServiceClient(),
): Promise<string[]> {
  const { data: events, error } = await db
    .from('meta_lead_events')
    .select('contact_id')
    .in('form_id', [...META_BACKFILL_FORM_IDS])
    .eq('status', 'processed')
    .not('contact_id', 'is', null)
  if (error) throw new Error(error.message)

  const contactIds = [...new Set(
    (events ?? [])
      .map(r => r.contact_id as string | null)
      .filter(Boolean),
  )]
  if (contactIds.length === 0) return []

  const matched: string[] = []
  const BATCH = 200
  for (let i = 0; i < contactIds.length; i += BATCH) {
    const chunk = contactIds.slice(i, i + BATCH)
    const { data: rows, error: rowsErr } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, classe_actuelle, departement, zone_localite')
      .in('hubspot_contact_id', chunk)
    if (rowsErr) throw new Error(rowsErr.message)
    for (const row of rows ?? []) {
      if (!row.hubspot_contact_id) continue
      if (isTerminale(row.classe_actuelle) && isIdf(row.departement, row.zone_localite)) {
        matched.push(String(row.hubspot_contact_id))
      }
    }
  }
  return matched
}
