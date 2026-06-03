/**
 * Correspondance workflow « formulaire soumis » (forms natifs CRM).
 *
 * IMPORTANT : un trigger_config vide ne doit JAMAIS matcher tous les forms
 * (sinon un workflow actif part sur toute soumission — bug Edumove Rome).
 */

export type FormSubmittedTriggerConfig = {
  form_id?: string
  form_slug?: string
  meta_form_id?: string
  /** Opt-in explicite uniquement : déclencher sur tous les forms natifs. */
  match_all?: boolean
  /** Marqueur interne : ce workflow est géré par HubSpot / Meta, pas forms natifs. */
  edumove_rome_sms?: boolean
}

export function matchesNativeFormSubmittedWorkflow(
  cfg: FormSubmittedTriggerConfig | null | undefined,
  form: { id: string; slug: string },
): boolean {
  const c = cfg ?? {}
  if (c.edumove_rome_sms) return false
  if (c.match_all === true) return true
  if (c.form_id && c.form_id === form.id) return true
  if (c.form_slug && c.form_slug === form.slug) return true
  return false
}
