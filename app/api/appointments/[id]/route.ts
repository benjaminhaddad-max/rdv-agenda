import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createDeal, updateDealStage, updateDealOwner, updateContact, addNoteToEngagements, STAGES } from '@/lib/hubspot'

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
  } = body

  const db = createServiceClient()

  // Récupérer le RDV actuel (avec tous les champs nécessaires pour le deal)
  const { data: appointment, error: fetchErr } = await db
    .from('rdv_appointments')
    .select(`
      hubspot_deal_id, status, commercial_id,
      prospect_name, prospect_email, prospect_phone,
      start_at, formation_type,
      hubspot_contact_id, notes, departement, classe_actuelle, email_parent
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
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

    // Sync HubSpot : mettre à jour l'owner du deal existant, ou créer si absent
    const { data: closer } = await db
      .from('rdv_users')
      .select('hubspot_owner_id, name')
      .eq('id', commercial_id)
      .single()

    if (closer?.hubspot_owner_id) {
      try {
        if (appointment.hubspot_deal_id) {
          // Deal existe déjà → mettre à jour le propriétaire
          await updateDealOwner(appointment.hubspot_deal_id, closer.hubspot_owner_id)
          // En réassignation : ajouter une note dans HubSpot
          if (reassign) {
            await addNoteToEngagements({
              dealId: appointment.hubspot_deal_id,
              contactId: appointment.hubspot_contact_id || null,
              body: `🔄 RDV RÉASSIGNÉ\nNouveau closer : ${closer.name}\n(Réassignation manuelle par Pascal)`,
            })
          }
        } else {
          // Deal pas encore créé → le créer maintenant
          const enrichedNotes = [
            appointment.formation_type  ? `📚 Formation souhaitée : ${appointment.formation_type}` : '',
            appointment.departement     ? `📍 Département : ${appointment.departement}` : '',
            appointment.classe_actuelle ? `🎓 Classe actuelle : ${appointment.classe_actuelle}` : '',
            appointment.notes?.trim()   ? `\n📝 Notes d'appel :\n${appointment.notes}` : '',
          ].filter(Boolean).join('\n')

          const deal = await createDeal({
            prospectName: appointment.prospect_name,
            prospectEmail: appointment.prospect_email,
            prospectPhone: appointment.prospect_phone,
            ownerId: closer.hubspot_owner_id,
            appointmentDate: appointment.start_at,
            appointmentId: id,
            formationType: appointment.formation_type,
            hubspotContactId: appointment.hubspot_contact_id || null,
            callNotes: enrichedNotes || null,
          })

          await db
            .from('rdv_appointments')
            .update({ hubspot_deal_id: deal.id })
            .eq('id', id)

          updated.hubspot_deal_id = deal.id
        }
      } catch (e) {
        console.error('HubSpot deal sync on assign failed:', e)
      }
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

    // Sync HubSpot
    if (appointment.hubspot_contact_id && email_parent) {
      try {
        await updateContact(appointment.hubspot_contact_id, { email_parent })
      } catch (_e) {
        console.error('HubSpot email_parent update failed:', _e)
      }
    }
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

  // Sync HubSpot stage + note
  if (appointment.hubspot_deal_id && status !== 'non_assigne') {
    const stageMap: Record<string, keyof typeof STAGES> = {
      confirme: 'rdvPris',
      no_show: 'aReplanifier',
      annule: 'aReplanifier',
      a_travailler: 'delaiReflexion',
      pre_positif: 'delaiReflexion',
      positif: 'preinscription',
      negatif: 'fermePerdu',
      // Legacy
      va_reflechir: 'delaiReflexion',
      preinscription: 'preinscription',
    }
    const statusLabel: Record<string, string> = {
      no_show: '❌ NO-SHOW — À REPLANIFIER',
      annule: '🚫 RDV ANNULÉ — À REPLANIFIER',
      a_travailler: '📧 À TRAVAILLER — Mail PI + brochure',
      pre_positif: '🔥 PRÉ-POSITIF — Mail PI + brochure',
      positif: '🎉 POSITIF — Pré-inscription HubSpot',
      negatif: '💀 NÉGATIF — Rien à faire',
      confirme: '✅ RDV CONFIRMÉ',
    }
    try {
      if (stageMap[status]) {
        await updateDealStage(appointment.hubspot_deal_id, stageMap[status])
      }

      // Pour les statuts issus du RDV, le closer qui pose le statut devient propriétaire du deal + contact
      const closerStatuses = ['a_travailler', 'pre_positif', 'positif', 'negatif']
      if (closerStatuses.includes(status) && appointment.commercial_id) {
        const { data: closer } = await db
          .from('rdv_users')
          .select('hubspot_owner_id')
          .eq('id', appointment.commercial_id)
          .single()

        if (closer?.hubspot_owner_id) {
          await updateDealOwner(appointment.hubspot_deal_id, closer.hubspot_owner_id)
          if (appointment.hubspot_contact_id) {
            await updateContact(appointment.hubspot_contact_id, { hubspot_owner_id: closer.hubspot_owner_id })
          }
        }
      }

      // Ajouter une note avec le statut bien visible + rapport closer
      const negatifReasonLabels: Record<string, string> = {
        inscrit_autre_prepa: 'Inscrit autre prépa',
        pas_les_moyens: 'Pas les moyens (potentiel medibox)',
        reorientation: 'Réorientation',
        autre: 'Autre',
      }
      const concurrenceLabels: Record<string, string> = {
        bien_renseignee: 'Bien renseignée ou va le faire',
        peu_renseignee: 'Peu renseignée ou va pas trop regarder',
        pas_renseignee: 'Pas renseignée',
      }
      const noteLines = [
        `${statusLabel[status] || status.toUpperCase()}`,
        '─────────────────────────',
        report_summary ? `📝 Résumé du RDV :\n${report_summary}` : '',
        report_telepro_advice ? `\n💬 Conseil télépro :\n${report_telepro_advice}` : '',
        negatif_reason ? `\n❌ Raison négatif : ${negatifReasonLabels[negatif_reason] || negatif_reason}${negatif_reason_detail ? ` (${negatif_reason_detail})` : ''}` : '',
        interlocuteur_principal ? `\n👤 Interlocuteur : ${interlocuteur_principal === 'parent' ? 'Parent' : 'Étudiant'}` : '',
        consigne_text ? `📋 Consigne : ${consigne_text}${consigne_echeance ? ` — Échéance : ${consigne_echeance}` : ''}${consigne_rien_a_faire ? ' — Rien à faire' : ''}` : '',
        contexte_concurrence ? `\n🏆 Concurrence : ${concurrenceLabels[contexte_concurrence] || contexte_concurrence}` : '',
        financement ? `\n💰 Financement : ${financement === 'pas_de_probleme' ? 'Pas de problème' : 'Potentiel blocage financier'}` : '',
        jpo_invitation ? `\n🎓 JPO : ${jpo_invitation === 'oui' ? 'À inviter' : 'Pas besoin'}` : '',
      ].filter(Boolean).join('\n')

      await addNoteToEngagements({
        dealId: appointment.hubspot_deal_id,
        contactId: appointment.hubspot_contact_id || null,
        body: noteLines,
      })
    } catch (e) {
      console.error('HubSpot update failed:', e)
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
