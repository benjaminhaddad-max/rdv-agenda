import { createServiceClient } from '@/lib/supabase'
import { runSmsCampaign } from '@/lib/sms-sender'
import type { CRMFilterGroup } from '@/lib/crm-constants'
import {
  EDUMOVE_ROME_CAMPAIGN_NAME,
  EDUMOVE_ROME_CANDIDATURE_URL,
  EDUMOVE_ROME_CONVERSION_EVENTS,
  EDUMOVE_ROME_SENDER,
  EDUMOVE_ROME_SMS_TEXT,
  EDUMOVE_ROME_SMS_TEXT_WORKFLOW,
  EDUMOVE_ROME_WORKFLOW_NAME,
  edumoveRomeFormEventFilterValue,
  getEdumoveRomeWorkflowId,
} from '@/lib/edumove-rome-sms'

const META_FORM_NAMES = [
  'EDUMOVE - Form LGF V2',
  'EDUMOVE - Résultat Voeux Parcoursup - Form LGF 02/06/26',
] as const

export type EdumoveRomeSetupState = {
  workflow_id: string | null
  workflow_status: string | null
  campaign_id: string | null
  campaign_status: string | null
  meta_forms_linked: string[]
}

function campaignFilterGroups(): CRMFilterGroup[] {
  return [{
    id: 'edumove-rome-fg1',
    rules: [{
      id: 'edumove-rome-fr1',
      field: 'form_event',
      operator: 'is_any',
      value: edumoveRomeFormEventFilterValue(),
    }],
  }]
}

export async function ensureEdumoveRomeWorkflowDraft(): Promise<string> {
  const db = createServiceClient()
  const existingId = await getEdumoveRomeWorkflowId(db)
  if (existingId) {
    const { data: steps } = await db
      .from('crm_workflow_steps')
      .select('id')
      .eq('workflow_id', existingId)
      .eq('step_type', 'send_sms')
    if (!steps?.length) {
      await db.from('crm_workflow_steps').insert({
        workflow_id: existingId,
        sequence: 0,
        step_type: 'send_sms',
        label: 'SMS candidatures Rome',
        config: {
          text: EDUMOVE_ROME_SMS_TEXT_WORKFLOW,
          sender: EDUMOVE_ROME_SENDER,
          pushtype: 'marketing',
        },
      })
    } else {
      await db.from('crm_workflow_steps').update({
        config: {
          text: EDUMOVE_ROME_SMS_TEXT_WORKFLOW,
          sender: EDUMOVE_ROME_SENDER,
          pushtype: 'marketing',
        },
      }).eq('id', steps[0].id)
    }
    await db.from('crm_workflows').update({
      status: 'draft',
      re_enroll: false,
      trigger_config: { edumove_rome_sms: true },
      updated_at: new Date().toISOString(),
    }).eq('id', existingId)
    return existingId
  }

  const { data: wf, error } = await db.from('crm_workflows').insert({
    name: EDUMOVE_ROME_WORKFLOW_NAME,
    description: 'SMS auto à chaque soumission des 3 forms Edumove (Meta + HubSpot CONTACT). Activé via GO.',
    status: 'draft',
    trigger_type: 'form_submitted',
    trigger_config: { edumove_rome_sms: true },
    re_enroll: false,
  }).select('id').single()
  if (error || !wf) throw new Error(error?.message || 'workflow insert failed')

  await db.from('crm_workflow_steps').insert({
    workflow_id: wf.id,
    sequence: 0,
    step_type: 'send_sms',
    label: 'SMS candidatures Rome',
    config: {
      text: EDUMOVE_ROME_SMS_TEXT_WORKFLOW,
      sender: EDUMOVE_ROME_SENDER,
      pushtype: 'marketing',
    },
  })
  return wf.id
}

