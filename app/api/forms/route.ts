import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/forms — liste tous les formulaires
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('forms')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/forms — crée un nouveau formulaire
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  // Génère un slug auto à partir du nom s'il n'est pas fourni
  const slug = body.slug || slugify(body.name) + '-' + Math.random().toString(36).slice(2, 6)

  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertPayload: any = {
    name: body.name,
    slug,
    title: body.title || body.name,
    subtitle: body.subtitle || null,
    description: body.description || null,
  }
  // Si le client envoie un dossier, on l'attribue (sinon Diploma Santé par défaut)
  if (body.folder) insertPayload.folder = body.folder
  else insertPayload.folder = 'Diploma Santé'

  // Premier essai avec folder. Si la colonne n'existe pas encore (migration
  // non appliquée), on retombe sans folder pour ne pas casser la création.
  let form, error
  {
    const r = await db.from('forms').insert(insertPayload).select().single()
    form = r.data; error = r.error
    if (error && (error.message || '').toLowerCase().includes('folder')) {
      delete insertPayload.folder
      const r2 = await db.from('forms').insert(insertPayload).select().single()
      form = r2.data; error = r2.error
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si c'est un formulaire vierge, on ajoute 3 champs par défaut (prénom, email, téléphone)
  if (!body.skipDefaultFields) {
    await db.from('form_fields').insert([
      { form_id: form.id, order_index: 0, field_type: 'text', field_key: 'firstname', label: 'Prénom', placeholder: 'Votre prénom', required: true, crm_field: 'firstname' },
      { form_id: form.id, order_index: 1, field_type: 'text', field_key: 'lastname',  label: 'Nom',    placeholder: 'Votre nom',     required: true, crm_field: 'lastname' },
      { form_id: form.id, order_index: 2, field_type: 'email', field_key: 'email',    label: 'Email',  placeholder: 'exemple@mail.fr', required: true, crm_field: 'email' },
      { form_id: form.id, order_index: 3, field_type: 'phone', field_key: 'phone',    label: 'Téléphone', placeholder: '06 12 34 56 78', required: false, crm_field: 'phone' },
    ])
  }

  return NextResponse.json(form, { status: 201 })
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
