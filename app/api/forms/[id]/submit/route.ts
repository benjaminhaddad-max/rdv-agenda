import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import { buildBookingConfig, getPascalUserId, validateBookingSlot, type MeetingType } from '@/lib/booking-forms'
import { assignCloserForSlot } from '@/lib/closer-assignment'
import { generateMeetingUrl } from '@/lib/livekit'
import { sendSms, buildBookingSms } from '@/lib/smsfactor'
import { sendBookingConfirmationEmail } from '@/lib/email-reminders'
import { format } from 'date-fns'
import { fr as dateFnsFr } from 'date-fns/locale'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/forms/[slug]/submit — Endpoint PUBLIC pour soumettre un formulaire
 *
 * Headers CORS : autorise toutes origines (nécessaire pour embeds sur sites externes)
 *
 * Body : {
 *   data: { [field_key]: value, ... },
 *   hp?: string,           // honeypot (doit être vide)
 *   source_url?: string,
 *   utm_source?: string, utm_medium?: string, utm_campaign?: string, ...
 * }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const DEFAULT_TERMINALE_REDIRECT = 'https://diploma-sante.fr/remerciement-candidature-formulaire/'
const DEFAULT_NON_TERMINALE_REDIRECT = 'https://diploma-sante.fr/remerciement-candidature/'

