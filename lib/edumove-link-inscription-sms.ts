import { createServiceClient } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof createServiceClient>

/** Formulaire natif CRM « Inscription Link » (premier formulaire du parcours test Link Rome). */
export const EDUMOVE_LINK_INSCRIPTION_FORM_ID = 'b84fb93f-f893-455b-b1ff-d7dda090bb26'
export const EDUMOVE_LINK_INSCRIPTION_FORM_SLUG = 'inscription-link-k21s'
export const EDUMOVE_LINK_INSCRIPTION_FORM_NAME = 'Inscription Link'

export const EDUMOVE_LINK_INSCRIPTION_WORKFLOW_NAME =
  'Edumove — Inscription Link SMS confirmation'

export const EDUMOVE_LINK_INSCRIPTION_SENDER = 'Edumove'

export const EDUMOVE_LINK_INSCRIPTION_SECOND_FORM_URL =
  'https://www.edumove.fr/candidature-test-link/remplir'

export const EDUMOVE_LINK_INSCRIPTION_SMS_TEXT =
  'Votre candidature pour le test de la Link University de Rome a bien été reçue !\n' +
  'Pour compléter votre dossier, remplissez vite ce second formulaire : ' +
  `${EDUMOVE_LINK_INSCRIPTION_SECOND_FORM_URL}\n` +
  "Un représentant de l'université vous rappellera ensuite pour finaliser votre inscription au test."

export const EDUMOVE_LINK_INSCRIPTION_SMS_STEP_CONFIG = {
  text: EDUMOVE_LINK_INSCRIPTION_SMS_TEXT,
  sender: EDUMOVE_LINK_INSCRIPTION_SENDER,
  pushtype: 'alert' as const,
  auto_shorten: true,
}

export async function getEdumoveLinkInscriptionWorkflowId(
  db: SupabaseClient,
  status?: 'active' | 'draft' | 'paused',
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db
    .from('crm_workflows')
    .select('id')
    .eq('name', EDUMOVE_LINK_INSCRIPTION_WORKFLOW_NAME)
  if (status) q = q.eq('status', status)
  const { data } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

/**
 * Crée ou met à jour le workflow et l'active pour les futures soumissions du form.
 */
export async function ensureEdumoveLinkInscriptionSmsWorkflowActive(): Promise<{
  workflow_id: string
  created: boolean
  activated: boolean
}> {
  const db = createServiceClient()
  const existingId = await getEdumoveLinkInscriptionWorkflowId(db)
  let workflowId = existingId
  let created = false

  const triggerConfig = {
    form_id: EDUMOVE_LINK_INSCRIPTION_FORM_ID,
    form_slug: EDUMOVE_LINK_INSCRIPTION_FORM_SLUG,
  }

  if (workflowId) {
    await db.from('crm_workflows').update({
      status: 'active',
      trigger_type: 'form_submitted',
      trigger_config: triggerConfig,
      re_enroll: false,
      updated_at: new Date().toISOString(),
    }).eq('id', workflowId)
  } else {
    const { data: wf, error } = await db.from('crm_workflows').insert({
      name: EDUMOVE_LINK_INSCRIPTION_WORKFLOW_NAME,
      description:
        'SMS transactionnel Edumove après soumission du formulaire Inscription Link (lien court vers le 2e formulaire).',
      status: 'active',
      trigger_type: 'form_submitted',
      trigger_config: triggerConfig,
      re_enroll: false,
    }).select('id').single()
    if (error || !wf) throw new Error(error?.message || 'workflow insert failed')
    workflowId = wf.id
    created = true
  }

  const { data: steps } = await db
    .from('crm_workflow_steps')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('step_type', 'send_sms')

  if (!steps?.length) {
    await db.from('crm_workflow_steps').insert({
      workflow_id: workflowId,
      sequence: 0,
      step_type: 'send_sms',
      label: 'SMS confirmation + lien 2e formulaire',
      config: EDUMOVE_LINK_INSCRIPTION_SMS_STEP_CONFIG,
    })
  } else {
    await db.from('crm_workflow_steps').update({
      label: 'SMS confirmation + lien 2e formulaire',
      config: EDUMOVE_LINK_INSCRIPTION_SMS_STEP_CONFIG,
    }).eq('id', steps[0].id)
  }

  return { workflow_id: workflowId!, created, activated: true }
}
