import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBrevoEmail, renderTemplate, htmlToText } from '@/lib/brevo'
import { getEmailBrand, brandSender, brandToCharter, wrapBrandEmailHtml } from '@/lib/email-brands'
import { resolveCampaignRecipients } from '@/lib/campaign-recipients'
import { resolveMarketingRecipients } from '@/lib/marketing-audiences'
import { resolveProgramFormLink, getBrandFormUrl } from '@/lib/marketing/brand-form-links'

export interface EmailProgram {
  id: string
  slug: string
  name: string
  interval_days: number
  status: string
  start_at: string | null
  crm_segment_ids: string[]
  marketing_audience_ids: string[]
  extra_filters: Record<string, unknown>
  prefill_form_slug: string | null
}

export interface EmailProgramStep {
  id: string
  program_id: string
  step_index: number
  day_offset: number
  brand_id: string | null
  label: string
  subject: string
  preheader: string | null
  template_id: string | null
  html_body: string
  text_body: string | null
}

export interface ProgramEnrollment {
  id: string
  program_id: string
  email: string
  first_name: string | null
  last_name: string | null
  contact_id: string | null
  marketing_member_id: string | null
  recipient_source: string
  current_step_index: number
  status: string
  next_send_at: string | null
}

export async function enrollProgramAudience(
  db: SupabaseClient,
  programId: string,
): Promise<{ enrolled: number }> {
  const { data: program, error } = await db
    .from('email_programs')
    .select('*')
    .eq('id', programId)
    .single()

  if (error || !program) throw new Error('Programme introuvable')

  const crm = await resolveCampaignRecipients(db, {
    segment_ids: program.crm_segment_ids || [],
    extra_filters: program.extra_filters || {},
    manual_contact_ids: [],
  })

  const mkt = await resolveMarketingRecipients(db, program.marketing_audience_ids || [])

  const rows: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  const startAt = program.start_at ? new Date(program.start_at) : new Date()

  for (const r of crm) {
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      program_id: programId,
      recipient_source: 'crm',
      contact_id: r.contact_id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      current_step_index: 0,
      status: 'active',
      next_send_at: startAt.toISOString(),
    })
  }

  for (const r of mkt) {
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      program_id: programId,
      recipient_source: 'marketing',
      contact_id: r.contact_id,
      marketing_member_id: r.marketing_member_id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      current_step_index: 0,
      status: 'active',
      next_send_at: startAt.toISOString(),
    })
  }

  if (rows.length === 0) return { enrolled: 0 }

  const CHUNK = 200
  let enrolled = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error: insErr } = await db
      .from('email_program_enrollments')
      .upsert(chunk, { onConflict: 'program_id,email', ignoreDuplicates: false })
    if (!insErr) enrolled += chunk.length
  }

  await db
    .from('email_programs')
    .update({ total_enrolled: enrolled, status: 'active', start_at: startAt.toISOString() })
    .eq('id', programId)

  return { enrolled }
}

export async function processDueProgramSends(
  db: SupabaseClient,
  maxSends = 100,
): Promise<{ sent: number; failed: number }> {
  const now = new Date().toISOString()
  const { data: due, error } = await db
    .from('email_program_enrollments')
    .select('*')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .order('next_send_at', { ascending: true })
    .limit(maxSends)

  if (error) throw new Error(error.message)
  if (!due?.length) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  for (const enrollment of due as ProgramEnrollment[]) {
    try {
      const ok = await sendProgramStepToEnrollment(db, enrollment)
      if (ok) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return { sent, failed }
}

async function sendProgramStepToEnrollment(
  db: SupabaseClient,
  enrollment: ProgramEnrollment,
): Promise<boolean> {
  const { data: program } = await db
    .from('email_programs')
    .select('*')
    .eq('id', enrollment.program_id)
    .single()

  if (!program || program.status !== 'active') return false

  const { data: step } = await db
    .from('email_program_steps')
    .select('*')
    .eq('program_id', enrollment.program_id)
    .eq('step_index', enrollment.current_step_index)
    .maybeSingle()

  if (!step) {
    await db
      .from('email_program_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString(), next_send_at: null })
      .eq('id', enrollment.id)
    return true
  }

  const brand = step.brand_id
    ? await getEmailBrand(db, step.brand_id)
    : null

  if (brand && !brand.active) {
    await db.from('email_program_enrollments').update({
      status: 'failed',
      next_send_at: null,
    }).eq('id', enrollment.id)
    return false
  }

  const formSlug = program.prefill_form_slug?.trim() || process.env.CAMPAIGN_PREFILL_FORM_SLUG?.trim() || ''

  const lienFormulaire =
    enrollment.contact_id && !enrollment.contact_id.startsWith('mkt:')
      ? resolveProgramFormLink(
          brand?.slug,
          {
            hubspot_contact_id: enrollment.contact_id,
            firstname: enrollment.first_name,
            lastname: enrollment.last_name,
            email: enrollment.email,
          },
          formSlug,
        )
      : getBrandFormUrl(brand?.slug) || ''

  const vars = {
    prenom: enrollment.first_name || '',
    nom: enrollment.last_name || '',
    email: enrollment.email,
    lien_formulaire: lienFormulaire,
    lien_cta: lienFormulaire,
  }

  const subject = renderTemplate(step.subject, vars)
  const preheader = step.preheader ? renderTemplate(step.preheader, vars) : ''

  let inner = renderTemplate(step.html_body || '', vars)
  if (preheader) {
    inner = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>${inner}`
  }
  let html = inner
  if (brand) {
    html = wrapBrandEmailHtml(brand, inner)
  }

  try {
    const result = await sendBrevoEmail({
      subject,
      htmlContent: html,
      textContent: step.text_body || htmlToText(html),
      to: [{
        email: enrollment.email,
        name: `${enrollment.first_name || ''} ${enrollment.last_name || ''}`.trim() || undefined,
      }],
      sender: brand ? brandSender(brand) : undefined,
      replyTo: brand?.reply_to ? { email: brand.reply_to } : undefined,
      tags: [`program:${program.slug}`, `step:${step.step_index}`],
    })

    await db.from('email_program_sends').insert({
      enrollment_id: enrollment.id,
      program_id: enrollment.program_id,
      step_index: step.step_index,
      brand_id: step.brand_id,
      email: enrollment.email,
      subject,
      status: 'sent',
      brevo_message_id: result.messageId || null,
    })

    const nextIndex = enrollment.current_step_index + 1
    const { data: nextStep } = await db
      .from('email_program_steps')
      .select('step_index')
      .eq('program_id', enrollment.program_id)
      .eq('step_index', nextIndex)
      .maybeSingle()

    if (nextStep) {
      const nextAt = new Date()
      nextAt.setDate(nextAt.getDate() + (program.interval_days || 2))
      await db.from('email_program_enrollments').update({
        current_step_index: nextIndex,
        last_sent_at: new Date().toISOString(),
        next_send_at: nextAt.toISOString(),
      }).eq('id', enrollment.id)
    } else {
      await db.from('email_program_enrollments').update({
        current_step_index: nextIndex,
        status: 'completed',
        last_sent_at: new Date().toISOString(),
        next_send_at: null,
        completed_at: new Date().toISOString(),
      }).eq('id', enrollment.id)
    }

    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send failed'
    await db.from('email_program_sends').insert({
      enrollment_id: enrollment.id,
      program_id: enrollment.program_id,
      step_index: step.step_index,
      brand_id: step.brand_id,
      email: enrollment.email,
      subject: step.subject,
      status: 'failed',
      error_message: message,
    })
    return false
  }
}
