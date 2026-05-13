import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

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
      { error: `Champs requis manquants : ${missingRequired.join(', ')}` },
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
  const contactData: Record<string, unknown> = {}
  for (const f of (fields || [])) {
    const value = data[f.field_key]
    if (value === undefined || value === null || String(value).trim() === '') continue
    // Priorité : crm_field explicite, sinon mapping auto par field_key
    const target = f.crm_field || AUTO_MAP_FIELDS[f.field_key]
    if (target) {
      contactData[target] = value
    }
  }

  // 5. Création/mise à jour du contact (si activé)
  let contactId: string | null = null
  let contactCreated = false

  // Création contact par défaut (sauf si explicitement désactivé : auto_create_contact === false)
  if (form.auto_create_contact !== false && (contactData.email || contactData.phone)) {
    // Cherche par email en priorité, sinon par téléphone (PK = hubspot_contact_id)
    let existing: { hubspot_contact_id: string } | null = null
    if (contactData.email) {
      const { data: c } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .eq('email', String(contactData.email).toLowerCase().trim())
        .maybeSingle()
      existing = c
    }
    if (!existing && contactData.phone) {
      const phoneClean = String(contactData.phone).replace(/\s+/g, '')
      const { data: c } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .eq('phone', phoneClean)
        .maybeSingle()
      existing = c
    }

    // Métadonnées de conversion à enregistrer / mettre à jour à chaque soumission
    const nowIso = new Date().toISOString()
    const formBrand = form.folder || 'Diploma Santé'
    const conversionMeta = {
      recent_conversion_date:  nowIso,
      recent_conversion_event: form.name || 'Formulaire web',
      synced_at:               nowIso,
      brand:                   formBrand,
    }

    // Helper : retire le champ `brand` du payload si la colonne n'existe pas (compat)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripBrandIfNeeded = (err: any, payload: Record<string, unknown>) => {
      if (err && (err.message || '').toLowerCase().includes('brand')) {
        delete payload.brand
        return true
      }
      return false
    }

    if (existing) {
      // Met à jour le contact existant avec les nouvelles valeurs non vides
      const updateData: Record<string, unknown> = { ...conversionMeta }
      for (const [k, v] of Object.entries(contactData)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          updateData[k] = v
        }
      }
      let { error: uErr } = await db.from('crm_contacts').update(updateData).eq('hubspot_contact_id', existing.hubspot_contact_id)
      if (stripBrandIfNeeded(uErr, updateData)) {
        const r = await db.from('crm_contacts').update(updateData).eq('hubspot_contact_id', existing.hubspot_contact_id)
        uErr = r.error
      }
      contactId = existing.hubspot_contact_id
    } else {
      // Crée le contact — génère un ID natif unique pour hubspot_contact_id (NOT NULL contrainte)
      const nativeId = 'NATIVE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
      const insertData: Record<string, unknown> = {
        ...contactData,
        ...conversionMeta,
        contact_createdate: nowIso,
        hubspot_contact_id: nativeId,
        hubspot_owner_id:   null,
        origine:            'Formulaire web',
      }
      let { data: created, error: cErr } = await db
        .from('crm_contacts')
        .insert(insertData)
        .select('hubspot_contact_id')
        .single()
      if (stripBrandIfNeeded(cErr, insertData)) {
        const r = await db.from('crm_contacts').insert(insertData).select('hubspot_contact_id').single()
        created = r.data; cErr = r.error
      }
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
  const submissionData = { ...data, _contact_id: contactId }
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

  return NextResponse.json(
    {
      ok: true,
      submission_id: submission.id,
      redirect_url: form.redirect_url,
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
