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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params

  // ?phase=core    → renvoie uniquement les donnees critiques pour le 1er
  //                  paint (contact, deals, tasks, formSubmissions,
  //                  preInscriptions). Skippe SMS / email_events / email
  //                  campaigns / detection doublons gmail.
  // ?phase=extended → renvoie uniquement les sections lentes (SMS history,
  //                   email campaigns, emailStatsByMessageId). Le frontend
  //                   les charge en arriere-plan apres le 1er paint.
  // (pas de phase) → tout (legacy, retro-compat).
  const phase = req.nextUrl.searchParams.get('phase') ?? ''
  const wantCore = phase !== 'extended'
  const wantExtended = phase !== 'core'

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
  // La detection de doublons gmail est uniquement utile pour agreger les
  // pre_inscriptions cross-fiches. On la skippe en phase=core et en
  // phase=extended pour gagner ~50-150ms ; elle ne tourne que quand on
  // demande la reponse complete (pas de query param).
  if (normalized && !phase) {
    const at = normalized.lastIndexOf('@')
    const domain = at >= 0 ? normalized.slice(at + 1) : ''
    if (domain) {
      // Limite reduite a 500 candidats : pour 99% des emails non-gmail il
      // n'y a quasiment pas de candidats. Pour gmail/yahoo on accepte de
      // potentiellement rater quelques doublons rares au profit de la vitesse.
      const { data: candidates } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, email')
        .ilike('email', `%@${domain}`)
        .limit(500)
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

  // CORE queries (1er paint) :
  //   deals, activities (limit 100), formSubmissions, tasks, preInscriptions
  // EXTENDED queries (charge en arriere-plan, plus lourd) :
  //   email_events (limit 200), smsRecipients (200), emailRecipients (200)
  // Limites reduites par rapport a v1 (200 -> 100 pour activities, 500 -> 200
  // pour email_events) — les sections affichent les plus recents, le user
  // peut paginer/scroller s'il en veut plus.
  const emptyArr = Promise.resolve([] as Array<Record<string, unknown>>)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emptyDealRes: any = Promise.resolve({ data: [] })

  const [
    dealsRes,
    activities,
    formSubmissions,
    tasks,
    emailEvents,
    preInscriptions,
    smsRecipients,
    emailRecipients,
  ] = await Promise.all([
    wantCore
      ? db.from('crm_deals').select('*')
          .eq('hubspot_contact_id', contactId)
          .order('createdate', { ascending: false })
      : emptyDealRes,

    wantCore
      ? safeRows(db.from('crm_activities')
          .select('id, hubspot_engagement_id, activity_type, subject, body, direction, status, owner_id, metadata, occurred_at, hubspot_deal_id')
          .eq('hubspot_contact_id', contactId)
          .order('occurred_at', { ascending: false })
          .limit(100))
      : emptyArr,

    wantCore
      ? safeRows(db.from('crm_form_submissions')
          .select('id, form_id, form_title, form_type, page_url, values, submitted_at')
          .eq('hubspot_contact_id', contactId)
          .order('submitted_at', { ascending: false }))
      : emptyArr,

    wantCore
      ? safeRows(db.from('crm_tasks')
          .select('id, title, description, owner_id, status, priority, task_type, due_at, completed_at, created_at, hubspot_deal_id')
          .eq('hubspot_contact_id', contactId)
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(100))
      : emptyArr,

    (wantExtended && contact.email)
      ? safeRows(db.from('email_events')
          .select('event_type, occurred_at, event_data')
          .eq('email', contact.email)
          .order('occurred_at', { ascending: false })
          .limit(200))
      : emptyArr,

    // Pre_inscriptions agregees de TOUS les contacts dupliques (meme email
    // normalise). Quand !phase, linkedContactIds contient les doublons. Sinon
    // juste le contact courant.
    wantCore
      ? safeRows(db.from('crm_pre_inscriptions')
          .select('id, hubspot_contact_id, saison, detected_at, paiement_status, formation, montant, notes, external_data, updated_at')
          .in('hubspot_contact_id', linkedContactIds)
          .order('saison', { ascending: false }))
      : emptyArr,

    wantExtended
      ? safeRows(db.from('sms_campaign_recipients')
          .select('id, campaign_id, phone, rendered_message, status, sms_factor_ticket, error_message, segments_count, sent_at, created_at')
          .eq('hubspot_contact_id', contactId)
          .order('sent_at', { ascending: false, nullsFirst: false })
          .limit(200))
      : emptyArr,

    wantExtended
      ? safeRows(db.from('email_campaign_recipients')
          .select('id, campaign_id, contact_id, email, status, error_message, sent_at, delivered_at, first_open_at, last_open_at, open_count, first_click_at, last_click_at, click_count, brevo_message_id, created_at')
          .in('contact_id', linkedContactIds)
          .order('sent_at', { ascending: false, nullsFirst: false })
          .limit(200))
      : emptyArr,
  ])

  const deals = dealsRes.data ?? []

  // Fallback robuste:
  // certains contacts natifs (NATIVE_*) ont leurs soumissions dans `form_submissions`
  // (data._contact_id) mais pas encore répliquées dans `crm_form_submissions`.
  // On les remonte ici pour éviter une timeline vide.
  let normalizedFormSubmissions = [...(formSubmissions ?? [])]
  if (wantCore) {
    const hasCrmFormRows = normalizedFormSubmissions.length > 0
    if (!hasCrmFormRows) {
      const fallbackRows: Array<Record<string, unknown>> = []
      for (const cid of linkedContactIds) {
        const rows = await safeRows(
          db.from('form_submissions')
            .select('id, form_id, data, source_url, utm_source, utm_medium, utm_campaign, submitted_at')
            .filter('data->>_contact_id', 'eq', cid)
            .order('submitted_at', { ascending: false })
            .limit(80)
        )
        fallbackRows.push(...rows)
      }

      // Extra fallback: certains anciens forms ne stockent pas _contact_id
      // (ou l'ont perdu), on tente un match email exact en best-effort.
      if (fallbackRows.length === 0 && contact.email) {
        const byEmailRows = await safeRows(
          db.from('form_submissions')
            .select('id, form_id, data, source_url, utm_source, utm_medium, utm_campaign, submitted_at')
            .filter('data->>email', 'eq', String(contact.email).toLowerCase())
            .order('submitted_at', { ascending: false })
            .limit(50)
        )
        fallbackRows.push(...byEmailRows)
      }

      // Fallback Meta Lead Ads: certaines fiches NATIVE_META_* n'ont ni
      // crm_form_submissions ni form_submissions, mais ont meta_lead_events.
      if (fallbackRows.length === 0) {
        const metaRows = await safeRows(
          db.from('meta_lead_events')
            .select('id, form_id, field_data, processed_at')
            .eq('contact_id', contactId)
            .order('processed_at', { ascending: false })
            .limit(80)
        )
        if (metaRows.length > 0) {
          const metaFormIds = [...new Set(
            metaRows
              .map(r => String(r.form_id ?? ''))
              .filter(Boolean)
          )]
          let metaFormNameById = new Map<string, string>()
          if (metaFormIds.length > 0) {
            const metaForms = await safeRows(
              db.from('meta_lead_forms')
                .select('form_id, name')
                .in('form_id', metaFormIds)
            )
            metaFormNameById = new Map(
              metaForms.map(f => [String(f.form_id), String(f.name ?? '')])
            )
          }

          const metaFieldDataToValues = (raw: unknown): Record<string, unknown> => {
            if (!Array.isArray(raw)) return {}
            const out: Record<string, unknown> = {}
            for (const item of raw as Array<Record<string, unknown>>) {
              const name = String(item?.name ?? '').trim()
              if (!name) continue
              const values = item?.values
              if (Array.isArray(values)) {
                const cleaned = values.map(v => String(v)).filter(Boolean)
                out[name] = cleaned.length <= 1 ? (cleaned[0] ?? '') : cleaned.join(', ')
              } else if (values !== null && values !== undefined) {
                out[name] = String(values)
              }
            }
            return out
          }

          for (const r of metaRows) {
            const fid = String(r.form_id ?? '')
            fallbackRows.push({
              id: `meta_${String(r.id ?? '')}`,
              form_id: fid,
              data: metaFieldDataToValues(r.field_data),
              source_url: null,
              submitted_at: r.processed_at,
              _meta_form_title: metaFormNameById.get(fid) || fid || 'Meta Lead Ads',
              _fallback_type: 'meta_lead_events_fallback',
            })
          }
        }
      }

      if (fallbackRows.length > 0) {
        const formIds = [...new Set(
          fallbackRows
            .map(r => String(r.form_id ?? ''))
            .filter(Boolean)
        )]
        let formNameById = new Map<string, string>()
        if (formIds.length > 0) {
          const formsMeta = await safeRows(
            db.from('forms')
              .select('id, name')
              .in('id', formIds)
          )
          formNameById = new Map(
            formsMeta.map(f => [String(f.id), String(f.name ?? '')])
          )
        }

        normalizedFormSubmissions = fallbackRows.map((r) => {
          const fid = String(r.form_id ?? '')
          const submittedAt = String(r.submitted_at ?? '')
          const resolvedTitle = String((r._meta_form_title ?? formNameById.get(fid) ?? fid ?? 'Formulaire web'))
          return {
            id: `fallback_${String(r.id ?? '')}`,
            form_id: fid,
            form_title: resolvedTitle,
            form_type: String(r._fallback_type ?? 'form_submissions_fallback'),
            page_url: r.source_url ?? null,
            values: r.data ?? {},
            submitted_at: submittedAt,
          }
        })
      }
    }
  }

  // 2-bis. SMS history : pour chaque message envoye au contact, on rapatrie
  // la campagne (nom, sender, type) + les liens trackes du destinataire avec
  // leurs clics (compteur agrege + log brut).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smsRecipientsArr = (smsRecipients ?? []) as Array<any>
  const recipientIds = smsRecipientsArr.map(r => r.id).filter(Boolean) as string[]
  const campaignIds = [...new Set(smsRecipientsArr.map(r => r.campaign_id).filter(Boolean) as string[])]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let campaignsArr: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokensArr: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clicksArr: any[] = []

  if (campaignIds.length > 0) {
    const { data } = await db
      .from('sms_campaigns')
      .select('id, name, sender, campaign_type, message')
      .in('id', campaignIds)
    campaignsArr = data ?? []
  }

  if (recipientIds.length > 0) {
    const { data } = await db
      .from('sms_campaign_link_tokens')
      .select('id, recipient_id, placeholder, label, original_url, click_count, first_clicked_at, last_clicked_at')
      .in('recipient_id', recipientIds)
    tokensArr = data ?? []
    const tokenIds = tokensArr.map(t => t.id).filter(Boolean) as string[]
    if (tokenIds.length > 0) {
      const { data: clicksData } = await db
        .from('sms_campaign_link_clicks')
        .select('token_id, clicked_at, ip, user_agent')
        .in('token_id', tokenIds)
        .order('clicked_at', { ascending: false })
        .limit(2000)
      clicksArr = clicksData ?? []
    }
  }

  const campaignById = new Map<string, { id: string; name: string | null; sender: string | null; campaign_type: string | null }>()
  for (const c of campaignsArr) campaignById.set(c.id as string, c)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokensByRecipient: Record<string, any[]> = {}
  for (const t of tokensArr) {
    const rid = t.recipient_id as string
    if (!tokensByRecipient[rid]) tokensByRecipient[rid] = []
    tokensByRecipient[rid].push(t)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clicksByToken: Record<string, any[]> = {}
  for (const c of clicksArr) {
    const tid = c.token_id as string
    if (!clicksByToken[tid]) clicksByToken[tid] = []
    clicksByToken[tid].push(c)
  }

  const smsMessages = smsRecipientsArr.map(r => {
    const camp = campaignById.get(r.campaign_id as string) ?? null
    const tokens = tokensByRecipient[r.id as string] ?? []
    const links = tokens.map(t => ({
      placeholder: t.placeholder,
      label: t.label,
      original_url: t.original_url,
      click_count: t.click_count ?? 0,
      first_clicked_at: t.first_clicked_at,
      last_clicked_at: t.last_clicked_at,
      clicks: (clicksByToken[t.id as string] ?? []).map(c => ({
        clicked_at: c.clicked_at,
        ip: c.ip,
        user_agent: c.user_agent,
      })),
    }))
    const totalClicks = links.reduce((acc, l) => acc + (l.click_count ?? 0), 0)
    return {
      id: r.id,
      campaign_id: r.campaign_id,
      phone: r.phone,
      sent_at: r.sent_at,
      created_at: r.created_at,
      status: r.status,
      rendered_message: r.rendered_message,
      error_message: r.error_message,
      segments_count: r.segments_count,
      campaign: camp ? {
        id: camp.id,
        name: camp.name,
        sender: camp.sender,
        campaign_type: camp.campaign_type,
      } : null,
      links,
      total_clicks: totalClicks,
    }
  })

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
  // Aggrege en plus les URLs cliquees par messageId : { url: { count, events: [{ at, ip?, ua? }] } }
  const clicksByUrlByMessageId: Record<string, Record<string, { count: number; events: Array<{ at: string; ip?: string | null; ua?: string | null }> }>> = {}

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

    // Click : extrait l'URL cliquee depuis event_data.link (Brevo) ou .url
    if (t === 'click' || t === 'clicks' || t === 'unique_clicked') {
      const url = (data?.link || data?.url || data?.URL) as string | undefined
      if (url) {
        if (!clicksByUrlByMessageId[key]) clicksByUrlByMessageId[key] = {}
        if (!clicksByUrlByMessageId[key][url]) clicksByUrlByMessageId[key][url] = { count: 0, events: [] }
        clicksByUrlByMessageId[key][url].count++
        clicksByUrlByMessageId[key][url].events.push({
          at: occurredAt,
          ip: (data?.ip as string | undefined) ?? null,
          ua: (data?.user_agent as string | undefined) ?? (data?.ua as string | undefined) ?? null,
        })
      }
    }
  }

  // 4-bis. Email campaigns : pour chaque destinataire-campagne, recupere les
  // infos de la campagne + agrege les URLs cliquees.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailRecipientsArr = (emailRecipients ?? []) as Array<any>
  const emailCampaignIds = [...new Set(emailRecipientsArr.map(r => r.campaign_id).filter(Boolean) as string[])]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emailCampaignsArr: any[] = []
  if (emailCampaignIds.length > 0) {
    const { data } = await db
      .from('email_campaigns')
      .select('id, name, subject, sender_name, sender_email')
      .in('id', emailCampaignIds)
    emailCampaignsArr = data ?? []
  }
  const emailCampaignById = new Map<string, { id: string; name: string | null; subject: string | null; sender_name: string | null; sender_email: string | null }>()
  for (const c of emailCampaignsArr) emailCampaignById.set(c.id as string, c)

  const emailCampaigns = emailRecipientsArr.map(r => {
    const camp = emailCampaignById.get(r.campaign_id as string) ?? null
    const msgId = r.brevo_message_id as string | null
    const stats = msgId ? emailStatsByMessageId[msgId] : undefined
    const linkClicks = msgId && clicksByUrlByMessageId[msgId] ? clicksByUrlByMessageId[msgId] : {}
    const links = Object.entries(linkClicks)
      .map(([url, info]) => ({
        url,
        click_count: info.count,
        clicks: info.events.sort((a, b) => (a.at < b.at ? 1 : -1)),
      }))
      .sort((a, b) => b.click_count - a.click_count)
    return {
      id: r.id,
      campaign_id: r.campaign_id,
      contact_id: r.contact_id,
      email: r.email,
      status: r.status,
      error_message: r.error_message ?? null,
      sent_at: r.sent_at,
      delivered_at: r.delivered_at,
      first_open_at: r.first_open_at,
      last_open_at: r.last_open_at,
      open_count: r.open_count ?? 0,
      first_click_at: r.first_click_at,
      last_click_at: r.last_click_at,
      click_count: r.click_count ?? 0,
      brevo_message_id: msgId,
      created_at: r.created_at,
      campaign: camp ? {
        id: camp.id,
        name: camp.name,
        subject: camp.subject,
        sender_name: camp.sender_name,
        sender_email: camp.sender_email,
      } : null,
      stats: stats ? {
        sent: stats.sent,
        delivered: stats.delivered,
        opens: stats.opens,
        clicks: stats.clicks,
        bounces: stats.bounces,
        spam: stats.spam,
      } : null,
      links,
    }
  })

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

  // Reponse selon la phase :
  //  - core      : tout le critique (contact, deals, tasks, formSubmissions...)
  //  - extended  : uniquement les sections lentes (sms / email campaigns +
  //                emailStatsByMessageId)
  //  - (pas phase) : tout, retro-compat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = { contact }
  if (wantCore) {
    payload.deals = deals
    payload.appointments = appointments
    payload.activities = activities
    payload.formSubmissions = normalizedFormSubmissions
    payload.tasks = tasks
    payload.preInscriptions = dedupedPreInsc
    payload.duplicateContactIds = linkedContactIds.filter(id => id !== contactId)
  }
  if (wantExtended) {
    payload.emailStatsByMessageId = emailStatsByMessageId
    payload.smsMessages = smsMessages
    payload.emailCampaigns = emailCampaigns
  }
  payload.phase = phase || 'all'

  const response = NextResponse.json(payload)
  // SWR : navigateur reutilise pendant 10s, et entre 10s et 30s sert le
  // cache + revalide en arriere-plan. Couple au cache JS lib/client-cache,
  // les retours rapides sur la fiche sont quasi instantanes.
  response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
  return response
}
