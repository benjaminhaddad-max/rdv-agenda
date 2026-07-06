import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import { CONTACT_IDENTITY_COLUMNS, mergeSafeHubspotRaw } from '@/lib/crm-contact-write'
import { notifyFormSubmissionRecipients, parseNotifyEmails } from '@/lib/form-submission-notify'
import { valuesFromTokenPayload, verifyFormContactToken } from '@/lib/form-contact-link'
import {
  checkFormSubmitGuard,
  validateFormContactIdentity,
} from '@/lib/form-submit-guard'

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
  const clientIp = getClientIp(req)

  const body = await req.json().catch(() => ({}))
  const data = (body.data || {}) as Record<string, unknown>

  let forcedContactId: string | null = null
  const contactTokenRaw = typeof body.contact_token === 'string' ? body.contact_token.trim() : ''
  if (contactTokenRaw) {
    const tokenPayload = verifyFormContactToken(contactTokenRaw)
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Lien personnalisé invalide ou expiré' },
        { status: 400, headers: CORS_HEADERS },
      )
    }
    if (tokenPayload.slug && tokenPayload.slug !== slug) {
      return NextResponse.json(
        { error: 'Ce lien ne correspond pas à ce formulaire' },
        { status: 400, headers: CORS_HEADERS },
      )
    }
    forcedContactId = tokenPayload.cid
    const tokenValues = valuesFromTokenPayload(tokenPayload)
    for (const [k, v] of Object.entries(tokenValues)) {
      if (v && (!data[k] || String(data[k]).trim() === '')) data[k] = v
    }
    if (tokenValues.firstname && !data.firstname) data.firstname = tokenValues.firstname
    if (tokenValues.lastname && !data.lastname) data.lastname = tokenValues.lastname
    if (tokenValues.email && !data.email) data.email = tokenValues.email
    if (tokenValues.phone && !data.phone) data.phone = tokenValues.phone
  }

  const guard = checkFormSubmitGuard({
    req,
    hasContactToken: Boolean(forcedContactId),
    clientIp,
    slug,
  })
  if (!guard.ok) {
    if (guard.logAsSpam) {
      logger.warn('forms-submit-blocked', guard.reason, {
        slug,
        ip: clientIp,
        user_agent: req.headers.get('user-agent'),
        origin: req.headers.get('origin'),
      })
    }
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.status, headers: CORS_HEADERS },
    )
  }

  const identityCheck = validateFormContactIdentity(data, {
    utmSource: typeof body.utm_source === 'string' ? body.utm_source : null,
    sourceUrl: typeof body.source_url === 'string' ? body.source_url : null,
  })
  if (!identityCheck.ok) {
    if (identityCheck.logAsSpam) {
      logger.warn('forms-submit-blocked-identity', identityCheck.reason, {
        slug,
        ip: clientIp,
        email: data.email,
        phone: data.phone,
      })
    }
    return NextResponse.json(
      { error: identityCheck.reason },
      { status: identityCheck.status, headers: CORS_HEADERS },
    )
  }

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
      ip_address: clientIp,
      user_agent: req.headers.get('user-agent') || null,
    })
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
  }

  // 3. Validation des champs requis (identité masquée via token = valeurs déjà injectées)
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

  const shouldSyncContact =
    form.auto_create_contact !== false &&
    (forcedContactId || contactData.email || contactData.phone)

  if (shouldSyncContact) {
    let existing: {
      hubspot_contact_id: string
      first_conversion_date: string | null
      first_conversion_event_name: string | null
      recent_conversion_date: string | null
      recent_conversion_event: string | null
      recent_conversion_event_name: string | null
    } | null = null

    if (forcedContactId) {
      const { data: c } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name')
        .eq('hubspot_contact_id', forcedContactId)
        .maybeSingle()
      existing = c
      if (!existing) {
        return NextResponse.json(
          { error: 'Contact introuvable pour ce lien personnalisé' },
          { status: 404, headers: CORS_HEADERS },
        )
      }
    } else if (contactData.email) {
      const { data: c } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, first_conversion_date, first_conversion_event_name, recent_conversion_date, recent_conversion_event, recent_conversion_event_name')
        .eq('email', String(contactData.email).toLowerCase().trim())
        .maybeSingle()
      existing = c
    }
    if (!existing && !forcedContactId && contactData.phone) {
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
      const { data: existingRow } = await db
        .from('crm_contacts')
        .select(CONTACT_IDENTITY_COLUMNS.join(','))
        .eq('hubspot_contact_id', existing.hubspot_contact_id)
        .maybeSingle()
      const mergedContact = {
        ...((existingRow as unknown as Record<string, unknown>) ?? {}),
        ...updateData,
        hubspot_contact_id: existing.hubspot_contact_id,
      }
      updateData.hubspot_raw = mergeSafeHubspotRaw(mergedContact, {
        ...trackingForContactRaw,
        ...customRaw,
      })
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
      insertData.hubspot_raw = mergeSafeHubspotRaw(
        { ...insertData, hubspot_contact_id: nativeId },
        { ...trackingForContactRaw, ...customRaw },
      )
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

    // ── Garde-fou anti "fiche fantôme" ─────────────────────────────────────
    // Incident constaté (03/06/2026) : une fiche créée par ce endpoint s'est
    // retrouvée avec email/nom/téléphone à NULL alors que l'INSERT contenait
    // bien ces valeurs (search_vector + zone calculés le prouvaient). Cause
    // racine indéterminée (trigger / écriture concurrente). On relit donc la
    // fiche et, si un champ d'identité qu'on voulait écrire est absent, on le
    // ré-applique immédiatement + on loggue une alerte pour investigation.
    if (contactId) {
      const { data: persisted } = await db
        .from('crm_contacts')
        .select('email, phone, firstname, lastname, classe_actuelle, departement, recent_conversion_date, recent_conversion_event, first_conversion_date, first_conversion_event_name')
        .eq('hubspot_contact_id', contactId)
        .maybeSingle()
      const fieldLost = (col: string) => {
        const intended = contactData[col]
        return (
          intended !== undefined &&
          intended !== null &&
          String(intended).trim() !== '' &&
          (!persisted || persisted[col as keyof typeof persisted] == null)
        )
      }
      const lostCols = ['email', 'phone', 'firstname', 'lastname', 'classe_actuelle', 'departement'].filter(fieldLost)
      const conversionLost =
        Boolean(conversionMeta.recent_conversion_date) &&
        !persisted?.recent_conversion_date &&
        Boolean(persisted?.recent_conversion_event || conversionMeta.recent_conversion_event)
      if (lostCols.length > 0 || conversionLost) {
        const repair: Record<string, unknown> = {
          synced_at: new Date().toISOString(),
          ...conversionMeta,
        }
        for (const [k, v] of Object.entries(contactData)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') repair[k] = v
        }
        if (persisted) {
          repair.hubspot_raw = mergeSafeHubspotRaw(
            { ...persisted, ...repair, hubspot_contact_id: contactId },
            {},
          )
        }
        await db.from('crm_contacts').update(repair).eq('hubspot_contact_id', contactId)
        logger.error(
          'forms-submit-contact-fields-lost',
          new Error(
            conversionLost && lostCols.length === 0
              ? 'Dates de conversion absentes après écriture contact — réparé automatiquement'
              : 'Champs identité absents après écriture contact — réparé automatiquement',
          ),
          { form_id: form.id, contact_id: contactId, email: contactData.email, lost: lostCols.join(','), conversionLost },
        )
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
    ip_address:   clientIp,
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
      const { matchesNativeFormSubmittedWorkflow } = await import('@/lib/workflow-form-trigger')
      for (const wf of (workflows ?? [])) {
        const cfg = (wf.trigger_config ?? {}) as import('@/lib/workflow-form-trigger').FormSubmittedTriggerConfig
        if (!matchesNativeFormSubmittedWorkflow(cfg, { id: form.id, slug: form.slug })) continue
        await enrollContact(db, wf.id, contactId, { form_id: form.id, form_slug: form.slug, submission_id: submission.id })
      }
    } catch (e) {
      logger.error('forms-submit-workflow-trigger', e, {
        form_id: form.id, contact_id: contactId, submission_id: submission.id,
      })
    }
  }

  // 9. Notifie les emails configurés sur le formulaire.
  // Doit être await : en serverless (Vercel), un void/async fire-and-forget
  // est tué dès que la réponse HTTP part, avant l'envoi Brevo.
  const notifyRecipients = parseNotifyEmails(form.notify_emails)
  if (notifyRecipients.length > 0) {
    try {
      await notifyFormSubmissionRecipients({
        form,
        submissionId: submission.id,
        contactId,
        data: submissionData,
        fields: (fields || []) as Array<{ field_key?: string; label?: string | null }>,
        sourceUrl: submissionRow.source_url,
        utm: {
          utm_source: submissionRow.utm_source,
          utm_medium: submissionRow.utm_medium,
          utm_campaign: submissionRow.utm_campaign,
        },
      })
    } catch (e) {
      logger.error('forms-submit-notify-emails', e, {
        form_id: form.id,
        submission_id: submission.id,
        notify_emails: notifyRecipients,
      })
    }
  }

  return NextResponse.json(
    {
      ok: true,
      submission_id: submission.id,
      redirect_url: resolveRedirectTarget(form, data, (fields || []) as Array<{ field_key?: string; crm_field?: string | null }>),
      success_message: form.success_message || 'Merci, votre message a bien été envoyé !',
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
