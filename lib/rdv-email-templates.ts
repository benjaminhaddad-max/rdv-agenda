/**
 * lib/rdv-email-templates.ts
 *
 * Mails de RDV Diploma Santé envoyés depuis des modèles transactionnels Brevo
 * (tag « rdv-crm » dans Brevo → Modèles). Le texte, l'objet et le design se
 * modifient directement dans Brevo ; le CRM n'envoie que les données ci-dessous.
 *
 * Paramètres disponibles dans les modèles ({{ params.X }}) :
 *   PRENOM, DATE (« mardi 14 octobre à 17h00 »), HEURE (« 17h00 »),
 *   MODE (visio | telephone | presentiel), ADRESSE, CAMPUS, ITINERAIRE,
 *   CODE_ENTREE, LIEN_VISIO, LIEN_CONFIRMATION, CONFIRME (« oui » ou vide),
 *   LIEN_REPLANIF, PROSPECT
 *
 * Medibox garde ses mails codés (lib/email-reminders.ts + lib/rdv-brand.ts).
 * Si l'envoi par modèle échoue, lib/email-reminders.ts renvoie le mail codé.
 */

import { campusShortLabel } from '@/lib/campus'
import { isMediboxBrand } from '@/lib/rdv-brand'

export type RdvEmailKind =
  | 'booking' | '48h' | '24h' | 'morning' | 'visio1h' | 'visio5min' | 'replanif' | 'modeChange' | 'participant'

/** IDs des modèles Brevo (compte Diploma Santé). */
export const RDV_BREVO_TEMPLATE_IDS: Record<RdvEmailKind, number> = {
  booking: 168,
  '48h': 169,
  '24h': 170,
  morning: 171,
  visio1h: 172,
  visio5min: 173,
  replanif: 174,
  modeChange: 175,
  participant: 176,
}

/**
 * Interrupteur général : passer à true une fois les modèles validés sur un
 * vrai envoi de test (RDV_EMAILS_BREVO_TEMPLATES=on/off force l'un ou l'autre).
 */
const TEMPLATES_LIVE = false

/** Les modèles sont aux couleurs Diploma : pas pour Medibox. */
export function usesBrevoTemplate(brand?: string | null): boolean {
  const env = process.env.RDV_EMAILS_BREVO_TEMPLATES
  const live = env === 'on' ? true : env === 'off' ? false : TEMPLATES_LIVE
  return live && !isMediboxBrand(brand)
}

/** Texte injecté dans le HTML du modèle : on retire les chevrons. */
const clean = (v: string | null | undefined) => String(v ?? '').replace(/[<>]/g, '').trim()

export function rdvTemplateParams(input: {
  firstName: string
  dateStr?: string | null
  heureStr?: string | null
  meetingType?: string | null
  /** Adresse du campus (présentiel) — rdv_appointments.meeting_link hors URL. */
  address?: string | null
  entryCode?: string | null
  visioLink?: string | null
  confirmUrl?: string | null
  confirmed?: boolean
  replanifUrl?: string | null
  prospectName?: string | null
}): Record<string, string> {
  const mode = input.meetingType === 'visio' ? 'visio' : input.meetingType === 'telephone' ? 'telephone' : 'presentiel'
  const address = clean(input.address)
  const short = campusShortLabel(address)
  return {
    PRENOM: clean(input.firstName),
    DATE: clean(input.dateStr),
    HEURE: clean(input.heureStr),
    MODE: mode,
    ADRESSE: address,
    CAMPUS: short ? short.replace(/^Rue /, 'rue ').replace(/^Quai /, 'quai ') : address,
    ITINERAIRE: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '',
    CODE_ENTREE: clean(input.entryCode),
    LIEN_VISIO: clean(input.visioLink),
    LIEN_CONFIRMATION: clean(input.confirmUrl),
    CONFIRME: input.confirmed ? 'oui' : '',
    LIEN_REPLANIF: clean(input.replanifUrl),
    PROSPECT: clean(input.prospectName),
  }
}
