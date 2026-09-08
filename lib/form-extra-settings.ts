import type { SupabaseClient } from '@supabase/supabase-js'

export type FormExtraSettings = {
  redirect_file_url?: string | null
  conditional_redirect_enabled?: boolean | null
  conditional_redirect_terminale_url?: string | null
  conditional_redirect_non_terminale_url?: string | null
}

const SETTINGS_PREFIX = 'form_extra:'

export function formExtraSettingsKey(formId: string): string {
  return `${SETTINGS_PREFIX}${formId}`
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

export function parseFormExtraSettings(raw: unknown): FormExtraSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const rec = raw as Record<string, unknown>
  const extra: FormExtraSettings = {}
  if ('redirect_file_url' in rec) extra.redirect_file_url = asNullableString(rec.redirect_file_url)
  if (typeof rec.conditional_redirect_enabled === 'boolean') {
    extra.conditional_redirect_enabled = rec.conditional_redirect_enabled
  }
  if ('conditional_redirect_terminale_url' in rec) {
    extra.conditional_redirect_terminale_url = asNullableString(rec.conditional_redirect_terminale_url)
  }
  if ('conditional_redirect_non_terminale_url' in rec) {
    extra.conditional_redirect_non_terminale_url = asNullableString(rec.conditional_redirect_non_terminale_url)
  }
  return extra
}

export function pickFormExtraFromBody(body: Record<string, unknown>): FormExtraSettings {
  const extra: FormExtraSettings = {}
  if ('redirect_file_url' in body) extra.redirect_file_url = asNullableString(body.redirect_file_url)
  if (typeof body.conditional_redirect_enabled === 'boolean') {
    extra.conditional_redirect_enabled = body.conditional_redirect_enabled
  }
  if ('conditional_redirect_terminale_url' in body) {
    extra.conditional_redirect_terminale_url = asNullableString(body.conditional_redirect_terminale_url)
  }
  if ('conditional_redirect_non_terminale_url' in body) {
    extra.conditional_redirect_non_terminale_url = asNullableString(body.conditional_redirect_non_terminale_url)
  }
  return extra
}

export function hasFormExtraValues(extra: FormExtraSettings): boolean {
  return Object.keys(extra).length > 0
}

export function mergeFormWithExtra<T extends Record<string, unknown>>(
  form: T,
  extra: FormExtraSettings | null | undefined,
): T {
  if (!extra) return form
  const out: Record<string, unknown> = { ...form }
  if (typeof extra.conditional_redirect_enabled === 'boolean'
    && typeof out.conditional_redirect_enabled !== 'boolean') {
    out.conditional_redirect_enabled = extra.conditional_redirect_enabled
  }
  if (out.redirect_file_url == null && extra.redirect_file_url) {
    out.redirect_file_url = extra.redirect_file_url
  }
  if (out.conditional_redirect_terminale_url == null && extra.conditional_redirect_terminale_url) {
    out.conditional_redirect_terminale_url = extra.conditional_redirect_terminale_url
  }
  if (out.conditional_redirect_non_terminale_url == null && extra.conditional_redirect_non_terminale_url) {
    out.conditional_redirect_non_terminale_url = extra.conditional_redirect_non_terminale_url
  }
  return out as T
}

export async function loadFormExtraSettings(
  db: SupabaseClient,
  formId: string,
): Promise<FormExtraSettings> {
  const { data, error } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', formExtraSettingsKey(formId))
    .maybeSingle()
  if (error || !data) return {}
  return parseFormExtraSettings(data.value)
}

export async function saveFormExtraSettings(
  db: SupabaseClient,
  formId: string,
  incoming: FormExtraSettings,
): Promise<void> {
  if (!hasFormExtraValues(incoming)) return
  const current = await loadFormExtraSettings(db, formId)
  const next: FormExtraSettings = { ...current }
  if ('redirect_file_url' in incoming) next.redirect_file_url = incoming.redirect_file_url ?? null
  if (typeof incoming.conditional_redirect_enabled === 'boolean') {
    next.conditional_redirect_enabled = incoming.conditional_redirect_enabled
  }
  if ('conditional_redirect_terminale_url' in incoming) {
    next.conditional_redirect_terminale_url = incoming.conditional_redirect_terminale_url ?? null
  }
  if ('conditional_redirect_non_terminale_url' in incoming) {
    next.conditional_redirect_non_terminale_url = incoming.conditional_redirect_non_terminale_url ?? null
  }
  const { error } = await db.from('crm_settings').upsert(
    {
      key: formExtraSettingsKey(formId),
      value: next,
      description: 'Réglages formulaire optionnels (fallback si colonnes SQL absentes)',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
}
