/** Formulaire type événement CRM. */

export type EventFormFieldInsert = {
  order_index: number
  field_type: string
  field_key: string
  label: string
  placeholder?: string | null
  required: boolean
  crm_field: string
  options?: Array<{ value: string; label: string }> | null
}

const CLASSE_OPTIONS = [
  'Seconde',
  'Première',
  'Terminale',
  'Bac obtenu',
  'PASS / LAS',
  'Étudiant en santé',
  'Réorientation',
  'Autre',
].map((label) => ({
  value: label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''),
  label,
}))

/** 6 champs type : Prénom, Nom, Téléphone, Email, Classe actuelle, Département */
export const EVENT_FORM_TEMPLATE_FIELDS: EventFormFieldInsert[] = [
  {
    order_index: 0,
    field_type: 'text',
    field_key: 'firstname',
    label: 'Prénom',
    placeholder: 'Votre prénom',
    required: true,
    crm_field: 'firstname',
  },
  {
    order_index: 1,
    field_type: 'text',
    field_key: 'lastname',
    label: 'Nom',
    placeholder: 'Votre nom',
    required: true,
    crm_field: 'lastname',
  },
  {
    order_index: 2,
    field_type: 'phone',
    field_key: 'phone',
    label: 'Téléphone',
    placeholder: '06 12 34 56 78',
    required: false,
    crm_field: 'phone',
  },
  {
    order_index: 3,
    field_type: 'email',
    field_key: 'email',
    label: 'Email',
    placeholder: 'exemple@mail.fr',
    required: true,
    crm_field: 'email',
  },
  {
    order_index: 4,
    field_type: 'select',
    field_key: 'classe_actuelle',
    label: 'Classe actuelle',
    placeholder: null,
    required: true,
    crm_field: 'classe_actuelle',
    options: CLASSE_OPTIONS,
  },
  {
    order_index: 5,
    field_type: 'text',
    field_key: 'departement',
    label: 'Département',
    placeholder: 'Ex: 75',
    required: true,
    crm_field: 'departement',
  },
]

export type CrmPropertyLike = {
  name: string
  label: string
  type?: string
  field_type?: string
  options?: Array<{ value: string; label: string }> | null
}

export function mapCrmFieldTypeToFormType(crmFieldType?: string, crmType?: string): string {
  const ft = String(crmFieldType || '').toLowerCase()
  const t = String(crmType || '').toLowerCase()
  if (ft === 'select') return 'select'
  if (ft === 'radio') return 'radio'
  if (ft === 'checkbox' || ft === 'booleancheckbox') return 'checkbox'
  if (ft === 'phonenumber' || t === 'phone_number') return 'phone'
  if (ft === 'number' || t === 'number') return 'number'
  if (ft === 'date' || t === 'date' || ft === 'datetime' || t === 'datetime') return 'date'
  if (ft === 'textarea') return 'textarea'
  return 'text'
}

/** Fusionne le template event + propriétés CRM supplémentaires (déduplique sur crm_field / field_key). */
export function buildEventFormFields(
  extraProps: CrmPropertyLike[] = [],
): EventFormFieldInsert[] {
  const base = EVENT_FORM_TEMPLATE_FIELDS.map((f) => ({ ...f, options: f.options ? [...f.options] : null }))
  const used = new Set(base.map((f) => f.crm_field))
  let order = base.length

  for (const prop of extraProps) {
    if (!prop?.name || used.has(prop.name)) continue
    used.add(prop.name)
    const fieldType = mapCrmFieldTypeToFormType(prop.field_type, prop.type)
    base.push({
      order_index: order++,
      field_type: fieldType,
      field_key: prop.name,
      label: prop.label || prop.name,
      placeholder: null,
      required: false,
      crm_field: prop.name,
      options: prop.options?.length ? prop.options : null,
    })
  }

  return base
}
