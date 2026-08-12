import { createServiceClient } from '@/lib/supabase'
import { BRAND_CONFIG, type EventBrand } from '@/lib/events-studio/config'
import {
  EVENT_FORM_TEMPLATE_FIELDS,
  buildEventFormFields,
  type CrmPropertyLike,
  type EventFormFieldInsert,
} from '@/lib/events-studio/form-template'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export type CreateCrmFormInput = {
  name: string
  title?: string
  brand?: string
  folder?: string
  status?: 'draft' | 'published'
  template?: 'event' | 'identity'
  extra_crm_fields?: string[]
  fields?: EventFormFieldInsert[]
  skipDefaultFields?: boolean
  subtitle?: string | null
  description?: string | null
  slug?: string
}

export type CreateCrmFormResult = {
  id: string
  slug: string
  name: string
  status: string
  public_url: string
  embed_url: string
}

export async function createCrmFormForEvent(
  body: CreateCrmFormInput,
): Promise<CreateCrmFormResult> {
  if (!body.name || typeof body.name !== 'string') {
    throw new Error('Missing required field: name')
  }

  const brand = (typeof body.brand === 'string' ? body.brand : 'diploma') as EventBrand
  const brandCfg = BRAND_CONFIG[brand] || BRAND_CONFIG.diploma
  const folder = (typeof body.folder === 'string' && body.folder) || brandCfg.folder
  const slug =
    (typeof body.slug === 'string' && body.slug) ||
    slugify(body.name) + '-' + Math.random().toString(36).slice(2, 6)
  const status = body.status === 'draft' ? 'draft' : 'published'
  const title = (typeof body.title === 'string' && body.title) || body.name
  const template = body.template === 'event' ? 'event' : 'identity'

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

  if (error) throw new Error(error.message)

  if (!body.skipDefaultFields) {
    let fields: EventFormFieldInsert[]

    if (Array.isArray(body.fields) && body.fields.length > 0) {
      fields = body.fields.map((f, i) => ({
        ...f,
        order_index: typeof f.order_index === 'number' ? f.order_index : i,
      }))
    } else if (template === 'event') {
      const extraNames: string[] = Array.isArray(body.extra_crm_fields)
        ? body.extra_crm_fields.filter((n): n is string => typeof n === 'string')
        : []
      let extraProps: CrmPropertyLike[] = []
      if (extraNames.length > 0) {
        const { data: props } = await db
          .from('crm_properties')
          .select('name, label, type, field_type, options')
          .eq('object_type', 'contacts')
          .in('name', extraNames)
        const found = (props || []) as CrmPropertyLike[]
        extraProps = extraNames.map(
          (n) => found.find((p) => p.name === n) || { name: n, label: n, field_type: 'text' },
        )
      }
      fields = buildEventFormFields(extraProps)
    } else {
      fields = [
        { ...EVENT_FORM_TEMPLATE_FIELDS[0], order_index: 0 },
        { ...EVENT_FORM_TEMPLATE_FIELDS[1], order_index: 1 },
        { ...EVENT_FORM_TEMPLATE_FIELDS[3], order_index: 2, required: true },
        { ...EVENT_FORM_TEMPLATE_FIELDS[2], order_index: 3 },
      ]
    }

    const rows = fields.map((f) => ({
      form_id: form.id,
      order_index: f.order_index,
      field_type: f.field_type,
      field_key: f.field_key,
      label: f.label,
      placeholder: f.placeholder ?? null,
      required: !!f.required,
      crm_field: f.crm_field,
      options: f.options ?? null,
    }))

    const { error: fieldsError } = await db.from('form_fields').insert(rows)
    if (fieldsError) throw new Error(`Form créé mais champs en erreur: ${fieldsError.message}`)
  }

  const base = 'https://hub.diploma-sante.fr'
  return {
    id: form.id,
    slug: form.slug,
    name: form.name,
    status: form.status,
    public_url: `${base}/forms/${form.slug}`,
    embed_url: `${base}/embed/forms/${form.slug}`,
  }
}
