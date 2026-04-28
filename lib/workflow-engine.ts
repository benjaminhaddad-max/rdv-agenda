/**
 * Workflow Engine — exécute les steps d'un workflow pour un contact donné.
 *
 * Appelé :
 *   - À la création d'une execution (form submitted, etc.) → lancement immédiat
 *   - Toutes les minutes par /api/cron/workflow-engine pour les executions
 *     en status 'running' ou 'waiting' dont next_run_at <= now()
 *
 * Architecture :
 *   - Une execution a current_step_seq = prochain step à exécuter
 *   - Chaque appel à processExecution() :
 *      1. Lit le step à current_step_seq
 *      2. L'exécute (envoyer email, créer tâche, ou wait)
 *      3. Si wait : met status='waiting' + next_run_at = now + duration
 *      4. Sinon : log + advance current_step_seq + reschedule immédiat
 *      5. Si plus de step : status='completed'
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendBrevoEmail,
  renderTemplate,
  htmlToText,
  BREVO_DEFAULT_SENDER,
} from './brevo'
import { sendSms } from './smsfactor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface Execution {
  id: string
  workflow_id: string
  hubspot_contact_id: string
  current_step_seq: number
  status: string
  trigger_context: Json
}

interface Step {
  id: string
  workflow_id: string
  sequence: number
  step_type: string
  config: Json
  label: string | null
}

interface Contact {
  hubspot_contact_id: string
  email: string | null
  firstname: string | null
  lastname: string | null
  hubspot_owner_id: string | null
  classe_actuelle: string | null
  phone: string | null
}

const CONTACT_COLUMNS = 'hubspot_contact_id, email, firstname, lastname, hubspot_owner_id, classe_actuelle, phone'

export async function loadContact(db: SupabaseClient, contactId: string): Promise<Contact | null> {
  const { data } = await db
    .from('crm_contacts')
    .select(CONTACT_COLUMNS)
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()
  return (data as Contact | null) ?? null
}

function buildVars(contact: Contact | null) {
  return {
    prenom:           contact?.firstname || '',
    firstname:        contact?.firstname || '',
    nom:              contact?.lastname || '',
    lastname:         contact?.lastname || '',
    email:            contact?.email || '',
    classe:           contact?.classe_actuelle || '',
    classe_actuelle:  contact?.classe_actuelle || '',
    phone:            contact?.phone || '',
  }
}

async function loadStep(db: SupabaseClient, workflowId: string, seq: number): Promise<Step | null> {
  const { data } = await db
    .from('crm_workflow_steps')
    .select('id, workflow_id, sequence, step_type, config, label')
    .eq('workflow_id', workflowId)
    .eq('sequence', seq)
    .maybeSingle()
  return (data as Step | null) ?? null
}

async function logStep(db: SupabaseClient, execution: Execution, step: Step | null, status: 'success' | 'failed' | 'skipped', output?: Json, errorMsg?: string) {
  await db.from('crm_workflow_logs').insert({
    execution_id: execution.id,
    workflow_id:  execution.workflow_id,
    step_id:      step?.id ?? null,
    step_type:    step?.step_type ?? null,
    status,
    output:       output ?? null,
    error_message: errorMsg ?? null,
  })
}

async function finishExecution(db: SupabaseClient, executionId: string, finalStatus: 'completed' | 'failed', errorMessage?: string) {
  const update: Record<string, unknown> = {
    status: finalStatus,
    next_run_at: null,
  }
  if (finalStatus === 'completed') update.completed_at = new Date().toISOString()
  else update.failed_at = new Date().toISOString()
  if (errorMessage) update.error_message = errorMessage
  await db.from('crm_workflow_executions').update(update).eq('id', executionId)
}

/**
 * Exécute le step à `current_step_seq` pour une execution.
 * Retourne true si l'engine doit immédiatement re-traiter (advance) cette
 * execution, false si elle doit attendre (wait) ou est terminée.
 */
