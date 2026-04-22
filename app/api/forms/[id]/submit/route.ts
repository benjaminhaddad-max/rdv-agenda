import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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
  const contactData: Record<string, unknown> = {}
  for (const f of (fields || [])) {
    if (f.crm_field && data[f.field_key] !== undefined) {
      contactData[f.crm_field] = data[f.field_key]
    }
  }

  // 5. Création/mise à jour du contact (si activé)
  let contactId: string | null = null
  let contactCreated = false

  if (form.auto_create_contact && (contactData.email || contactData.phone)) {
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

    if (existing) {
      // Met à jour le contact existant avec les nouvelles valeurs non vides
      const updateData: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(contactData)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          updateData[k] = v
        }
      }
      if (Object.keys(updateData).length > 0) {
        await db.from('crm_contacts').update(updateData).eq('hubspot_contact_id', existing.hubspot_contact_id)
      }
      contactId = existing.hubspot_contact_id
    } else {
      // Crée le contact — génère un ID natif unique pour hubspot_contact_id (NOT NULL contrainte)
      const nativeId = 'NATIVE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
      const insertData: Record<string, unknown> = {
        ...contactData,
        hubspot_contact_id: nativeId,
        hubspot_owner_id: null,
        origine: 'Formulaire web',
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
        console.error('Form submit — contact create error:', cErr)
      }
    }
  }

  // 6. Enregistre la soumission
  const submissionRow = {
    form_id: form.id,
    data,
    contact_id: contactId,
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
