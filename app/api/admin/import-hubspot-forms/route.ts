import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

/**
 * POST /api/admin/import-hubspot-forms
 *
 * Importe les formulaires HubSpot dans le CRM natif.
 * Body : { prefix?: string, dryRun?: boolean }
 *
 * Par défaut : importe tous ceux dont le nom commence par "NS"
 */

interface HubSpotFormField {
  name: string
  label: string
  required?: boolean
  hidden?: boolean
  fieldType?: string
  placeholder?: string
  description?: string
  defaultValue?: string | null
  options?: Array<{ value: string; label: string }>
}

interface HubSpotFormFieldGroup {
  groupType?: string
  fields?: HubSpotFormField[]
}

interface HubSpotForm {
  id: string
  name: string
  archived?: boolean
  fieldGroups?: HubSpotFormFieldGroup[]
  displayOptions?: {
    submitButtonText?: string
    postSubmitAction?: {
      type?: string
      value?: string
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const prefix = (body.prefix ?? 'NS') as string
  const dryRun = !!body.dryRun

  try {
    // 1. Récupère tous les formulaires (paginé)
    const allForms: HubSpotForm[] = []
    let after: string | undefined = undefined
    let page = 0
    const maxPages = 10 // sécurité : max 10 pages × 100 = 1000 forms

    do {
      const qs = new URLSearchParams({ limit: '100', archived: 'false' })
      if (after) qs.set('after', after)
      let data: { results?: HubSpotForm[]; paging?: { next?: { after?: string } } }
      try {
        data = await hubspotFetch(`/marketing/v3/forms?${qs.toString()}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Détection spécifique des erreurs de scope HubSpot
        if (msg.includes('403') || msg.includes('MISSING_SCOPES') || msg.includes('scope')) {
          return NextResponse.json({
            ok: false,
            error: 'SCOPE_MISSING',
            message: "Le token HubSpot n'a pas le scope \"forms\".",
            details: msg,
          }, { status: 403 })
        }
        throw err
      }
      if (!data) data = {}
      const results = (data.results || []) as HubSpotForm[]
      allForms.push(...results)
      after = data.paging?.next?.after
      page++
    } while (after && page < maxPages)

    // 2. Filtre par préfixe
    const matching = allForms.filter(f =>
      f.name?.trim().toLowerCase().startsWith(prefix.toLowerCase())
    )

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalHubspotForms: allForms.length,
        matching: matching.length,
        preview: matching.map(f => ({
          id: f.id,
          name: f.name,
          fieldsCount: (f.fieldGroups || []).reduce((s, g) => s + (g.fields?.length || 0), 0),
        })),
      })
    }

    // 3. Importe les formulaires
    const db = createServiceClient()
    const results: Array<{ name: string; status: 'created' | 'updated' | 'error'; error?: string; id?: string; fieldsCount?: number }> = []

    for (const form of matching) {
      try {
        const slug = slugify(form.name) + '-hs' + form.id.slice(0, 6)
        const title = form.name.replace(/^NS\s*[-–—:]?\s*/i, '').trim() || form.name
        const submitLabel = form.displayOptions?.submitButtonText || 'Envoyer'
        const redirectUrl = form.displayOptions?.postSubmitAction?.type === 'redirect_url'
          ? form.displayOptions.postSubmitAction.value
          : null

        // Vérifie si déjà importé (via le slug qui contient l'ID HubSpot)
        const { data: existing } = await db
          .from('forms')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()

        let formId: string
        if (existing) {
          // Update meta
          const { error } = await db
            .from('forms')
            .update({
              name: form.name,
              title,
              submit_label: submitLabel,
              redirect_url: redirectUrl,
            })
            .eq('id', existing.id)
          if (error) throw new Error(error.message)
          formId = existing.id

          // Nettoie les anciens champs pour les réimporter proprement
          await db.from('form_fields').delete().eq('form_id', formId)
        } else {
          // Crée
          const { data: created, error } = await db
            .from('forms')
            .insert({
              name: form.name,
              slug,
              title,
              submit_label: submitLabel,
              redirect_url: redirectUrl,
              status: 'draft', // importé en draft, à publier manuellement
              description: `Importé depuis HubSpot (${form.id})`,
            })
            .select()
            .single()
          if (error) throw new Error(error.message)
          formId = created.id
        }

        // Map et insère les champs
        const allFields: HubSpotFormField[] = []
        for (const group of (form.fieldGroups || [])) {
          for (const field of (group.fields || [])) {
            allFields.push(field)
          }
        }

        const toInsert = allFields.map((f, idx) => {
          const mapped = mapHubspotFieldType(f.fieldType || 'single_line_text')
          return {
            form_id: formId,
            order_index: idx,
            field_type: f.hidden ? 'hidden' : mapped,
            field_key: f.name,
            label: f.label || f.name,
            placeholder: f.placeholder || null,
            help_text: f.description || null,
            default_value: f.defaultValue || null,
            required: !!f.required,
            options: f.options || [],
            crm_field: mapCrmField(f.name),
          }
        })

        if (toInsert.length > 0) {
          const { error: insErr } = await db.from('form_fields').insert(toInsert)
          if (insErr) throw new Error(insErr.message)
        }

        results.push({
          name: form.name,
          status: existing ? 'updated' : 'created',
          id: formId,
          fieldsCount: toInsert.length,
        })
      } catch (err) {
        results.push({
          name: form.name,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const updated = results.filter(r => r.status === 'updated').length
    const errors = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      ok: true,
      totalHubspotForms: allForms.length,
      matching: matching.length,
      created,
      updated,
      errors,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// ─── Mappings ────────────────────────────────────────────────────────────
function mapHubspotFieldType(hsType: string): string {
  const map: Record<string, string> = {
    single_line_text: 'text',
    multi_line_text: 'textarea',
    email: 'email',
    phone_number: 'phone',
    number: 'number',
    date: 'date',
    file: 'text', // non supporté en natif pour l'instant
    dropdown: 'select',
    radio: 'radio',
    checkbox: 'checkbox',
    multiple_checkboxes: 'checkbox',
    single_checkbox: 'checkbox',
    booleancheckbox: 'checkbox',
    calculation_equation: 'text',
    hidden: 'hidden',
  }
  return map[hsType] || 'text'
}

/**
 * Mappe les propriétés HubSpot standards vers nos champs CRM internes.
 * Seuls les champs qui existent dans crm_contacts sont retournés.
 */
function mapCrmField(hsName: string): string | null {
  const map: Record<string, string> = {
    firstname: 'firstname',
    lastname: 'lastname',
    email: 'email',
    phone: 'phone',
    mobilephone: 'phone',
    department: 'departement',
    departement: 'departement',
    classe_actuelle: 'classe_actuelle',
    zone___localite: 'zone_localite',
    email_parent: 'email_parent',
    diploma_sante___formation_demandee: 'formation',
    formation_souhaitee: 'formation',
    hs_lead_status: null as unknown as string, // statut lead pas encore mappé
    origine: 'origine',
    recent_conversion_event_name: null as unknown as string,
  }
  return map[hsName] || null
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
