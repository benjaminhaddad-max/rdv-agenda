import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/forms — liste tous les formulaires (avec compteurs réels)
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('forms')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const forms = data ?? []
  if (forms.length === 0) return NextResponse.json([])

  // Compte réel des soumissions par form (status != 'spam') — la colonne
  // forms.submission_count peut être obsolète si le RPC d'incrément a sauté
  // un coup ou si des soumissions ont été importées hors du flux.
  // Une `count` par form en parallèle (head:true → ne ramène pas les lignes).
  const formIds = forms.map(f => f.id)
  const counts = new Map<string, number>()
  try {
    const results = await Promise.all(
      formIds.map(async (id) => {
        const { count } = await db
          .from('form_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('form_id', id)
          .neq('status', 'spam')
        return [id, count ?? 0] as const
      }),
    )
    for (const [id, c] of results) counts.set(id, c)
  } catch {
    // En cas d'échec on retombe sur la valeur stockée (pas de blocage)
  }

  const enriched = forms.map(f => ({
    ...f,
    submission_count: counts.get(f.id) ?? f.submission_count ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST /api/forms — crée un nouveau formulaire
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  // Type du form : 'lead' (capture classique) ou 'booking' (prise de RDV style Calendly)
  const formType: 'lead' | 'booking' = body.form_type === 'booking' ? 'booking' : 'lead'

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
  if (formType === 'booking') {
    insertPayload.form_type = 'booking'
    insertPayload.submit_label = 'Confirmer le rendez-vous'
    insertPayload.success_message = body.success_message
      || 'Votre rendez-vous est confirmé. Vous allez recevoir un email et un SMS récapitulatif.'
  }
  // Si le client envoie un dossier, on l'attribue (sinon Diploma Santé par défaut)
  if (body.folder) insertPayload.folder = body.folder
  else insertPayload.folder = 'Diploma Santé'

  // Colonnes optionnelles qui peuvent ne pas exister si une migration n'a pas
  // encore été appliquée → on les retire à la volée pour ne pas casser la création.
  const tryInsertWithFallback = async (): Promise<{ data: unknown; error: { message?: string } | null }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trySafe = async (payload: any) => db.from('forms').insert(payload).select().single()
    let r = await trySafe(insertPayload)
    let attempts = 0
    while (r.error && attempts < 4) {
      const msg = String(r.error.message || '').toLowerCase()
      const optionals = ['form_type', 'folder']
      let removed = false
      for (const col of optionals) {
        if (msg.includes(col) && col in insertPayload) {
          delete insertPayload[col]
          removed = true
        }
      }
      if (!removed) break
      r = await trySafe(insertPayload)
      attempts++
    }
    return r
  }

  const r = await tryInsertWithFallback()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = r.data as any
  const error = r.error

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Champs par défaut
  if (!body.skipDefaultFields) {
    if (formType === 'booking') {
      // Champs du wizard de prise de RDV (cf. screenshots Calendly Diploma Santé)
      await db.from('form_fields').insert([
        { form_id: form.id, order_index: 0, field_type: 'text',  field_key: 'firstname',           label: 'Prénom',              placeholder: 'Votre prénom',          required: true,  crm_field: 'firstname' },
        { form_id: form.id, order_index: 1, field_type: 'text',  field_key: 'lastname',            label: 'Nom',                 placeholder: 'Votre nom',             required: true,  crm_field: 'lastname' },
        { form_id: form.id, order_index: 2, field_type: 'email', field_key: 'email',               label: 'E-mail',              placeholder: 'exemple@mail.fr',       required: true,  crm_field: 'email' },
        { form_id: form.id, order_index: 3, field_type: 'phone', field_key: 'phone',               label: 'Numéro de téléphone', placeholder: '06 12 34 56 78',        required: true,  crm_field: 'phone' },
        { form_id: form.id, order_index: 4, field_type: 'text',  field_key: 'departement',         label: 'Département (2 chiffres)', placeholder: '75',               required: true,  crm_field: 'departement', validation: { pattern: '^[0-9]{2,3}[A-Z]?$' } },
        {
          form_id: form.id, order_index: 5, field_type: 'select', field_key: 'classe_actuelle',
          label: 'Votre classe actuelle', placeholder: 'Sélectionnez…', required: true, crm_field: 'classe_actuelle',
          options: [
            { value: 'Seconde',           label: 'Seconde' },
            { value: 'Première',          label: 'Première' },
            { value: 'Terminale',         label: 'Terminale' },
            { value: 'Bac obtenu',        label: 'Bac obtenu' },
            { value: 'PASS / LAS',        label: 'PASS / LAS' },
            { value: 'Étudiant en santé', label: 'Étudiant en santé' },
            { value: 'Réorientation',     label: 'Réorientation' },
            { value: 'Autre',             label: 'Autre' },
          ],
        },
        {
          form_id: form.id, order_index: 6, field_type: 'select', field_key: 'formation_souhaitee',
          label: 'Formation souhaitée', placeholder: 'Sélectionnez…', required: true, crm_field: 'formation_souhaitee',
          options: [
            { value: 'PASS / LAS',       label: 'PASS / LAS' },
            { value: 'Orthophonie',      label: 'Orthophonie' },
            { value: 'Kinésithérapie',   label: 'Kinésithérapie' },
            { value: 'Sage-femme',       label: 'Sage-femme' },
            { value: 'Infirmier',        label: 'Infirmier' },
            { value: 'Dentaire',         label: 'Dentaire' },
            { value: 'Pharmacie',        label: 'Pharmacie' },
            { value: 'Autre',            label: 'Autre' },
          ],
        },
      ])
    } else {
      // Capture lead : champs minimaux historiques
      await db.from('form_fields').insert([
        { form_id: form.id, order_index: 0, field_type: 'text', field_key: 'firstname', label: 'Prénom', placeholder: 'Votre prénom', required: true, crm_field: 'firstname' },
        { form_id: form.id, order_index: 1, field_type: 'text', field_key: 'lastname',  label: 'Nom',    placeholder: 'Votre nom',     required: true, crm_field: 'lastname' },
        { form_id: form.id, order_index: 2, field_type: 'email', field_key: 'email',    label: 'Email',  placeholder: 'exemple@mail.fr', required: true, crm_field: 'email' },
        { form_id: form.id, order_index: 3, field_type: 'phone', field_key: 'phone',    label: 'Téléphone', placeholder: '06 12 34 56 78', required: false, crm_field: 'phone' },
      ])
    }
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
