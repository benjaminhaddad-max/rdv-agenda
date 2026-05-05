import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/[id]/details
 *
 * Charge les données SPÉCIFIQUES au contact en parallèle.
 * Les metadata partagées (properties / dealProperties / owners) sont servies
 * par /api/crm/metadata avec cache navigateur — pas dupliquées ici.
 *
 * Avant : ~1 MB par requête, ~800ms-1s
 * Après : ~50 KB par requête, ~150-300ms
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params

  // 1. Contact (séquentiel — il faut savoir s'il existe + récupérer l'email)
  const { data: contact, error: contactErr } = await db
    .from('crm_contacts')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (contactErr || !contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // 1-bis. Detection des contacts dupliques (meme personne en plusieurs fiches HubSpot)
  // Cas typique : Gmail considere shyrel.betito1802 et shyrelbetito1802 comme la
  // meme boite (point ignore avant @gmail.com), mais HubSpot cree 2 fiches.
  // On normalise l'email (lowercase + strip dots pour gmail) et on retrouve tous
  // les contacts qui correspondent au meme. On agregera les pre_inscriptions.
  function normalizeEmail(e: string | null | undefined): string {
    if (!e) return ''
    const lower = e.trim().toLowerCase()
    const at = lower.lastIndexOf('@')
    if (at < 0) return lower
    const local = lower.slice(0, at)
    const domain = lower.slice(at + 1)
    // Strip dots (Gmail-style) uniquement pour gmail / googlemail
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return local.replace(/\./g, '') + '@' + domain
    }
    return lower
  }
  const normalized = normalizeEmail(contact.email as string | null)
  const linkedContactIds: string[] = [contactId]
  if (normalized) {
    // On rapatrie tous les contacts dont l'email NORMALISE matche.
    // Optimisation : on recupere par tranches d'emails plausibles (suffixe domaine)
    // mais simple : on filtre cote app via ilike domain.
    const at = normalized.lastIndexOf('@')
    const domain = at >= 0 ? normalized.slice(at + 1) : ''
    if (domain) {
      const { data: candidates } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, email')
        .ilike('email', `%@${domain}`)
        .limit(2000)
      for (const c of candidates ?? []) {
        if (c.hubspot_contact_id === contactId) continue
        if (normalizeEmail(c.email as string | null) === normalized) {
          linkedContactIds.push(c.hubspot_contact_id as string)
        }
      }
    }
  }

  // 2. Toutes les données spécifiques au contact en PARALLÈLE
  // Helper: convertit une PromiseLike Supabase en Promise<T[]> avec fallback []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeRows = async (q: any): Promise<Array<Record<string, unknown>>> => {
    try {
      const r = await q
      return r?.data ?? []
    } catch {
      return []
    }
  }

  const [
    dealsRes,
    activities,
    formSubmissions,
    tasks,
    emailEvents,
    preInscriptions,
  ] = await Promise.all([
    db.from('crm_deals').select('*')
      .eq('hubspot_contact_id', contactId)
      .order('createdate', { ascending: false }),

    safeRows(db.from('crm_activities')
      .select('id, hubspot_engagement_id, activity_type, subject, body, direction, status, owner_id, metadata, occurred_at, hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(200)),

    safeRows(db.from('crm_form_submissions')
      .select('id, form_id, form_title, form_type, page_url, values, submitted_at')
      .eq('hubspot_contact_id', contactId)
      .order('submitted_at', { ascending: false })),

    safeRows(db.from('crm_tasks')
      .select('id, title, description, owner_id, status, priority, task_type, due_at, completed_at, created_at, hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100)),

    contact.email
      ? safeRows(db.from('email_events')
          .select('event_type, occurred_at, event_data')
          .eq('email', contact.email)
          .order('occurred_at', { ascending: false })
          .limit(500))
      : Promise.resolve([] as Array<Record<string, unknown>>),

    // Agrege les pre_inscriptions de TOUS les contacts dupliques (meme email normalise)
    safeRows(db.from('crm_pre_inscriptions')
      .select('id, hubspot_contact_id, saison, detected_at, paiement_status, formation, montant, notes, external_data, updated_at')
      .in('hubspot_contact_id', linkedContactIds)
      .order('saison', { ascending: false })),
  ])

  const deals = dealsRes.data ?? []

  // 3. Appointments — dépend de deals donc séquentiel après le Promise.all
  const apptIds = deals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => d.supabase_appt_id as string | null)
    .filter((v: string | null): v is string => !!v)

  let appointments: Array<Record<string, unknown>> = []
  if (apptIds.length > 0) {
    const { data: appts } = await db
      .from('rdv_appointments')
      .select('id, start_at, end_at, status, prospect_name, prospect_phone, prospect_email, notes, commercial_id')
      .in('id', apptIds)
    appointments = appts ?? []
  }

  // 4. Agrège email_events par messageId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailStatsByMessageId: Record<string, { sent: number; delivered: number; opens: number; clicks: number; bounces: number; spam: number; lastEventAt?: string; events: Array<{ type: string; at: string; data?: any }> }> = {}
  for (const ev of emailEvents) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (ev as any).event_data as any
    const msgId = data?.messageId || data?.message_id || data?.['message-id']
    if (!msgId) continue
    const key = String(msgId)
    if (!emailStatsByMessageId[key]) {
      emailStatsByMessageId[key] = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, spam: 0, events: [] }
    }
    const s = emailStatsByMessageId[key]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = String((ev as any).event_type || '').toLowerCase()
    if (t === 'sent' || t === 'request')                                  s.sent++
    else if (t === 'delivered')                                           s.delivered++
    else if (t === 'open' || t === 'opens' || t === 'opened' || t === 'unique_opened' || t === 'proxy_open') s.opens++
    else if (t === 'click' || t === 'clicks' || t === 'unique_clicked')   s.clicks++
    else if (t.includes('bounce'))                                        s.bounces++
    else if (t === 'spam' || t === 'complaint')                           s.spam++
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const occurredAt = (ev as any).occurred_at as string
    s.events.push({ type: t, at: occurredAt, data })
    if (!s.lastEventAt || occurredAt > s.lastEventAt) {
      s.lastEventAt = occurredAt
    }
  }

  // Note : properties / dealProperties / owners / groups ne sont plus inclus
  // ici. Ils sont servis par /api/crm/metadata (cache navigateur 5min).
  // La page contact fait fetch en parallèle des deux endpoints.
  // Dedupe pre_inscriptions par saison : si plusieurs contacts dupliques ont une
  // ligne pour la meme saison (ex : 25-26 sur fiche A, 25-26 sur fiche B
  // dupliquee), on garde la plus complete (formation/montant non null prioritaire,
  // puis updated_at le plus recent).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dedupedPreInsc = (() => {
    const bySaison = new Map<string, any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const pi of (preInscriptions ?? []) as any[]) {
      const existing = bySaison.get(pi.saison)
      if (!existing) { bySaison.set(pi.saison, pi); continue }
      // Score : 2 points si formation, 2 si montant, 1 si paiement_status, +recence
      const score = (p: any) =>
        (p.formation ? 2 : 0) + (p.montant != null ? 2 : 0) + (p.paiement_status ? 1 : 0)
      if (score(pi) > score(existing)) bySaison.set(pi.saison, pi)
      else if (score(pi) === score(existing) && pi.updated_at > existing.updated_at) bySaison.set(pi.saison, pi)
    }
    return [...bySaison.values()].sort((a, b) => (b.saison || '').localeCompare(a.saison || ''))
  })()

  return NextResponse.json({
    contact,
    deals,
    appointments,
    activities,
    formSubmissions,
    tasks,
    emailStatsByMessageId,
    preInscriptions: dedupedPreInsc,
    duplicateContactIds: linkedContactIds.filter(id => id !== contactId),
  })
}
