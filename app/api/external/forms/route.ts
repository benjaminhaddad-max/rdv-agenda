import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyEventPlatformApiKey } from '@/lib/api-auth'

/**
 * GET /api/external/forms — liste publique (clé API) des formulaires CRM.
 * Auth : Authorization: Bearer <EVENT_PLATFORM_API_KEY> ou X-API-Key.
 */
export async function GET(req: NextRequest) {
  if (!verifyEventPlatformApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('forms')
    .select('id, slug, name, status')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

/**
 * POST /api/external/forms — crée un formulaire CRM pour la plateforme Events.
 * Body: { name, title?, folder?, brand?, event_type?, status? }
 * Returns: { id, slug, name, status, public_url, embed_url }
 */
export async function POST(req: NextRequest) {
  if (!verifyEventPlatformApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  const brand = typeof body.brand === 'string' ? body.brand : 'diploma'
  const folder =
    (typeof body.folder === 'string' && body.folder) ||
    (brand === 'edumove' ? 'Edumove' : brand === 'medibox' ? 'Medibox' : 'Diploma Santé')

  const slug =
    (typeof body.slug === 'string' && body.slug) ||
    slugify(body.name) + '-' + Math.random().toString(36).slice(2, 6)

  const status = body.status === 'draft' ? 'draft' : 'published'
  const title = (typeof body.title === 'string' && body.title) || body.name

  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertPayload: any = {
    name: body.name,
    slug,
    title,
    subtitle: body.subtitle || null,
    description: body.description || null,
    status,
    folder,
  }

  let form, error
  {
    const r = await db.from('forms').insert(insertPayload).select().single()
    form = r.data
    error = r.error
    if (error && (error.message || '').toLowerCase().includes('folder')) {
      delete insertPayload.folder
      const r2 = await db.from('forms').insert(insertPayload).select().single()
      form = r2.data
      error = r2.error
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!body.skipDefaultFields) {
    await db.from('form_fields').insert([
      {
        form_id: form.id,
        order_index: 0,
        field_type: 'text',
        field_key: 'firstname',
        label: 'Prénom',
        placeholder: 'Votre prénom',
        required: true,
        crm_field: 'firstname',
      },
      {
        form_id: form.id,
        order_index: 1,
        field_type: 'text',
        field_key: 'lastname',
        label: 'Nom',
        placeholder: 'Votre nom',
        required: true,
        crm_field: 'lastname',
      },
      {
        form_id: form.id,
        order_index: 2,
        field_type: 'email',
        field_key: 'email',
        label: 'Email',
        placeholder: 'exemple@mail.fr',
        required: true,
        crm_field: 'email',
      },
      {
        form_id: form.id,
        order_index: 3,
        field_type: 'phone',
        field_key: 'phone',
        label: 'Téléphone',
        placeholder: '06 12 34 56 78',
        required: false,
        crm_field: 'phone',
      },
    ])
  }

  const base = 'https://hub.diploma-sante.fr'
  return NextResponse.json(
    {
      id: form.id,
      slug: form.slug,
      name: form.name,
      status: form.status,
      public_url: `${base}/forms/${form.slug}`,
      embed_url: `${base}/embed/forms/${form.slug}`,
    },
    { status: 201 },
  )
}

export async function HEAD() {
  return new NextResponse(null, { status: 204 })
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
