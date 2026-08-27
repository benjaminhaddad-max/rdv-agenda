import type { SupabaseClient } from '@supabase/supabase-js'

export type ExtraParticipant = {
  email: string
  name?: string | null
  invited_at: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SETTINGS_PREFIX = 'rdv_extra_participants:'

let extraParticipantsColumnAvailable: boolean | null = null

async function hasExtraParticipantsColumn(db: SupabaseClient): Promise<boolean> {
  if (extraParticipantsColumnAvailable !== null) return extraParticipantsColumnAvailable
  const { error } = await db.from('rdv_appointments').select('extra_participants').limit(1)
  extraParticipantsColumnAvailable = !error
  return extraParticipantsColumnAvailable
}

export function extraParticipantsSettingsKey(appointmentId: string): string {
  return `${SETTINGS_PREFIX}${appointmentId}`
}

export function normalizeParticipantEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidParticipantEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeParticipantEmail(email))
}

export function parseExtraParticipants(raw: unknown): ExtraParticipant[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ExtraParticipant[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const email = typeof rec.email === 'string' ? normalizeParticipantEmail(rec.email) : ''
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    out.push({
      email,
      name: typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : null,
      invited_at: typeof rec.invited_at === 'string' ? rec.invited_at : new Date().toISOString(),
    })
  }
  return out
}

export function extraParticipantEmails(raw: unknown): string[] {
  return parseExtraParticipants(raw).map(p => p.email)
}

async function loadFromSettings(
  db: SupabaseClient,
  appointmentId: string,
): Promise<ExtraParticipant[]> {
  const { data } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', extraParticipantsSettingsKey(appointmentId))
    .maybeSingle()
  return parseExtraParticipants(data?.value)
}

/** Lit les invités visio : colonne dédiée si elle existe, sinon crm_settings. */
export async function loadExtraParticipants(
  db: SupabaseClient,
  appointmentId: string,
): Promise<ExtraParticipant[]> {
  if (await hasExtraParticipantsColumn(db)) {
    const { data } = await db
      .from('rdv_appointments')
      .select('extra_participants')
      .eq('id', appointmentId)
      .maybeSingle()
    const fromCol = parseExtraParticipants(data?.extra_participants)
    if (fromCol.length > 0) return fromCol
  }
  return loadFromSettings(db, appointmentId)
}

export async function loadExtraParticipantsByIds(
  db: SupabaseClient,
  appointmentIds: string[],
): Promise<Map<string, ExtraParticipant[]>> {
  const map = new Map<string, ExtraParticipant[]>()
  if (appointmentIds.length === 0) return map
  for (const id of appointmentIds) map.set(id, [])

  if (await hasExtraParticipantsColumn(db)) {
    const { data } = await db
      .from('rdv_appointments')
      .select('id, extra_participants')
      .in('id', appointmentIds)
    for (const row of data ?? []) {
      map.set(row.id, parseExtraParticipants(row.extra_participants))
    }
  }

  const missing = appointmentIds.filter(id => (map.get(id)?.length ?? 0) === 0)
  if (missing.length === 0) return map

  const { data: settings } = await db
    .from('crm_settings')
    .select('key, value')
    .in('key', missing.map(extraParticipantsSettingsKey))

  for (const row of settings ?? []) {
    const id = String(row.key || '').slice(SETTINGS_PREFIX.length)
    const parsed = parseExtraParticipants(row.value)
    if (id && parsed.length > 0) map.set(id, parsed)
  }
  return map
}

/** Écrit les invités visio sur la colonne si possible, sinon dans crm_settings. */
export async function saveExtraParticipants(
  db: SupabaseClient,
  appointmentId: string,
  participants: ExtraParticipant[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await hasExtraParticipantsColumn(db)) {
    const { error } = await db
      .from('rdv_appointments')
      .update({ extra_participants: participants })
      .eq('id', appointmentId)
    if (!error) {
      await db.from('crm_settings').delete().eq('key', extraParticipantsSettingsKey(appointmentId))
      return { ok: true }
    }
    extraParticipantsColumnAvailable = false
  }

  const { error: settingsErr } = await db.from('crm_settings').upsert({
    key: extraParticipantsSettingsKey(appointmentId),
    value: participants,
    description: 'Participants visio supplémentaires (fallback avant migration colonne)',
    updated_at: new Date().toISOString(),
  })
  if (settingsErr) return { ok: false, error: settingsErr.message }
  return { ok: true }
}