export async function processExecution(db: SupabaseClient, execution: Execution): Promise<boolean> {
  const step = await loadStep(db, execution.workflow_id, execution.current_step_seq)
  if (!step) {
    // Plus de step → workflow terminé
    await finishExecution(db, execution.id, 'completed')
    // Update workflow stats
    try {
      const { data: cur } = await db.from('crm_workflows').select('total_completed').eq('id', execution.workflow_id).single()
      if (cur) {
        await db.from('crm_workflows').update({ total_completed: (cur.total_completed ?? 0) + 1 }).eq('id', execution.workflow_id)
      }
    } catch { /* ignore */ }
    return false
  }

  const contact = await loadContact(db, execution.hubspot_contact_id)
  if (!contact) {
    await logStep(db, execution, step, 'failed', null, 'Contact introuvable')
    await finishExecution(db, execution.id, 'failed', 'Contact introuvable')
    return false
  }

  try {
    switch (step.step_type) {
      case 'wait': {
        const minutes = Number(step.config?.duration_minutes) || 0
        const nextRun = new Date(Date.now() + minutes * 60_000).toISOString()
        await db.from('crm_workflow_executions').update({
          status: 'waiting',
          next_run_at: nextRun,
          current_step_seq: execution.current_step_seq + 1,  // on avance pour qu'au prochain run on traite le step suivant
        }).eq('id', execution.id)
        await logStep(db, execution, step, 'success', { next_run_at: nextRun })
        return false
      }

      case 'send_email': {
        if (!contact.email) {
          await logStep(db, execution, step, 'skipped', null, 'Pas d\'email')
          break
        }
        // Charger le template si template_id
        let subject = String(step.config?.subject ?? '')
        let html    = String(step.config?.html ?? '')
        if (step.config?.template_id) {
          const { data: tpl } = await db
            .from('email_templates')
            .select('subject, html_body')
            .eq('id', step.config.template_id)
            .single()
          if (tpl) {
            subject = tpl.subject || subject
            html    = tpl.html_body || html
          }
        }
        if (!subject || !html) {
          await logStep(db, execution, step, 'failed', null, 'Sujet ou HTML manquant')
          break
        }
        const vars = buildVars(contact)
        const renderedSubject = renderTemplate(subject, vars)
        const renderedHtml    = renderTemplate(html, vars)
        const result = await sendBrevoEmail({
          subject: renderedSubject,
          htmlContent: renderedHtml,
          textContent: htmlToText(renderedHtml),
          to: [{ email: contact.email, name: [contact.firstname, contact.lastname].filter(Boolean).join(' ') || undefined }],
          sender: {
            email: step.config?.sender_email || BREVO_DEFAULT_SENDER.email,
            name:  step.config?.sender_name  || BREVO_DEFAULT_SENDER.name,
          },
          replyTo: step.config?.reply_to ? { email: String(step.config.reply_to) } : undefined,
          tags: [`workflow:${execution.workflow_id}`, `execution:${execution.id}`],
        })
        // Log activité dans crm_activities (timeline contact)
        await db.from('crm_activities').insert({
          activity_type:      'email',
          hubspot_contact_id: contact.hubspot_contact_id,
          subject:            renderedSubject,
          body:               renderedHtml,
          direction:          'OUTGOING',
          status:             'SENT',
          metadata:           { brevo_message_id: result.messageId, source: 'workflow', workflow_id: execution.workflow_id },
          occurred_at:        new Date().toISOString(),
        })
        await logStep(db, execution, step, 'success', { message_id: result.messageId })
        break
      }

      case 'create_task': {
        const dueInMin = Number(step.config?.due_in_minutes) || 0
        const dueAt = dueInMin > 0 ? new Date(Date.now() + dueInMin * 60_000).toISOString() : null
        const { data: task, error } = await db.from('crm_tasks').insert({
          title:               renderTemplate(String(step.config?.title || 'Tâche'), buildVars(contact)),
          description:         step.config?.description ? renderTemplate(String(step.config.description), buildVars(contact)) : null,
          hubspot_contact_id:  contact.hubspot_contact_id,
          owner_id:            step.config?.owner_id || contact.hubspot_owner_id || null,
          priority:            step.config?.priority || 'normal',
          task_type:           step.config?.task_type || 'follow_up',
          due_at:              dueAt,
          status:              'pending',
        }).select().single()
        if (error) throw new Error(error.message)
        await logStep(db, execution, step, 'success', { task_id: task?.id })
        break
      }

      case 'update_property': {
        const property = String(step.config?.property || '')
        const value    = step.config?.value
        if (!property) {
          await logStep(db, execution, step, 'failed', null, 'Property manquante')
          break
        }
        // Update direct + history (replique /api/crm/contacts/[id]/prop)
        const update: Record<string, unknown> = { synced_at: new Date().toISOString() }
        const KNOWN_COLUMNS: Record<string, string> = {
          firstname: 'firstname', lastname: 'lastname', email: 'email', phone: 'phone',
          classe_actuelle: 'classe_actuelle', departement: 'departement',
          hs_lead_status: 'hs_lead_status', origine: 'origine',
          hubspot_owner_id: 'hubspot_owner_id',
        }
        if (KNOWN_COLUMNS[property]) update[KNOWN_COLUMNS[property]] = value === '' ? null : value
        const { data: existing } = await db
          .from('crm_contacts')
          .select('hubspot_raw')
          .eq('hubspot_contact_id', contact.hubspot_contact_id)
          .maybeSingle()
        if (existing) {
          const raw = (existing as { hubspot_raw?: Record<string, unknown> }).hubspot_raw ?? {}
          update.hubspot_raw = { ...raw, [property]: value }
        }
        await db.from('crm_contacts').update(update).eq('hubspot_contact_id', contact.hubspot_contact_id)
        await db.from('crm_property_history').insert({
          hubspot_contact_id: contact.hubspot_contact_id,
          property_name:      property,
          value:              value === null || value === undefined ? null : String(value),
          changed_at:         new Date().toISOString(),
          source_type:        'WORKFLOW',
          source_id:          execution.workflow_id,
          source_label:       `Workflow ${execution.workflow_id}`,
        }).then(() => { /* ignore */ }, () => { /* ignore */ })
        await logStep(db, execution, step, 'success', { property, value })
        break
      }

      case 'send_sms': {
        if (!contact.phone) {
          await logStep(db, execution, step, 'skipped', null, 'Pas de numéro de téléphone')
          break
        }
        const text = String(step.config?.text ?? '')
        if (!text) {
          await logStep(db, execution, step, 'failed', null, 'Texte du SMS manquant')
          break
        }
        const renderedText = renderTemplate(text, buildVars(contact))
        const result = await sendSms(contact.phone, renderedText)
        if (!result.ok) {
          await logStep(db, execution, step, 'failed', { ticket: result.ticket }, result.error || 'Échec envoi SMS')
          break
        }
        // Log activité dans crm_activities (timeline contact) — type 'sms' rangé en activity 'note'
        // jusqu'à ce qu'on ait un activity_type dédié.
        await db.from('crm_activities').insert({
          activity_type:      'note',
          hubspot_contact_id: contact.hubspot_contact_id,
          subject:            `SMS envoyé`,
          body:               renderedText,
          direction:          'OUTGOING',
          status:             'SENT',
          metadata:           { sms_factor_ticket: result.ticket, source: 'workflow', workflow_id: execution.workflow_id, channel: 'sms' },
          occurred_at:        new Date().toISOString(),
        })
        await logStep(db, execution, step, 'success', { ticket: result.ticket })
        break
      }

      case 'webhook': {
        const url    = String(step.config?.url || '')
        const method = String(step.config?.method || 'POST')
        if (!url) {
          await logStep(db, execution, step, 'failed', null, 'URL manquante')
          break
        }
        const res = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json', ...(step.config?.headers || {}) },
          body: method !== 'GET' ? JSON.stringify({
            contact: { id: contact.hubspot_contact_id, email: contact.email, firstname: contact.firstname, lastname: contact.lastname },
            workflow_id: execution.workflow_id,
            execution_id: execution.id,
            ...(step.config?.body || {}),
          }) : undefined,
        })
        await logStep(db, execution, step, res.ok ? 'success' : 'failed', { status: res.status }, res.ok ? undefined : `HTTP ${res.status}`)
        break
      }

      default:
        await logStep(db, execution, step, 'skipped', null, `step_type inconnu: ${step.step_type}`)
    }

    // Steps non-wait : avancer immédiatement
    if (step.step_type !== 'wait') {
      await db.from('crm_workflow_executions').update({
        current_step_seq: execution.current_step_seq + 1,
        next_run_at: new Date().toISOString(),
        status: 'running',
      }).eq('id', execution.id)
      return true  // signaler à l'engine de retraiter immédiatement
    }
    return false
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logStep(db, execution, step, 'failed', null, msg)
    await finishExecution(db, execution.id, 'failed', msg)
    // Increment failed counter
    try {
      const { data: cur } = await db.from('crm_workflows').select('total_failed').eq('id', execution.workflow_id).single()
      if (cur) {
        await db.from('crm_workflows').update({ total_failed: (cur.total_failed ?? 0) + 1 }).eq('id', execution.workflow_id)
      }
    } catch { /* ignore */ }
    return false
  }
}

