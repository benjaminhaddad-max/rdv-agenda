type NullableString = string | null | undefined

export type ExistingConversionFields = {
  first_conversion_date?: NullableString
  first_conversion_event_name?: NullableString
  recent_conversion_date?: NullableString
  recent_conversion_event?: NullableString
  recent_conversion_event_name?: NullableString
}

function safeIso(input: NullableString): string | null {
  if (!input) return null
  const ts = Date.parse(input)
  if (!Number.isFinite(ts)) return null
  return new Date(ts).toISOString()
}

export function buildConversionFieldsForSubmission(
  submittedAtIso: string,
  eventNameRaw: NullableString,
  existing?: ExistingConversionFields | null,
): Record<string, string> {
  const submittedIso = safeIso(submittedAtIso) ?? new Date().toISOString()
  const submittedTs = Date.parse(submittedIso)
  const eventName = String(eventNameRaw || '').trim() || 'Formulaire web'

  const out: Record<string, string> = {}

  const existingFirstIso = safeIso(existing?.first_conversion_date)
  const existingRecentIso = safeIso(existing?.recent_conversion_date)
  const existingFirstTs = existingFirstIso ? Date.parse(existingFirstIso) : null
  const existingRecentTs = existingRecentIso ? Date.parse(existingRecentIso) : null
  const existingRecentEvent = String(
    existing?.recent_conversion_event || existing?.recent_conversion_event_name || '',
  ).trim()

  // Premier formulaire : conserver le plus ancien événement connu.
  if (!existingFirstIso || existingFirstTs === null || submittedTs < existingFirstTs) {
    out.first_conversion_date = submittedIso
    out.first_conversion_event_name = eventName
  } else if (!existing?.first_conversion_event_name) {
    // On préserve la date existante et on complète le nom si absent.
    out.first_conversion_date = existingFirstIso
    out.first_conversion_event_name = existingRecentEvent || eventName
  }

  // Dernier formulaire : conserver le plus récent événement connu.
  if (!existingRecentIso || existingRecentTs === null || submittedTs >= existingRecentTs) {
    out.recent_conversion_date = submittedIso
    out.recent_conversion_event = eventName
    out.recent_conversion_event_name = eventName
  } else if (!existing?.recent_conversion_event_name && existingRecentEvent) {
    // Compatibilité historique: garder recent_conversion_event_name synchronisé.
    out.recent_conversion_event_name = existingRecentEvent
  }

  return out
}