export async function ensureEdumoveRomeCampaignDraft(): Promise<string> {
  const db = createServiceClient()
  const { data: existing } = await db
    .from('sms_campaigns')
    .select('id, status')
    .eq('name', EDUMOVE_ROME_CAMPAIGN_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const payload = {
    name: EDUMOVE_ROME_CAMPAIGN_NAME,
    message: EDUMOVE_ROME_SMS_TEXT,
    sender: EDUMOVE_ROME_SENDER,
    campaign_type: 'marketing' as const,
    shorten_links: true,
    tracked_links: [{
      placeholder: '{lien1}',
      url: EDUMOVE_ROME_CANDIDATURE_URL,
      label: 'Candidature Edumove',
      tracked: true,
    }],
    filter_groups: campaignFilterGroups(),
    preset_flags: null,
    manual_phones: [] as string[],
    manual_contact_ids: [] as string[],
    scheduled_at: null,
    status: 'draft',
  }

  if (existing?.id) {
    if (existing.status === 'sent' || existing.status === 'sending') {
      throw new Error(`Campagne déjà ${existing.status} — créez-en une nouvelle ou réinitialisez manuellement`)
    }
    const { data, error } = await db
      .from('sms_campaigns')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message || 'campaign update failed')
    return data.id
  }

  const { data, error } = await db.from('sms_campaigns').insert(payload).select('id').single()
  if (error || !data) throw new Error(error?.message || 'campaign insert failed')
  return data.id
}

/** Lie workflow_id sur les 2 forms Meta (sans activer le workflow). */
export async function linkMetaLeadFormsToWorkflow(workflowId: string): Promise<string[]> {
  const db = createServiceClient()
  const linked: string[] = []
  for (const name of META_FORM_NAMES) {
    const { data: forms } = await db
      .from('meta_lead_forms')
      .select('form_id, name')
      .eq('name', name)
    for (const f of forms ?? []) {
      await db.from('meta_lead_forms').update({ workflow_id: workflowId }).eq('form_id', f.form_id)
      linked.push(`${f.name} (${f.form_id})`)
    }
  }
  return linked
}