/**
 * Crée une nouvelle execution pour un contact donné.
 * Si re_enroll=false et qu'une execution existe déjà, ne fait rien.
 */
export async function enrollContact(
  db: SupabaseClient,
  workflowId: string,
  contactId: string,
  triggerContext: Json = {},
): Promise<{ enrolled: boolean; execution_id?: string; reason?: string }> {
  // Vérifie le workflow
  const { data: wf } = await db
    .from('crm_workflows')
    .select('id, status, re_enroll, enrollment_filters, total_enrolled')
    .eq('id', workflowId)
    .single()
  if (!wf) return { enrolled: false, reason: 'workflow not found' }
  if (wf.status !== 'active') return { enrolled: false, reason: 'workflow not active' }

  // TODO: appliquer enrollment_filters (vérifier que le contact match avant d'entrer)
  //       pour l'instant on enroll directement.

  // Si re_enroll=false, le UNIQUE(workflow_id, contact_id) protège déjà.
  const { data: insert, error } = await db
    .from('crm_workflow_executions')
    .insert({
      workflow_id: workflowId,
      hubspot_contact_id: contactId,
      status: 'running',
      current_step_seq: 0,
      next_run_at: new Date().toISOString(),
      trigger_context: triggerContext,
    })
    .select()
    .single()

  if (error) {
    // Probablement violation unique → ignore
    if (String(error.code) === '23505') return { enrolled: false, reason: 'already enrolled' }
    return { enrolled: false, reason: error.message }
  }

  // Update enrolled counter
  await db.from('crm_workflows').update({
    total_enrolled: (wf.total_enrolled ?? 0) + 1,
  }).eq('id', workflowId)

  return { enrolled: true, execution_id: insert.id }
}