function normalizeForMatch(value: string | null | undefined): string {
  if (!value) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const CONDITIONAL_REDIRECT_EXCLUDED_FORMS = new Set([
  'ns - formulaire kit pass / las',
  'ns - formulaire "guide parcoursup 2026" - diploma sante',
  'ns - brochure diploma sante',
])

function isDiplomaConditionalRedirectEligible(form: { folder?: string | null; name?: string | null }): boolean {
  const folder = normalizeForMatch(form.folder ?? 'Diploma Santé')
  if (folder !== 'diploma sante') return false
  const name = normalizeForMatch(form.name)
  return !CONDITIONAL_REDIRECT_EXCLUDED_FORMS.has(name)
}

function resolveClasseActuelleValue(data: Record<string, unknown>, fields: Array<{ field_key?: string; crm_field?: string | null }>): string {
  for (const f of fields) {
    if (normalizeForMatch(f.crm_field) !== 'classe_actuelle') continue
    const key = String(f.field_key || '')
    if (!key) continue
    const value = data[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value)
  }

  const directClasse = data.classe_actuelle ?? data.classe
  if (directClasse !== undefined && directClasse !== null && String(directClasse).trim() !== '') {
    return String(directClasse)
  }

  for (const [k, v] of Object.entries(data)) {
    if (!k.toLowerCase().includes('classe')) continue
    if (v === undefined || v === null || String(v).trim() === '') continue
    return String(v)
  }

  return ''
}

function resolveRedirectTarget(
  form: {
    folder?: string | null
    name?: string | null
    redirect_file_url?: string | null
    redirect_url?: string | null
    conditional_redirect_enabled?: boolean | null
    conditional_redirect_terminale_url?: string | null
    conditional_redirect_non_terminale_url?: string | null
  },
  data: Record<string, unknown>,
  fields: Array<{ field_key?: string; crm_field?: string | null }>,
): string | null {
  const conditionalEnabled = typeof form.conditional_redirect_enabled === 'boolean'
    ? form.conditional_redirect_enabled
    : isDiplomaConditionalRedirectEligible(form)

  if (conditionalEnabled) {
    const classeRaw = resolveClasseActuelleValue(data, fields)
    const isTerminale = normalizeForMatch(classeRaw).includes('terminale')
    const terminaleTarget = String(form.conditional_redirect_terminale_url || '').trim() || DEFAULT_TERMINALE_REDIRECT
    const nonTerminaleTarget = String(form.conditional_redirect_non_terminale_url || '').trim() || DEFAULT_NON_TERMINALE_REDIRECT
    return isTerminale ? terminaleTarget : nonTerminaleTarget
  }

  const fileTarget = String(form.redirect_file_url || '').trim()
  if (fileTarget) return fileTarget
  const urlTarget = String(form.redirect_url || '').trim()
  return urlTarget || null
}
// Pré-flight CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request, { params }: Params) {
  // Le paramètre est nommé "id" pour conformité Next.js mais contient le slug
  const { id: slug } = await params
  const db = createServiceClient()

  const body = await req.json().catch(() => ({}))
  const data = (body.data || {}) as Record<string, unknown>

  // ── Attribution publicitaire ─────────────────────────────────────────────
  // Le frontend envoie {gclid, fbclid, msclkid, ttclid, li_fat_id, sccid,
  // gbraid, wbraid} depuis l'URL ou le cookie 90j pose par diploma-tracker.js
  // a la 1re visite. On les mappe sur les noms de proprietes que la fiche
  // contact (section "Tracking publicitaire") sait afficher.
  const rawAttribution = (body.attribution || {}) as Record<string, unknown>
  const cleanStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s.length ? s.slice(0, 500) : null
  }
  const adClickIds = {
    gclid:    cleanStr(rawAttribution.gclid),
    gbraid:   cleanStr(rawAttribution.gbraid),
    wbraid:   cleanStr(rawAttribution.wbraid),
    fbclid:   cleanStr(rawAttribution.fbclid),
    msclkid:  cleanStr(rawAttribution.msclkid),
    ttclid:   cleanStr(rawAttribution.ttclid),
    li_fat_id: cleanStr(rawAttribution.li_fat_id),
    sccid:    cleanStr(rawAttribution.sccid),
  }
  // Mapping vers les memes cles que HubSpot pour que la section "Tracking
  // publicitaire" sur la fiche contact affiche ces IDs sans modif UI.
  const trackingForContactRaw: Record<string, string> = {}
  if (adClickIds.gclid) {
    trackingForContactRaw.gclid = adClickIds.gclid
    trackingForContactRaw.hs_google_click_id = adClickIds.gclid
  }
  if (adClickIds.gbraid) trackingForContactRaw.gbraid = adClickIds.gbraid
  if (adClickIds.wbraid) trackingForContactRaw.wbraid = adClickIds.wbraid
  if (adClickIds.fbclid) {
    trackingForContactRaw.fbclid = adClickIds.fbclid
    trackingForContactRaw.hs_facebook_click_id = adClickIds.fbclid
  }
  if (adClickIds.msclkid)   trackingForContactRaw.hs_bing_click_id = adClickIds.msclkid
  if (adClickIds.ttclid)    trackingForContactRaw.hs_tiktok_click_id = adClickIds.ttclid
  if (adClickIds.li_fat_id) trackingForContactRaw.hs_linkedin_click_id = adClickIds.li_fat_id
  if (adClickIds.sccid)     trackingForContactRaw.lead_id_snapchat = adClickIds.sccid
  // UTM aussi recopiees dans hubspot_raw pour la section Tracking publicitaire
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
  for (const k of utmKeys) {
    const v = cleanStr((body as Record<string, unknown>)[k])
    if (v) trackingForContactRaw[k] = v
  }

  // ── Origine derivee du tracking ─────────────────────────────────────────
  // Regle metier : la presence d'un click ID Google (gclid / gbraid / wbraid)
  // ou Meta (fbclid) force l'origine du contact sur la campagne payante
  // correspondante. Google prime sur Meta si jamais les deux sont presents
  // (cas rare : navigation cross-pub avec cookie residuel).
  let origineFromTracking: string | null = null
  if (adClickIds.gclid || adClickIds.gbraid || adClickIds.wbraid) {
    origineFromTracking = 'Campagne ADS Google'
  } else if (adClickIds.fbclid) {
    origineFromTracking = 'Campagne ADS META'
  }

  // 1. Récupère le formulaire + ses champs
  const { data: form, error: fErr } = await db
    .from('forms')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (fErr || !form) {
    return NextResponse.json({ error: 'Formulaire introuvable ou non publié' }, { status: 404, headers: CORS_HEADERS })
  }

  const { data: fields } = await db
    .from('form_fields')
    .select('*')
    .eq('form_id', form.id)

  // 2. Anti-spam honeypot
  if (form.honeypot_enabled && body.hp) {
    // Bot détecté : on répond OK mais on marque comme spam et on ignore
    await db.from('form_submissions').insert({
      form_id: form.id,
      data,
      source_url: body.source_url || null,
      status: 'spam',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || null,
    })
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
  }

  // 3. Validation des champs requis
  const missingRequired: string[] = []
  for (const f of (fields || [])) {
    if (f.required) {
      const v = data[f.field_key]
      if (v === undefined || v === null || String(v).trim() === '') {
        missingRequired.push(f.label)
      }
    }
  }
  if (missingRequired.length > 0) {
    return NextResponse.json(
      { error: 'Oups, il manque quelques informations. Merci de remplir tous les champs obligatoires avant de soumettre le formulaire.' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // 3-bis. Validation booking : si form_type='booking', le body doit contenir
  // un créneau valide et un type de RDV autorisé. Le créneau doit toujours
  // être dispo (re-check côté serveur pour éviter les races).
  const isBookingForm = (form.form_type || 'lead') === 'booking'
  const bookingCfg = isBookingForm ? buildBookingConfig(form) : null
  let bookingSlotStart: string | null = null
  let bookingSlotEnd: string | null = null
  let bookingMeetingType: MeetingType | null = null
  let bookingOwnerId: string | null = null

  if (isBookingForm && bookingCfg) {
    const bookingPayload = (body.booking || {}) as { start?: string; end?: string; meeting_type?: string }
    const start = String(bookingPayload.start || '').trim()
    const end = String(bookingPayload.end || '').trim()
    const meetingType = String(bookingPayload.meeting_type || '').trim()
    if (!start || !end) {
      return NextResponse.json(
        { error: 'Merci de choisir un créneau pour confirmer votre rendez-vous.' },
        { status: 400, headers: CORS_HEADERS },
      )
    }
    if (!meetingType || !bookingCfg.meeting_types.includes(meetingType as MeetingType)) {
      return NextResponse.json(
        { error: 'Format de rendez-vous invalide.' },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    bookingOwnerId = bookingCfg.owner_user_id || (await getPascalUserId())
    if (!bookingOwnerId) {
      logger.error('forms-submit-booking-no-owner', new Error('booking_owner_missing'), { form_id: form.id })
      return NextResponse.json(
        { error: "Configuration manquante côté CRM (responsable du calendrier). Merci de nous contacter." },
        { status: 500, headers: CORS_HEADERS },
      )
    }

    const slotErr = await validateBookingSlot(bookingOwnerId, bookingCfg, start, end)
    if (slotErr) {
      return NextResponse.json({ error: slotErr }, { status: 409, headers: CORS_HEADERS })
    }
    bookingSlotStart = start
    bookingSlotEnd = end
    bookingMeetingType = meetingType as MeetingType
  }

  // 4. Construit l'objet contact depuis les champs mappés crm_field
  //    Fallback : si crm_field est null mais field_key matche une colonne CRM
  //    connue, on mappe automatiquement (couvre 95% des forms HubSpot importés
  //    qui n'ont pas de crm_field renseigné).
  const AUTO_MAP_FIELDS: Record<string, string> = {
    firstname:           'firstname',
    lastname:            'lastname',
    email:               'email',
    phone:               'phone',
    mobilephone:         'phone',
    classe_actuelle:     'classe_actuelle',
    classe:              'classe_actuelle',
    departement:         'departement',
    department:          'departement',
    zone_localite:       'zone_localite',
    'zone___localite':   'zone_localite',
    zone:                'zone_localite',
    formation_souhaitee: 'formation_souhaitee',
    formation:           'formation_souhaitee',
    formation_demandee:  'formation_demandee',
    'diploma_sante___formation_demandee': 'formation_demandee',
    origine:             'origine',
    source:              'origine',
  }

  // Colonnes individuelles existant réellement dans crm_contacts.
  // Toute clé crm_field qui N'EST PAS dans cette whitelist est traitée comme
  // une propriété custom et stockée dans le JSONB hubspot_raw (pas besoin de
  // créer une colonne en base ni une propriété HubSpot pour mapper un form).
  const NATIVE_CONTACT_COLUMNS = new Set([
    'firstname', 'lastname', 'email', 'phone', 'mobilephone',
    'classe_actuelle', 'departement', 'zone_localite',
    'formation_souhaitee', 'formation_demandee',
    'origine', 'hs_lead_status', 'lifecyclestage',
    'company', 'jobtitle', 'website',
    'address', 'city', 'state', 'zip', 'country',
    'parent__tudiant', 'email_parent',
    'hubspot_owner_id',
  ])

  const contactData: Record<string, unknown> = {}
  const customRaw: Record<string, unknown> = {}
  for (const f of (fields || [])) {
    const value = data[f.field_key]
    if (value === undefined || value === null || String(value).trim() === '') continue
    // Priorité : crm_field explicite, sinon mapping auto par field_key
    const target = f.crm_field || AUTO_MAP_FIELDS[f.field_key]
    if (!target) continue
    if (NATIVE_CONTACT_COLUMNS.has(target)) {
      contactData[target] = value
    } else {
      // Propriété custom (créée via /admin/crm/proprietes ou nom HubSpot custom).
      // → on la stocke dans hubspot_raw JSONB, comme le fait l'API
      // /api/crm/contacts/[id]/prop pour les propriétés sans colonne dédiée.
      customRaw[target] = value
    }
  }

  // 5. Création/mise à jour du contact (si activé)
  let contactId: string | null = null
  let contactCreated = false

  // Création contact par défaut (sauf si explicitement désactivé : auto_create_contact === false)
  if (form.auto_create_contact !== false && (contactData.email || contactData.phone)) {
    // Cherche par email en priorité, sinon par téléphone (PK = hubspot_contact_id)
    let existing: {
      hubspot_contact_id: string
      first_conversion_date: string | null
      first_conversion_event_name: string | null
      recent_conversion_date: string | null
      recent_conversion_event: string | null
      recent_conversion_event_name: string | null
    } | null = null
    if (contactData.email) {
      const { data: c } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name')
        .eq('email', String(contactData.email).toLowerCase().trim())
        .maybeSingle()
      existing = c
    }
    if (!existing && contactData.phone) {
      const phoneClean = String(contactData.phone).replace(/\s+/g, '')
      const { data: c } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name')
        .eq('phone', phoneClean)
        .maybeSingle()
      existing = c
    }

    // Métadonnées de conversion à enregistrer / mettre à jour à chaque soumission
    const nowIso = new Date().toISOString()
    const conversionMeta = buildConversionFieldsForSubmission(
      nowIso,
      form.name || 'Formulaire web',
      existing,
    )

    if (existing) {
      // Met à jour le contact existant avec les nouvelles valeurs non vides
      const updateData: Record<string, unknown> = {
        ...conversionMeta,
        synced_at: nowIso,
      }
      for (const [k, v] of Object.entries(contactData)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          updateData[k] = v
        }
      }
      // Origine forcee si un click ID Google/Meta est present.
      // Le tracking publicitaire prime sur l'origine eventuellement remontee
      // par le formulaire (qui est souvent vide ou generique "Formulaire web").
      if (origineFromTracking) {
        updateData.origine = origineFromTracking
      }
      // Merge tracking publicitaire + champs custom dans hubspot_raw.
      // - Tracking pub : first-touch wins (on n'écrase pas un click ID déjà capté).
      // - Champs custom du form : last-touch wins (la dernière soumission gagne).
      const hasRawWrite =
        Object.keys(trackingForContactRaw).length > 0 ||
        Object.keys(customRaw).length > 0
      if (hasRawWrite) {
        const { data: existingRaw } = await db
          .from('crm_contacts')
          .select('hubspot_raw')
          .eq('hubspot_contact_id', existing.hubspot_contact_id)
          .maybeSingle()
        const currentRaw = (existingRaw?.hubspot_raw && typeof existingRaw.hubspot_raw === 'object')
          ? (existingRaw.hubspot_raw as Record<string, unknown>)
          : {}
        const mergedRaw: Record<string, unknown> = { ...currentRaw }
        for (const [k, v] of Object.entries(trackingForContactRaw)) {
          if (!mergedRaw[k]) mergedRaw[k] = v
        }
        for (const [k, v] of Object.entries(customRaw)) {
          mergedRaw[k] = v
        }
        updateData.hubspot_raw = mergedRaw
      }
      await db.from('crm_contacts').update(updateData).eq('hubspot_contact_id', existing.hubspot_contact_id)
      contactId = existing.hubspot_contact_id
    } else {
      // Crée le contact — génère un ID natif unique pour hubspot_contact_id (NOT NULL contrainte)
      const nativeId = 'NATIVE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
      const insertData: Record<string, unknown> = {
        ...contactData,
        ...conversionMeta,
        synced_at: nowIso,
        contact_createdate: nowIso,
        hubspot_contact_id: nativeId,
        hubspot_owner_id:   null,
        origine:            origineFromTracking ?? 'Formulaire web',
      }
      const initialRaw: Record<string, unknown> = { ...trackingForContactRaw, ...customRaw }
      if (Object.keys(initialRaw).length > 0) {
        insertData.hubspot_raw = initialRaw
      }
      const { data: created, error: cErr } = await db
        .from('crm_contacts')
        .insert(insertData)
        .select('hubspot_contact_id')
        .single()
      if (!cErr && created) {
        contactId = created.hubspot_contact_id
        contactCreated = true
      } else if (cErr) {
        logger.error('forms-submit-create-contact', cErr, { form_id: form.id, email: data.email })
      }
    }
  }

  // 6. Enregistre la soumission
  // contact_id est de type UUID dans form_submissions mais crm_contacts utilise hubspot_contact_id (text)
  // → on stocke l'ID texte dans la colonne `data._contact_id` à la place et on laisse contact_id null
  const trackingForSubmission: Record<string, string> = {}
  for (const [k, v] of Object.entries(adClickIds)) {
    if (v) trackingForSubmission[k] = v
  }
  const submissionData = {
    ...data,
    _contact_id: contactId,
    ...(Object.keys(trackingForSubmission).length > 0 ? { _tracking: trackingForSubmission } : {}),
  }
  const submissionRow = {
    form_id: form.id,
    data: submissionData,
    contact_id: null,
    contact_created: contactCreated,
    source_url: body.source_url || req.headers.get('referer') || null,
    referrer: req.headers.get('referer') || null,
    utm_source:   body.utm_source   || null,
    utm_medium:   body.utm_medium   || null,
    utm_campaign: body.utm_campaign || null,
    utm_term:     body.utm_term     || null,
    utm_content:  body.utm_content  || null,
    ip_address:   getClientIp(req),
    user_agent:   req.headers.get('user-agent') || null,
    status: 'new',
  }

  const { data: submission, error: sErr } = await db
    .from('form_submissions')
    .insert(submissionRow)
    .select()
    .single()

  if (sErr) {
    logger.error('forms-submit-insert', sErr, { form_id: form.id })
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la soumission" },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  // 7. Incrémente le compteur de soumissions (async, pas bloquant)
  db.rpc('increment_form_submissions', { form_id: form.id }).then(() => {}, () => {
    // Si la fonction RPC n'existe pas, on fait un update manuel
    db.from('forms')
      .update({ submission_count: (form.submission_count || 0) + 1 })
      .eq('id', form.id)
      .then(() => {}, () => {})
  })

  // 8. Déclenche les workflows liés à ce form (trigger_type='form_submitted')
  if (contactId) {
    try {
      const { enrollContact } = await import('@/lib/workflow-engine')
      const { data: workflows } = await db
        .from('crm_workflows')
        .select('id, trigger_config')
        .eq('status', 'active')
        .eq('trigger_type', 'form_submitted')
      for (const wf of (workflows ?? [])) {
        const cfg = (wf.trigger_config ?? {}) as { form_id?: string; form_slug?: string }
        // Match si trigger_config.form_id ou form_slug correspond, ou si pas de filtre (tous les forms)
        const matches =
          (!cfg.form_id && !cfg.form_slug) ||
          (cfg.form_id && cfg.form_id === form.id) ||
          (cfg.form_slug && cfg.form_slug === form.slug)
        if (matches) {
          await enrollContact(db, wf.id, contactId, { form_id: form.id, form_slug: form.slug, submission_id: submission.id })
        }
      }
    } catch (e) {
      logger.error('forms-submit-workflow-trigger', e, {
        form_id: form.id, contact_id: contactId, submission_id: submission.id,
      })
    }
  }

  // 9. Si form_type='booking' : crée le RDV dans `rdv_appointments`.
  //    Auto-attribué à Pascal (qui redispatche ensuite). Logique identique
  //    à /api/appointments POST (SMS + email + alerte file d'attente).
  let appointmentId: string | null = null
  let bookingMeetingLink: string | null = null
  if (isBookingForm && bookingSlotStart && bookingSlotEnd && bookingMeetingType && bookingOwnerId) {
    // Lien visio LiveKit auto-généré si nécessaire
    if (bookingMeetingType === 'visio') {
      bookingMeetingLink = generateMeetingUrl()
    }

    // Nom prospect : firstname + lastname si dispo, sinon email
    const firstname = String(contactData.firstname || data.firstname || '').trim()
    const lastname  = String(contactData.lastname  || data.lastname  || '').trim()
    const prospectName = [firstname, lastname].filter(Boolean).join(' ') || String(contactData.email || data.email || 'Prospect')
    const prospectEmail = String(contactData.email || data.email || '').trim()
    const prospectPhone = String(contactData.phone || data.phone || '').trim() || null
    const departement = contactData.departement ? String(contactData.departement) : null
    const classeActuelle = contactData.classe_actuelle ? String(contactData.classe_actuelle) : null
    const formationSouhaitee = (contactData.formation_souhaitee || contactData.formation_demandee) ? String(contactData.formation_souhaitee || contactData.formation_demandee) : (form.title || form.name || null)

    // Assignation automatique : on tente Pascal en priorité (même règle que /api/appointments)
    let assignedCommercialId: string | null = null
    let assignedOwnerHsId: string | null = null
    let autoAssignedToPascal = false
    try {
      const closer = await assignCloserForSlot(db, bookingSlotStart, bookingSlotEnd)
      if (closer) {
        assignedCommercialId = closer.id
        assignedOwnerHsId = closer.hubspot_owner_id
        autoAssignedToPascal = closer.isPascal
      }
    } catch (e) {
      logger.error('forms-submit-booking-assign', e, { form_id: form.id })
    }
    // Filet de secours : si pas de closer renvoyé, on tape sur l'owner du form (Pascal)
    if (!assignedCommercialId) assignedCommercialId = bookingOwnerId

    // Vérification conflit si on a un closer manuel (pas Pascal redispatch)
    if (assignedCommercialId && !autoAssignedToPascal) {
      const { data: conflict } = await db
        .from('rdv_appointments')
        .select('id')
        .eq('commercial_id', assignedCommercialId)
        .neq('status', 'annule')
        .lt('start_at', bookingSlotEnd)
        .gt('end_at', bookingSlotStart)
        .limit(1)
      if (conflict && conflict.length > 0) {
        return NextResponse.json(
          { error: 'Ce créneau vient d\'être réservé. Choisissez-en un autre.' },
          { status: 409, headers: CORS_HEADERS },
        )
      }
    }

    // Insertion du RDV (best-effort sur form_submission_id : si la colonne n'existe pas, on retire et on retente)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apptPayload: any = {
      commercial_id: assignedCommercialId,
      prospect_name: prospectName,
      prospect_email: prospectEmail,
      prospect_phone: prospectPhone,
      start_at: bookingSlotStart,
      end_at: bookingSlotEnd,
      status: assignedCommercialId ? 'confirme' : 'non_assigne',
      source: 'prospect',
      formation_type: formationSouhaitee,
      hubspot_contact_id: contactId || null,
      departement: departement,
      classe_actuelle: classeActuelle,
      notes: `Pris via formulaire CRM "${form.name}" (slug: ${form.slug}). Soumission ${submission.id}.`,
      meeting_type: bookingMeetingType,
      meeting_link: bookingMeetingLink,
      telepro_id: null,
      form_submission_id: submission.id,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let appointment: any = null
    {
      let r = await db.from('rdv_appointments').insert(apptPayload).select().single()
      if (r.error && String(r.error.message || '').toLowerCase().includes('form_submission_id')) {
        delete apptPayload.form_submission_id
        r = await db.from('rdv_appointments').insert(apptPayload).select().single()
      }
      if (r.error) {
        logger.error('forms-submit-booking-insert-appt', r.error, { form_id: form.id, submission_id: submission.id })
        return NextResponse.json(
          { error: 'Impossible d\'enregistrer le rendez-vous. Réessayez ou contactez-nous.' },
          { status: 500, headers: CORS_HEADERS },
        )
      }
      appointment = r.data
    }
    appointmentId = appointment?.id ?? null

    // Met à jour le contact : statut "RDV pris" + closer owner si assignation manuelle
    if (contactId) {
      try {
        const contactUpdate: Record<string, string> = {
          synced_at: new Date().toISOString(),
          hs_lead_status: 'RDV pris',
        }
        if (assignedOwnerHsId) contactUpdate.closer_du_contact_owner_id = assignedOwnerHsId
        await db.from('crm_contacts').update(contactUpdate).eq('hubspot_contact_id', contactId)
      } catch (e) {
        logger.error('forms-submit-booking-update-contact', e, { form_id: form.id, contact_id: contactId })
      }
    }

    // SMS de confirmation (best-effort)
    if (prospectPhone && appointment) {
      try {
        const startDate = new Date(bookingSlotStart)
        const dateStr = format(startDate, "EEEE d MMMM 'à' HH'h'mm", { locale: dateFnsFr })
        const firstName = String(prospectName).trim().split(/\s+/)[0] || 'bonjour'
        const message = buildBookingSms(firstName, dateStr, bookingMeetingType, bookingMeetingLink || null)
        const smsResult = await sendSms(prospectPhone, message)
        if (smsResult.ok) {
          await db.from('rdv_appointments')
            .update({ sms_booking_sent_at: new Date().toISOString() })
            .eq('id', appointment.id)
        }
      } catch (e) {
        logger.error('forms-submit-booking-sms', e, { form_id: form.id, appointment_id: appointment?.id })
      }
    }
    // Email de confirmation (best-effort)
    if (prospectEmail && appointment) {
      try {
        const startDate = new Date(bookingSlotStart)
        const dateStr = format(startDate, "EEEE d MMMM 'à' HH'h'mm", { locale: dateFnsFr })
        const firstName = String(prospectName).trim().split(/\s+/)[0] || 'bonjour'
        await sendBookingConfirmationEmail(
          { prospectEmail, emailParent: (contactData.email_parent ? String(contactData.email_parent) : null) || null },
          firstName,
          dateStr,
          bookingMeetingType,
          bookingMeetingLink || null,
          appointment.id,
        )
      } catch (e) {
        logger.error('forms-submit-booking-email', e, { form_id: form.id, appointment_id: appointment?.id })
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      submission_id: submission.id,
      redirect_url: resolveRedirectTarget(form, data, (fields || []) as Array<{ field_key?: string; crm_field?: string | null }>),
      success_message: form.success_message || 'Merci, votre message a bien été envoyé !',
      // Booking-only metadata (utilisé par le BookingRenderer pour la page de succès)
      booking: isBookingForm ? {
        appointment_id: appointmentId,
        start_at: bookingSlotStart,
        end_at: bookingSlotEnd,
        meeting_type: bookingMeetingType,
        meeting_link: bookingMeetingLink,
        location_label: bookingCfg?.location_label || null,
      } : null,
    },
    { status: 200, headers: CORS_HEADERS }
  )
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = req.headers.get('x-real-ip')
  return xri || null
}
