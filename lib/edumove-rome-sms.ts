import type { createServiceClient } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof createServiceClient>

/** Noms internes des 3 formulaires ciblés (soumission HubSpot / Meta). */
export const EDUMOVE_ROME_FORM_NAMES = [
  'EDUMOVE - Form LGF V2',
  'EDUMOVE - Résultat Voeux Parcoursup - Form LGF 02/06/26',
  'EDUMOVE - CONTACT',
] as const

/** Variantes HubSpot « Facebook Lead Ads: … » pour les 2 forms Meta. */
export const EDUMOVE_ROME_CONVERSION_EVENTS = [
  ...EDUMOVE_ROME_FORM_NAMES,
  'Facebook Lead Ads: EDUMOVE - Form LGF V2',
  'Facebook Lead Ads: EDUMOVE - Résultat Voeux Parcoursup - Form LGF 02/06/26',
] as const

export const EDUMOVE_ROME_WORKFLOW_NAME = 'Edumove Rome — SMS auto (3 forms)'
export const EDUMOVE_ROME_CAMPAIGN_NAME = 'Edumove Rome — candidatures ouvertes (3 forms)'
export const EDUMOVE_ROME_SENDER = 'Edumove'

export const EDUMOVE_ROME_CANDIDATURE_URL = 'https://candidature.edumove.fr'

/**
 * Texte campagne (envoi groupé via SMS Factor) : {lien1} est résolu en lien
 * tracké unique par destinataire par le moteur de campagne (lib/sms-sender).
 */
export const EDUMOVE_ROME_SMS_TEXT =
  'Edumove : candidatures OUVERTES pour la Link University à Rome !\n' +
  'Médecine, Dentaire, Pharmacie, Kiné, avec un accompagnement complet.\n' +
  'Ultime test à Paris le 25 juin. Candidatez : {lien1}'

/**
 * Texte workflow auto (futurs leads) : le moteur de workflow n'a PAS le
 * mécanisme de liens trackés ({lien1}), donc on met l'URL réelle en clair.
 */
export const EDUMOVE_ROME_SMS_TEXT_WORKFLOW =
  'Edumove : candidatures OUVERTES pour la Link University à Rome !\n' +
  'Médecine, Dentaire, Pharmacie, Kiné, avec un accompagnement complet.\n' +
  `Ultime test à Paris le 25 juin. Candidatez : ${EDUMOVE_ROME_CANDIDATURE_URL}`

const CONVERSION_SET = new Set<string>(EDUMOVE_ROME_CONVERSION_EVENTS)

export function isEdumoveRomeFormConversion(event: string | null | undefined): boolean {
  if (!event) return false
  return CONVERSION_SET.has(event.trim())
}

export function edumoveRomeFormEventFilterValue(): string {
  return EDUMOVE_ROME_FORM_NAMES.join(',')
}

/** Corrige trigger_config en prod (évite le déclenchement sur tous les forms natifs). */
export async function secureEdumoveRomeWorkflowConfig(db: SupabaseClient): Promise<void> {
  const workflowId = await getEdumoveRomeWorkflowId(db)
  if (!workflowId) return
  await db.from('crm_workflows').update({
    trigger_config: { edumove_rome_sms: true },
    updated_at: new Date().toISOString(),
  }).eq('id', workflowId)
}

/** Coupe l'envoi auto immédiatement + annule les exécutions en attente. */
export async function pauseEdumoveRomeWorkflow(db: SupabaseClient): Promise<boolean> {
  const workflowId = await getEdumoveRomeWorkflowId(db, 'active')
  if (!workflowId) return false
  const now = new Date().toISOString()
  await db.from('crm_workflows').update({ status: 'paused', updated_at: now }).eq('id', workflowId)
  await db.from('crm_workflow_executions').update({
    status: 'failed',
    error_message: 'workflow_paused_emergency',
    completed_at: now,
  }).eq('workflow_id', workflowId).in('status', ['running', 'waiting'])
  return true
}

export async function getEdumoveRomeWorkflowId(
  db: SupabaseClient,
  status?: 'active' | 'draft' | 'paused',
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.from('crm_workflows').select('id').eq('name', EDUMOVE_ROME_WORKFLOW_NAME)
  if (status) q = q.eq('status', status)
  const { data } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

/**
 * Inscrit le contact au workflow auto si actif et conversion sur l'un des 3 forms.
 * re_enroll=false sur le workflow → un seul SMS auto par contact.
 */
export async function maybeEnrollEdumoveRomeWorkflow(
  db: SupabaseClient,
  contactId: string,
  conversionEvent: string | null | undefined,
): Promise<{ enrolled: boolean; reason?: string }> {
  if (!isEdumoveRomeFormConversion(conversionEvent)) {
    return { enrolled: false, reason: 'conversion_not_targeted' }
  }
  const workflowId = await getEdumoveRomeWorkflowId(db, 'active')
  if (!workflowId) {
    return { enrolled: false, reason: 'workflow_not_active' }
  }
  const { enrollContact } = await import('@/lib/workflow-engine')
  const result = await enrollContact(db, workflowId, contactId, {
    source: 'edumove_rome_sms',
    conversion_event: conversionEvent,
  })
  return { enrolled: result.enrolled, reason: result.reason }
}
