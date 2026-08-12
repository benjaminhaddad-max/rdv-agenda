import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'
import { getAuthUserIdResilient } from '@/lib/auth-resilient'

/**
 * Proxy interne Events Studio → formulaires CRM.
 * Auth : session CRM (cookie), pas de EVENT_PLATFORM_API_KEY.
 */

async function requireCrmUser(): Promise<string | null> {
  const auth = await createServerSupabase()
  const cookieStore = await cookies()
  return getAuthUserIdResilient(() => auth.auth.getUser(), cookieStore)
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

export async function GET() {
  const userId = await requireCrmUser()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', forms: [] }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('forms')
    .select('id, slug, name, status')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message, forms: [] }, { status: 500 })
  }

  const forms = (data ?? []).filter((f) => f.status === 'published')
  return NextResponse.json(
    { forms },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}

export async function POST(req: NextRequest) {
  const userId = await requireCrmUser()
  if (!userId) {
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
