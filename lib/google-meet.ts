/**
 * lib/google-meet.ts
 *
 * Génère un lien Google Meet unique pour un RDV en visio, via l'API Google
 * Calendar (création d'un événement avec conférence Meet).
 *
 * Pourquoi Meet plutôt que LiveKit/Jitsi : sur iPad/Safari, le partage d'écran
 * (getDisplayMedia) n'existe pas dans le navigateur. L'application native
 * Google Meet, elle, permet le partage d'écran. On bascule donc les visios sur
 * de vrais liens meet.google.com.
 *
 * Fonctionnement :
 *   - Un "compte de service" Google (robot) impersonne un compte organisateur
 *     du Workspace (délégation au niveau du domaine).
 *   - On crée un événement Calendar avec conferenceData.createRequest.
 *   - Google renvoie un lien Meet unique (res.data.hangoutLink).
 *   - sendUpdates: 'none' → Google n'envoie AUCUN email : nos propres emails/SMS
 *     restent la seule source de notification (pas de doublon).
 *
 * ENV VARS (Vercel) :
 *   - GOOGLE_SA_CLIENT_EMAIL : email du compte de service (champ client_email du JSON)
 *   - GOOGLE_SA_PRIVATE_KEY  : clé privée (champ private_key du JSON)
 *   - GOOGLE_MEET_ORGANIZER  : email Workspace organisateur (ex. agenda@diplomasante.com)
 */

import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

/** Indique si la config Google Meet est complète (sinon on retombe en mode dégradé). */
export function isGoogleMeetConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SA_CLIENT_EMAIL &&
      process.env.GOOGLE_SA_PRIVATE_KEY &&
      process.env.GOOGLE_MEET_ORGANIZER,
  )
}

/**
 * Normalise la clé privée : Vercel stocke les retours à la ligne sous forme
 * littérale "\n" — il faut les reconvertir en vrais sauts de ligne.
 */
function getPrivateKey(): string {
  return (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n')
}

export interface CreateMeetEventInput {
  /** Titre de l'événement (ex. "RDV Diploma Santé — Jean Dupont"). */
  summary: string
  /** Début ISO (ex. "2026-06-20T14:00:00.000Z"). */
  startAtIso: string
  /** Fin ISO. */
  endAtIso: string
  /** Email du prospect (optionnel — ajouté en invité, sans notification). */
  prospectEmail?: string | null
  /** Email du closer (optionnel — ajouté en invité, sans notification). */
  closerEmail?: string | null
  /** Description libre (optionnel). */
  description?: string | null
}

export interface CreateMeetEventResult {
  /** Lien Meet (ex. https://meet.google.com/abc-defg-hij). */
  meetLink: string
  /** ID de l'événement Calendar — utile pour annuler/replanifier plus tard. */
  eventId: string | null
}

/**
 * Crée un événement Calendar avec conférence Meet et retourne le lien.
 * Retourne `null` si la config est absente ou si l'appel Google échoue
 * (best-effort : la création du RDV ne doit jamais planter à cause de Meet).
 */
export async function createMeetEvent(
  input: CreateMeetEventInput,
): Promise<CreateMeetEventResult | null> {
  if (!isGoogleMeetConfigured()) {
    console.warn('[google-meet] Config incomplète — lien Meet non généré')
    return null
  }

  const organizer = process.env.GOOGLE_MEET_ORGANIZER as string

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SA_CLIENT_EMAIL,
      key: getPrivateKey(),
      scopes: SCOPES,
      // Impersonation du compte organisateur via délégation domaine.
      subject: organizer,
    })

    const calendar = google.calendar({ version: 'v3', auth })

    const attendees: { email: string }[] = []
    if (input.prospectEmail) attendees.push({ email: input.prospectEmail })
    if (input.closerEmail && input.closerEmail !== input.prospectEmail) {
      attendees.push({ email: input.closerEmail })
    }

    const requestId = `rdv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    const res = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      // Aucune notification Google : on garde nos emails/SMS comme seule source.
      sendUpdates: 'none',
      requestBody: {
        summary: input.summary,
        description: input.description || undefined,
        start: { dateTime: input.startAtIso, timeZone: 'Europe/Paris' },
        end: { dateTime: input.endAtIso, timeZone: 'Europe/Paris' },
        attendees: attendees.length ? attendees : undefined,
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    })

    const meetLink =
      res.data.hangoutLink ||
      res.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === 'video',
      )?.uri ||
      null

    if (!meetLink) {
      console.error('[google-meet] Événement créé mais aucun lien Meet retourné', {
        eventId: res.data.id,
      })
      return null
    }

    return { meetLink, eventId: res.data.id || null }
  } catch (e) {
    console.error('[google-meet] Échec création événement Meet:', e)
    return null
  }
}
