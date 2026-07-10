/** Libellés affichés quand l'auteur n'est pas une personne du CRM. */
export const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  workflow: 'Workflow automatique',
  thotis_webhook: 'Thotis',
  afem_webhook: 'Formulaire AFEM',
  recalif_hermione_webhook: 'Hermione · Recalif 2026',
  recalif_numerus_webhook: 'Numerus · Recalif 2026',
  recalif_prepamedecine_webhook: 'PrépaMédecine · Recalif 2026',
  hermione_orientation_webhook: 'Hermione',
  linova_webhook: 'Linova',
  linova_api: 'Linova',
  web_tracker: 'Site web',
  campaign: 'Campagne',
  rattrapage_2h: 'SMS Edumove',
  appointment_booking: 'Prise de RDV',
  appointment_recap: 'Rapport RDV',
}

type ActivityLike = {
  owner_id?: string | null
  metadata?: Record<string, unknown> | null
  hubspot_engagement_id?: string | null
}

function engagementMeta(activity: ActivityLike): Record<string, unknown> | undefined {
  const eng = activity.metadata?.engagement
  return eng && typeof eng === 'object' ? (eng as Record<string, unknown>) : undefined
}

/** Identifiant d'auteur (hubspot_owner_id, hubspot_user_id ou rdv_users.id). */
export function resolveActivityAuthorId(activity: ActivityLike): string | null {
  if (activity.owner_id) return String(activity.owner_id)

  const meta = activity.metadata || {}
  if (meta.author_user_id) return String(meta.author_user_id)

  const eng = engagementMeta(activity)
  if (eng?.ownerId != null && String(eng.ownerId).trim()) return String(eng.ownerId)
  if (eng?.createdBy != null && String(eng.createdBy).trim()) return String(eng.createdBy)

  return null
}

/** Libellé humain pour la timeline (commercial ou source système). */
export function resolveActivityAuthorLabel(
  activity: ActivityLike,
  ownerLabelMap: Record<string, string>,
): string | null {
  const authorId = resolveActivityAuthorId(activity)
  if (authorId) {
    return ownerLabelMap[authorId] || authorId
  }

  const src = activity.metadata?.source
  if (typeof src === 'string' && ACTIVITY_SOURCE_LABELS[src]) {
    return ACTIVITY_SOURCE_LABELS[src]
  }

  return null
}
