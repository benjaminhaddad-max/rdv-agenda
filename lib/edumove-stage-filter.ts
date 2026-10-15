/**
 * Filtre « Étape Edumove » (champ edumove_stage) : résolu côté API en liste de
 * contact_id depuis crm_edumove_candidatures (synchro lib/edumove-sync.ts).
 * Valeur = étapes séparées par des virgules (lib/edumove-stage.ts).
 */

import { EDUMOVE_STAGES } from '@/lib/edumove-stage'

export async function resolveEdumoveStageContactIds(db: any, value: string): Promise<string[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const tokens = value.split(',').map(t => t.trim()).filter(t => (EDUMOVE_STAGES as readonly string[]).includes(t))
  if (tokens.length === 0) return []
  const out = new Set<string>()
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await db.from('crm_edumove_candidatures')
      .select('hubspot_contact_id')
      .in('stage', tokens)
      .not('hubspot_contact_id', 'is', null)
      .order('candidature_id', { ascending: true })
      .range(from, from + 999)
    if (error) return [] // migration v90 non appliquée : filtre vide plutôt qu'erreur
    for (const r of data ?? []) out.add(String(r.hubspot_contact_id))
    if (!data || data.length < 1000) break
  }
  return [...out]
}
