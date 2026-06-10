import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, buildBookingSms } from '@/lib/smsfactor'
import { sendBookingConfirmationEmail } from '@/lib/email-reminders'
import { formatParis } from '@/lib/date-paris'

// PATCH /api/appointments/:id — Mise à jour statut OU assignation à un closer
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const {
    status, notes, commercial_id, report_summary, report_telepro_advice, telepro_suivi, reassign,
    negatif_reason, negatif_reason_detail, interlocuteur_principal,
    consigne_text, consigne_echeance, consigne_rien_a_faire,
    contexte_concurrence, financement, jpo_invitation,
    email_parent,
    start_at, end_at,
  } = body

  const db = createServiceClient()

  // Récupérer le RDV actuel (avec tous les champs nécessaires pour le deal)
  const { data: appointment, error: fetchErr } = await db
    .from('rdv_appointments')
    .select(`
      hubspot_deal_id, status, commercial_id,
      prospect_name, prospect_email, prospect_phone,
      start_at, end_at, formation_type,
      meeting_type, meeting_link,
      hubspot_contact_id, notes, departement, classe_actuelle, email_parent
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  // === CAS 0 : DÉPLACEMENT (glisser-déposer dans l'agenda) ===
  // Nouveau créneau + remise à zéro du workflow SMS/email (comme une nouvelle prise de RDV).
  if (start_at !== undefined && end_at !== undefined && commercial_id === undefined && status === undefined) {
    const newStart = new Date(start_at)
    const newEnd = new Date(end_at)
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return NextResponse.json({ error: 'Créneau invalide' }, { status: 400 })
    }

    const sameSlot =
      new Date(appointment.start_at).getTime() === newStart.getTime() &&
      new Date(appointment.end_at).getTime() === newEnd.getTime()
    if (sameSlot) {
      return NextResponse.json(appointment)
    }

    // Conflit : le closer a déjà un autre RDV qui chevauche le nouveau créneau
    if (appointment.commercial_id) {
      const { data: conflict } = await db
        .from('rdv_appointments')
        .select('id')
        .eq('commercial_id', appointment.commercial_id)
        .neq('status', 'annule')
        .neq('id', id)
        .lt('start_at', end_at)
        .gt('end_at', start_at)
        .limit(1)

      if (conflict && conflict.length > 0) {
        return NextResponse.json({ error: 'Le closer a déjà un RDV sur ce créneau' }, { status: 409 })
      }
    }

    const updatePayload: Record<string, unknown> = {
      start_at,
      end_at,
      sms_booking_sent_at: null,
      sms_48h_sent_at: null,
      sms_24h_relance_sent_at: null,
      sms_morning_sent_at: null,
      sms_1h_sent_at: null,
      sms_5min_sent_at: null,
    }
    // Le prospect doit re-confirmer sa présence sur le nouveau créneau
    if (appointment.status === 'confirme_prospect') {
      updatePayload.status = 'confirme'
    }

    const { data: updated, error: updateErr } = await db
      .from('rdv_appointments')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // SMS + email de confirmation immédiats (nouvelle date), comme à la création du RDV
    const dateStr = formatParis(newStart)
    const firstName = String(appointment.prospect_name || '').trim().split(/\s+/)[0] || 'bonjour'

    if (appointment.prospect_phone) {
      try {
        const message = buildBookingSms(
          firstName,
          dateStr,
          appointment.meeting_type || null,
          appointment.meeting_link || null,
        )
        const smsResult = await sendSms(appointment.prospect_phone, message)
        if (smsResult.ok) {
          await db
            .from('rdv_appointments')
            .update({ sms_booking_sent_at: new Date().toISOString() })
            .eq('id', id)
        } else {
          console.error('[appointments PATCH reschedule] Booking SMS failed:', smsResult.error)
        }
      } catch (e) {
        console.error('[appointments PATCH reschedule] Booking SMS exception:', e)
      }
    }

    if (appointment.prospect_email) {
      try {
        const emailResult = await sendBookingConfirmationEmail(
          { prospectEmail: appointment.prospect_email, emailParent: appointment.email_parent || null },
          firstName,
          dateStr,
          appointment.meeting_type || null,
          appointment.meeting_link || null,
          id,
        )
        if (!emailResult.ok) {
          console.error('[appointments PATCH reschedule] Booking email failed:', emailResult.error)
        }
      } catch (e) {
        console.error('[appointments PATCH reschedule] Booking email exception:', e)
      }
    }

    // Aligner la date de la transaction liée (closedate = start_at). Best-effort.
    if (appointment.hubspot_deal_id) {
      try {
        await db
          .from('crm_deals')
          .update({ closedate: start_at, synced_at: new Date().toISOString() })
          .eq('hubspot_deal_id', appointment.hubspot_deal_id)
      } catch (e) {
        console.error(`[appointments PATCH] Sync closedate deal échouée pour ${id}:`, e)
      }
    }

    // Recharger pour inclure sms_booking_sent_at si mis à jour
    const { data: finalRow } = await db.from('rdv_appointments').select().eq('id', id).single()
    return NextResponse.json(finalRow ?? updated)
  }

  // === CAS 1 : ASSIGNATION / RÉASSIGNATION (Pascal assigne à un closer) ===
  if (commercial_id !== undefined) {
    // Vérifier disponibilité du closer au créneau (sauf en mode réassignation forcée)
    if (!reassign) {
      const { data: conflict } = await db
        .from('rdv_appointments')
        .select('id')
        .eq('commercial_id', commercial_id)
        .neq('status', 'annule')
        .neq('id', id)
        .lt('start_at', appointment.start_at)
        .gt('end_at', appointment.start_at)
        .limit(1)

      if (conflict && conflict.length > 0) {
        return NextResponse.json({ error: 'Le closer a déjà un RDV à ce créneau' }, { status: 409 })
      }
    }

    // En réassignation : garder le statut actuel ; en assignation initiale : forcer 'confirme'
    const newStatus = reassign ? appointment.status : 'confirme'

    const { data: updated, error: updateErr } = await db
      .from('rdv_appointments')
      .update({
        commercial_id,
        status: newStatus,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // ── Propager le closer assigné vers le CRM ──────────────────────────────
    // Quand Pascal assigne/réassigne un RDV à un closer, on met à jour la
    // propriété "closer" de la fiche contact (closer_du_contact_owner_id) et
    // l'owner de la transaction liée, pour que la fiche reflète le closer.
    // Best-effort : n'impacte pas la réponse en cas d'échec.
    try {
      // 1. owner HubSpot du closer assigné (null si désassignation)
      let closerOwnerId: string | null = null
      if (commercial_id) {
        const { data: closer } = await db
          .from('rdv_users')
          .select('hubspot_owner_id')
          .eq('id', commercial_id)
          .maybeSingle()
        closerOwnerId = closer?.hubspot_owner_id || null
      }

      // 2. Résoudre la fiche contact : id direct, sinon email, sinon téléphone
      let contactId: string | null = appointment.hubspot_contact_id || null
      if (!contactId) {
        const email = (appointment.prospect_email || '').trim().toLowerCase()
        if (email) {
          const { data: byEmail } = await db
            .from('crm_contacts')
            .select('hubspot_contact_id')
            .ilike('email', email)
            .maybeSingle()
          contactId = byEmail?.hubspot_contact_id || null
        }
      }
      if (!contactId && appointment.prospect_phone) {
        const digits = String(appointment.prospect_phone).replace(/\D/g, '')
        if (digits.length >= 9) {
          const last9 = digits.slice(-9)
          const variants = [`+33${last9}`, `0${last9}`, digits, `+${digits}`]
          const { data: byPhone } = await db
            .from('crm_contacts')
            .select('hubspot_contact_id')
            .in('phone', variants)
            .maybeSingle()
          contactId = byPhone?.hubspot_contact_id || null
        }
      }

      // 3. Mettre à jour la fiche contact + lier l'id au RDV s'il manquait
      if (contactId) {
        await db
          .from('crm_contacts')
          .update({
            closer_du_contact_owner_id: closerOwnerId,
            synced_at: new Date().toISOString(),
          })
          .eq('hubspot_contact_id', contactId)

        if (!appointment.hubspot_contact_id) {
          await db
            .from('rdv_appointments')
            .update({ hubspot_contact_id: contactId })
            .eq('id', id)
        }
      }

      // 4. Aligner l'owner de la transaction liée sur le closer
      if (appointment.hubspot_deal_id) {
        await db
          .from('crm_deals')
          .update({ hubspot_owner_id: closerOwnerId, synced_at: new Date().toISOString() })
          .eq('hubspot_deal_id', appointment.hubspot_deal_id)
      }
    } catch (e) {
      console.error(`[appointments PATCH] Propagation closer CRM échouée pour ${id}:`, e)
    }

    return NextResponse.json(updated)
  }

  // === CAS 2c : SUIVI TÉLÉPRO SEULEMENT ===
  if (telepro_suivi !== undefined && status === undefined && notes === undefined) {
    const validSuivi = ['ne_repond_plus', 'a_travailler', 'pre_positif', null]
    if (!validSuivi.includes(telepro_suivi)) {
      return NextResponse.json({ error: 'Valeur suivi invalide' }, { status: 400 })
    }
    const { data, error } = await db
      .from('rdv_appointments')
      .update({
        telepro_suivi: telepro_suivi || null,
        telepro_suivi_at: telepro_suivi ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // === CAS 2b : NOTE INTERNE SEULEMENT (pas de statut) ===
  if (notes !== undefined && status === undefined && email_parent === undefined) {
    const { data, error } = await db
      .from('rdv_appointments')
      .update({ notes: notes || null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // === CAS 2d : EMAIL PARENT SEULEMENT ===
  if (email_parent !== undefined && status === undefined && notes === undefined) {
    const { data, error } = await db
      .from('rdv_appointments')
      .update({ email_parent: email_parent || null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  }

  // === CAS 2 : MISE À JOUR STATUT ===
  const validStatuses = [
    'non_assigne', 'confirme', 'confirme_prospect',
    'no_show', 'annule',
    'a_travailler', 'pre_positif', 'positif', 'negatif',
    // Legacy
    'va_reflechir', 'preinscription',
  ]
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = { status }
  if (notes !== undefined) updatePayload.notes = notes || null
  if (report_summary !== undefined) updatePayload.report_summary = report_summary || null
  if (report_telepro_advice !== undefined) updatePayload.report_telepro_advice = report_telepro_advice || null
  if (negatif_reason !== undefined) updatePayload.negatif_reason = negatif_reason || null
  if (negatif_reason_detail !== undefined) updatePayload.negatif_reason_detail = negatif_reason_detail || null
  if (interlocuteur_principal !== undefined) updatePayload.interlocuteur_principal = interlocuteur_principal || null
  if (consigne_text !== undefined) updatePayload.consigne_text = consigne_text || null
  if (consigne_echeance !== undefined) updatePayload.consigne_echeance = consigne_echeance || null
  if (consigne_rien_a_faire !== undefined) updatePayload.consigne_rien_a_faire = consigne_rien_a_faire
  if (contexte_concurrence !== undefined) updatePayload.contexte_concurrence = contexte_concurrence || null
  if (financement !== undefined) updatePayload.financement = financement || null
  if (jpo_invitation !== undefined) updatePayload.jpo_invitation = jpo_invitation || null
  if (email_parent !== undefined) updatePayload.email_parent = email_parent || null

  const { data, error } = await db
    .from('rdv_appointments')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Règle métier : un RDV marqué "No-show" fait passer le statut du lead
  // (hs_lead_status du contact) en "A replanifier". Best-effort — n'impacte
  // pas la réponse si la mise à jour CRM échoue.
  if (status === 'no_show' && appointment.hubspot_contact_id) {
    try {
      await db
        .from('crm_contacts')
        .update({ hs_lead_status: 'A replanifier', synced_at: new Date().toISOString() })
        .eq('hubspot_contact_id', appointment.hubspot_contact_id)
    } catch (e) {
      console.error(`[appointments PATCH] Update lead status (no_show) failed for ${id}:`, e)
    }
  }

  return NextResponse.json(data)
}

// DELETE /api/appointments/:id — Soft delete (annulation)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()

  const { error } = await db
    .from('rdv_appointments')
    .update({ status: 'annule' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