export async function getEdumoveRomeSetupState(): Promise<EdumoveRomeSetupState> {
  const db = createServiceClient()
  const workflowId = await getEdumoveRomeWorkflowId(db)
  let workflowStatus: string | null = null
  if (workflowId) {
    const { data } = await db.from('crm_workflows').select('status').eq('id', workflowId).maybeSingle()
    workflowStatus = data?.status ?? null
  }
  const { data: camp } = await db
    .from('sms_campaigns')
    .select('id, status')
    .eq('name', EDUMOVE_ROME_CAMPAIGN_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const metaLinked: string[] = []
  if (workflowId) {
    const { data: mforms } = await db
      .from('meta_lead_forms')
      .select('name, workflow_id')
      .in('name', [...META_FORM_NAMES])
    for (const f of mforms ?? []) {
      if (f.workflow_id === workflowId) metaLinked.push(f.name ?? '')
    }
  }

  return {
    workflow_id: workflowId,
    workflow_status: workflowStatus,
    campaign_id: camp?.id ?? null,
    campaign_status: camp?.status ?? null,
    meta_forms_linked: metaLinked,
  }
}

const PAGE = 1000

const META_FORM_NAMES_FOR_AUDIENCE = [
  'EDUMOVE - Form LGF V2',
  'EDUMOVE - Résultat Voeux Parcoursup - Form LGF 02/06/26',
] as const

/**
 * TOUS les contacts (avec téléphone) ayant rempli l'un des 3 forms Edumove,
 * sur tout l'historique (pas seulement la dernière conversion) :
 *   1. crm_contacts.recent_conversion_event ∈ {3 noms + variantes "Facebook Lead Ads:"}
 *   2. meta_lead_events liés aux 2 forms Meta (historique complet des soumissions)
 * Filtré sur présence d'un numéro de téléphone.
 */
export async function resolveEdumoveRomeRecipientContactIds(): Promise<string[]> {
  const db = createServiceClient()
  const candidateIds = new Set<string>()

  // Source 1 : recent_conversion_event (noms exacts + variantes Facebook Lead Ads)
  {
    let off = 0
    for (;;) {
      const { data, error } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, phone')
        .in('recent_conversion_event', [...EDUMOVE_ROME_CONVERSION_EVENTS])
        .range(off, off + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = data ?? []
      for (const r of rows) {
        if (r.hubspot_contact_id && r.phone) candidateIds.add(r.hubspot_contact_id)
      }
      if (rows.length < PAGE) break
      off += PAGE
    }
  }

  // Source 2 : meta_lead_events (historique complet des 2 forms Meta)
  const { data: forms } = await db
    .from('meta_lead_forms')
    .select('form_id')
    .in('name', [...META_FORM_NAMES_FOR_AUDIENCE])
  const formIds = (forms ?? []).map(f => f.form_id).filter(Boolean)
  const metaContactIds = new Set<string>()
  if (formIds.length > 0) {
    let off = 0
    for (;;) {
      const { data, error } = await db
        .from('meta_lead_events')
        .select('contact_id')
        .in('form_id', formIds)
        .not('contact_id', 'is', null)
        .range(off, off + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = data ?? []
      for (const r of rows) {
        if (r.contact_id) metaContactIds.add(r.contact_id)
      }
      if (rows.length < PAGE) break
      off += PAGE
    }
  }
  // Ne garder que ceux qui ont un téléphone
  const metaList = [...metaContactIds]
  for (let i = 0; i < metaList.length; i += 400) {
    const batch = metaList.slice(i, i + 400)
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, phone')
      .in('hubspot_contact_id', batch)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      if (r.hubspot_contact_id && r.phone) candidateIds.add(r.hubspot_contact_id)
    }
  }

  return [...candidateIds]
}

/** Prépare tout en brouillon — aucun SMS envoyé. */
export async function setupEdumoveRomeSms(): Promise<EdumoveRomeSetupState & { workflow_id: string; campaign_id: string }> {
  const workflowId = await ensureEdumoveRomeWorkflowDraft()
  const campaignId = await ensureEdumoveRomeCampaignDraft()
  await linkMetaLeadFormsToWorkflow(workflowId)
  const state = await getEdumoveRomeSetupState()
  return { ...state, workflow_id: workflowId, campaign_id: campaignId }
}

/**
 * GO : active le workflow auto + envoie la campagne aux leads historiques.
 * À n'appeler qu'après validation explicite.
 */
export async function goEdumoveRomeSms(baseUrl: string, cookies = ''): Promise<{
  workflow_activated: boolean
  recipients_resolved: number
  campaign: Awaited<ReturnType<typeof runSmsCampaign>>
}> {
  const db = createServiceClient()
  const workflowId = await getEdumoveRomeWorkflowId(db) ?? await ensureEdumoveRomeWorkflowDraft()
  await db.from('crm_workflows').update({
    status: 'active',
    trigger_config: { edumove_rome_sms: true },
    updated_at: new Date().toISOString(),
  }).eq('id', workflowId)
  await linkMetaLeadFormsToWorkflow(workflowId)

  const { data: camp } = await db
    .from('sms_campaigns')
    .select('id, status')
    .eq('name', EDUMOVE_ROME_CAMPAIGN_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!camp?.id) throw new Error('Campagne introuvable — lancez setup d\'abord')
  if (camp.status === 'sent') {
    return {
      workflow_activated: true,
      recipients_resolved: 0,
      campaign: { ok: false, total_recipients: 0, valid: 0, sent: 0, failed: 0, skipped: 0, segments_used: 0, error: 'Campagne déjà envoyée' },
    }
  }

  const contactIds = await resolveEdumoveRomeRecipientContactIds()
  await db.from('sms_campaigns').update({
    manual_contact_ids: contactIds,
    filter_groups: [],
    updated_at: new Date().toISOString(),
  }).eq('id', camp.id)

  const campaign = await runSmsCampaign({ campaignId: camp.id, baseUrl, cookies })
  return { workflow_activated: true, recipients_resolved: contactIds.length, campaign }
}
