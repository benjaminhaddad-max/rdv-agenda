import { cached, invalidate } from '@/lib/cache'
import { createServiceClient } from '@/lib/supabase'

export interface PublicField {
  field_type: string
  field_key: string
  label: string
  placeholder: string | null
  help_text: string | null
  default_value: string | null
  required: boolean
  options: Array<{ value: string; label: string }>
  validation: Record<string, unknown>
}

export interface PublicForm {
  id: string
  slug: string
  title: string | null
  subtitle: string | null
  submit_label: string
  success_message: string | null
  redirect_url: string | null
  redirect_file_url?: string | null
  primary_color: string
  bg_color: string
  text_color: string
  field_border_color?: string | null
  field_border_width?: number | null
  field_border_radius?: number | null
  field_bg_color?: string | null
  submit_bg_color?: string | null
  submit_text_color?: string | null
  submit_border_radius?: number | null
  submit_size?: 'small' | 'medium' | 'large' | null
  submit_full_width?: boolean | null
  submit_padding_y?: number | null
  submit_padding_x?: number | null
  submit_font_size?: number | null
  honeypot_enabled: boolean
  fields: PublicField[]
  // ── Mode "prise de rendez-vous" (form_type='booking') ───────────────────
  form_type?: 'lead' | 'booking' | null
  booking_duration_minutes?: number | null
  booking_horizon_days?: number | null
  booking_min_notice_hours?: number | null
  booking_meeting_types?: string[] | null
  booking_location_label?: string | null
  booking_default_meeting_type?: 'visio' | 'presentiel' | 'telephone' | null
  booking_intro_html?: string | null
}

const PUBLIC_FORM_CACHE_PREFIX = 'forms:public:'
const PUBLIC_FORM_CACHE_VERSION = 'v4'

function publicFormCacheKey(slug: string): string {
  return `${PUBLIC_FORM_CACHE_PREFIX}${slug}:${PUBLIC_FORM_CACHE_VERSION}`
}

export async function getPublicFormBySlug(slug: string): Promise<PublicForm | null> {
  const normalizedSlug = String(slug || '').trim().toLowerCase()
  if (!normalizedSlug) return null

  return cached<PublicForm | null>(publicFormCacheKey(normalizedSlug), 30, async () => {
    const db = createServiceClient()

    // Liste de colonnes "best-effort" : si une migration n'a pas encore été
    // appliquée (booking, redirect_file_url, …), on retire la colonne fautive
    // et on retente la requête.
    const baseCols = [
      'id', 'slug', 'title', 'subtitle', 'submit_label', 'success_message', 'redirect_url',
      'primary_color', 'bg_color', 'text_color',
      'field_border_color', 'field_border_width', 'field_border_radius', 'field_bg_color',
      'submit_bg_color', 'submit_text_color', 'submit_border_radius', 'submit_size', 'submit_full_width',
      'submit_padding_y', 'submit_padding_x', 'submit_font_size',
      'honeypot_enabled',
    ]
    const optionalCols = [
      'redirect_file_url',
      'form_type', 'booking_duration_minutes', 'booking_horizon_days', 'booking_min_notice_hours',
      'booking_meeting_types', 'booking_location_label', 'booking_default_meeting_type', 'booking_intro_html',
    ]
    let cols = [...baseCols, ...optionalCols]
    let form: PublicForm | null = null
    let error: { message?: string } | null = null
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await db
        .from('forms')
        .select(cols.join(', '))
        .eq('slug', normalizedSlug)
        .eq('status', 'published')
        .single()
      form = (r.data as PublicForm | null) ?? null
      error = r.error
      if (!error || !error.message) break
      const msg = String(error.message).toLowerCase()
      const culprit = optionalCols.find(c => msg.includes(c))
      if (!culprit) break
      cols = cols.filter(c => c !== culprit)
    }

    if (error || !form) return null

    const { data: fields } = await db
      .from('form_fields')
      .select('field_type, field_key, label, placeholder, help_text, default_value, required, options, validation, conditional, order_index')
      .eq('form_id', form.id)
      .order('order_index', { ascending: true })

    return {
      ...form,
      fields: fields || [],
    }
  })
}

export async function invalidatePublicFormCache(slug: string): Promise<void> {
  const normalizedSlug = String(slug || '').trim().toLowerCase()
  if (!normalizedSlug) return
  await invalidate(publicFormCacheKey(normalizedSlug))
}
