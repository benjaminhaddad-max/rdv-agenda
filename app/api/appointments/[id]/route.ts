import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createDeal, updateDealStage, updateDealOwner, updateContact, addNoteToEngagements, STAGES } from '@/lib/hubspot'

// PATCH /api/appointments/:id — Mise à jour statut OU assignation à un closer
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { status, notes, commercial_id, report_summary, report_telepro_advice } = body

  const db = createServiceClient()

  // Récupérer le RDV actuel (avec tous les champs nécessaires pour le deal)
  const { data: appointment, error: fetchErr } = await db
    .from('rdv_appointments')
    .select(`
      hubspot_deal_id, status, commercial_id,
      prospect_name, prospect_email, prospect_phone,
      start_at, formation_type,
      hubspot_contact_id, notes, departement, classe_actuelle
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  // === CAS 1 : ASSIGNATION (Pascal assigne à un closer) ===
  if (commercial_id !== undefined) {
    // Vérifier disponibilité du closer au créneau
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

    const { data: updated, error: updateErr } = await db
      .from('rdv_appointments')
      .update({
        commercial_id,
        status: 'confirme',
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

  // === CAS 2b : NOTE INTERNE SEULEMENT (pas de statut) ===
  if (notes !== undefined && status === undefined) {
    const { data, error } = await db
      .from('rdv_appointments')
      .update({ notes: notes || null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // === CAS 2 : MISE À JOUR STATUT ===
  const validStatuses = [
    'non_assigne', 'confirme',
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
      const noteLines = [
        `${statusLabel[status] || status.toUpperCase()}`,
        '─────────────────────────',
        report_summary ? `📝 Résumé du RDV :\n${report_summary}` : '',
        report_telepro_advice ? `\n💬 Conseil télépro :\n${report_telepro_advice}` : '',
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
