/**
 * Templates email / SMS par défaut — portés depuis Events Studio
 * (public/events-studio/index.html : pvEmailSubject / pvEmailBody / pvSmsBody).
 */

import { eventUsesVisio } from './config'
import { emailStepsFor, smsStepsFor } from './comms-steps'

export type CommsEventLike = {
  name?: string | null
  article?: string | null
  event_date?: string | null
  event_time_end?: string | null
  location?: string | null
  zoom_join_url?: string | null
  event_type?: string | null
  brand?: string | null
}

export type EmailValue = { subject: string; body: string }

function ucfirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

function fixPortesOuvertesText(text: string) {
  if (!text) return text
  return text.replace(/portes ouverte\b/gi, (m) =>
    m[0] === 'P' ? 'Portes ouvertes' : m === m.toUpperCase() ? 'PORTES OUVERTES' : 'portes ouvertes',
  )
}

function evName(ev: CommsEventLike) {
  return fixPortesOuvertesText(ev.name || '')
}

function evNom(ev: CommsEventLike, maj = false) {
  const a = ev.article || 'le'
  const sep = a === "l'" ? '' : ' '
  const art = maj ? ucfirst(a) : a
  return art + sep + evName(ev)
}

function evPour(ev: CommsEventLike) {
  return 'pour ' + evNom(ev)
}

function timeRangePlain(ev: CommsEventLike) {
  if (!ev.event_date) return ''
  const d = new Date(ev.event_date)
  const s = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  return ev.event_time_end ? `de ${s} a ${ev.event_time_end}` : `a ${s}`
}

function dateLong(ev: CommsEventLike) {
  if (!ev.event_date) return ''
  return new Date(ev.event_date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  })
}

export function defaultEmailSubject(ev: CommsEventLike, type: string): string {
  const n = evNom(ev)
  const N = evNom(ev, true)
  const name = evName(ev)
  const map: Record<string, string> = {
    confirmation: `Inscription confirmée — ${name}`,
    'j-5': `J-5 — ${N} approche !`,
    'j-3': `J-3 — Préparez-vous ${evPour(ev)}`,
    'j-2': `Après-demain, c'est ${n} !`,
    'j-1': `C'est DEMAIN — ${name}`,
    'j-0-matin': `C'est AUJOURD'HUI — ${name} !`,
    'j-7': `J-7 — ${name}`,
    'j-0-10h': `C'est ce soir — ${name}`,
    'j-0-18h25': `${name} commence dans 5 minutes`,
  }
  return map[type] || `Rappel — ${name}`
}

export function defaultEmailBody(ev: CommsEventLike, type: string): string {
  const vis = eventUsesVisio(ev)
  const n = evNom(ev)
  const N = evNom(ev, true)
  const p = evPour(ev)
  const zoom = (ev.zoom_join_url || '').trim()
  const map: Record<string, string> = {
    confirmation: vis
      ? `Merci pour votre inscription ! Nous avons hâte de vous accueillir. ${
          zoom
            ? 'Le lien de connexion se trouve ci-dessous.'
            : 'Vous recevrez le lien Zoom avant le webinaire (mails J-1 et jour J).'
        }`
      : `Merci pour votre inscription ! Nous avons hâte de vous accueillir. Votre QR code personnel se trouve ci-dessous.`,
    'j-5': `Bonjour {prenom}, ${N} approche à grands pas et nous sommes impatients de vous y accueillir !`,
    'j-3': `Bonjour {prenom}, ${N} est dans 3 jours et nous avons hâte de partager ce moment avec vous !`,
    'j-2': `Bonjour {prenom}, c'est après-demain et nous avons vraiment hâte de vous retrouver ${p} !`,
    'j-1': vis
      ? zoom
        ? `Bonjour {prenom}, c'est demain ! Toute l'équipe a hâte de vous retrouver ${p}. Voici le lien Zoom pour vous connecter : ${zoom}`
        : `Bonjour {prenom}, c'est demain ! Toute l'équipe a hâte de vous retrouver ${p}. Le lien Zoom se trouve ci-dessous.`
      : `Bonjour {prenom}, c'est demain ! Toute l'équipe Diploma Santé a hâte de vous accueillir ${p}.`,
    'j-0-matin': vis
      ? zoom
        ? `C'est le jour J ! Nous sommes ravis de vous retrouver ${p}. Rejoignez le webinaire Zoom : ${zoom}`
        : `C'est le jour J ! Nous sommes ravis de vous retrouver ${p}. Le lien Zoom se trouve ci-dessous.`
      : `C'est le jour J ! Nous sommes ravis de vous retrouver ${p}.`,
    'j-7': `Bonjour {prenom}, ${N} a lieu dans 7 jours. Bloquez la date !`,
    'j-0-10h': vis
      ? zoom
        ? `Bonjour {prenom}, c'est ce soir ! Rejoignez le webinaire : ${zoom}`
        : `Bonjour {prenom}, c'est ce soir ! Le lien Zoom se trouve ci-dessous.`
      : `Bonjour {prenom}, c'est ce soir ! Nous avons hâte de vous retrouver ${p}.`,
    'j-0-18h25': vis
      ? zoom
        ? `Bonjour {prenom}, ${n} commence dans quelques minutes. Rejoignez-nous : ${zoom}`
        : `Bonjour {prenom}, ${n} commence dans quelques minutes. Rejoignez-nous !`
      : `Bonjour {prenom}, ${n} commence dans quelques minutes. Rejoignez-nous !`,
  }
  return map[type] || `Rappel ${p}. Nous avons hâte de vous y voir !`
}

export function defaultSmsBody(ev: CommsEventLike, type: string): string {
  const ds = dateLong(ev)
  const ti = timeRangePlain(ev)
  const vis = eventUsesVisio(ev)
  const loc = !vis && ev.location ? ' - ' + ev.location : ''
  const zoom = ev.zoom_join_url || ''
  const n = evNom(ev)
  const p = evPour(ev)
  const map: Record<string, string> = {
    confirmation: vis
      ? `{prenom}, votre inscription au webinaire "${evName(ev)}" est confirmee ! RDV le ${ds} ${ti}. ${
          zoom ? `Lien Zoom : ${zoom}` : 'Vous recevrez le lien Zoom avant le webinaire.'
        }`
      : `{prenom}, super nouvelle ! Votre inscription ${p} est confirmee ! On a hate de vous retrouver le ${ds} ${ti}${loc}. Ca va etre un moment enrichissant !`,
    'j-5': `{prenom}, plus que 5 jours avant ${n} ! On a vraiment hate de vous retrouver le ${ds} ${ti}. Ca va etre un super moment !`,
    'j-3': `{prenom}, J-3 avant ${n} ! Le compte a rebours est lance et on a hate d'y etre ! RDV le ${ds} ${ti}${loc}.`,
    'j-2': `{prenom}, apres-demain c'est ${n} ! On est impatients de vous accueillir le ${ds} ${ti}${loc}.`,
    'j-1': vis
      ? `{prenom}, c'est DEMAIN ! Webinaire "${evName(ev)}" ${ti}. ${
          zoom ? `Lien Zoom : ${zoom}` : 'Le lien Zoom vous sera envoye demain.'
        }`
      : `{prenom}, c'est DEMAIN ! On se retrouve ${p} ${ti}${loc}. Toute l'equipe vous attend avec impatience !`,
    'j-0-matin': vis
      ? `{prenom}, c'est AUJOURD'HUI ! Webinaire "${evName(ev)}" ${ti}. ${
          zoom ? `Rejoignez-nous : ${zoom}` : 'Le lien Zoom arrive dans les prochains messages.'
        }`
      : `{prenom}, c'est AUJOURD'HUI ! On est ravis de vous retrouver ${p} ${ti}${loc}. A tout de suite !`,
    'j-0-11h': `{prenom}, ${n} ${vis ? 'est en cours' : "c'est cet apres-midi"} ${ti}. On vous attend !${
      vis ? (zoom ? ` ${zoom}` : ' Connectez-vous vite !') : ' Rejoignez-nous !'
    }`,
    'j-0-14h': `{prenom}, ${n} ${ti}. ${
      vis
        ? zoom
          ? `Connectez-vous : ${zoom}`
          : 'Connectez-vous, on vous attend !'
        : 'On vous attend sur place, a tout de suite !'
    }`,
    'j-0-5min': vis
      ? `{prenom}, le webinaire commence dans 5 minutes ! ${zoom ? `Rejoignez-nous : ${zoom}` : 'Rejoignez-nous vite !'}`
      : `{prenom}, ${n} commence dans 5 minutes ! On est prets, et vous ? A tout de suite !`,
    'j-7': `{prenom}, le webinaire "${evName(ev)}" a lieu dans 7 jours (${ds} a ${ti}). Bloquez la date !`,
    'j-0-10h': `{prenom}, c'est ce soir ! ${n} a ${ti}.${zoom ? ` Rejoignez-nous : ${zoom}` : ''}`,
    'j-0-18h25': `{prenom}, ${n} commence dans 5 min ! Rejoignez-nous vite.${zoom ? ` ${zoom}` : ''}`,
  }
  return map[type] || `Rappel: ${n} le ${ds}. On a hate de vous retrouver !`
}

export function buildDefaultCustomEmails(ev: CommsEventLike): Record<string, EmailValue> {
  const out: Record<string, EmailValue> = {}
  for (const step of emailStepsFor(ev)) {
    out[step.id] = {
      subject: defaultEmailSubject(ev, step.id),
      body: defaultEmailBody(ev, step.id),
    }
  }
  return out
}

export function buildDefaultCustomSms(ev: CommsEventLike): Record<string, string> {
  const out: Record<string, string> = {}
  for (const step of smsStepsFor(ev)) {
    out[step.id] = defaultSmsBody(ev, step.id)
  }
  return out
}

function mentionsQr(text: string | null | undefined): boolean {
  return /qr\s*code/i.test(String(text || ''))
}

/** Étapes où le lien Zoom doit figurer dans le corps (webinaire). */
const WEBINAR_ZOOM_EMAIL_STEPS = new Set(['j-1', 'j-0-matin', 'j-0-10h', 'j-0-18h25'])
const WEBINAR_ZOOM_SMS_STEPS = new Set([
  'j-1',
  'j-0-matin',
  'j-0-11h',
  'j-0-14h',
  'j-0-5min',
  'j-0-10h',
  'j-0-18h25',
])

function webinarBodyNeedsZoomRefresh(
  ev: CommsEventLike,
  stepId: string,
  text: string,
  kind: 'email' | 'sms',
): boolean {
  if (!eventUsesVisio(ev)) return false
  const steps = kind === 'email' ? WEBINAR_ZOOM_EMAIL_STEPS : WEBINAR_ZOOM_SMS_STEPS
  if (!steps.has(stepId)) return false
  if (/sur place/i.test(text) || mentionsQr(text)) return true
  const zoom = (ev.zoom_join_url || '').trim()
  if (!zoom) return false
  // Zoom enregistré mais absent du texte → injecter
  return !text.includes(zoom)
}

/** Fusionne custom existant avec defaults (custom gagne si non vide). */
export function mergeCommsWithDefaults(
  ev: CommsEventLike,
  customEmails?: Record<string, EmailValue | { subject?: string; body?: string }> | null,
  customSms?: Record<string, string> | null,
): { emails: Record<string, EmailValue>; sms: Record<string, string>; needsPersist: boolean } {
  const defaultsEmails = buildDefaultCustomEmails(ev)
  const defaultsSms = buildDefaultCustomSms(ev)
  const emails: Record<string, EmailValue> = { ...defaultsEmails }
  const sms: Record<string, string> = { ...defaultsSms }
  const vis = eventUsesVisio(ev)

  let hasAnyCustomEmail = false
  let hasAnyCustomSms = false
  let forcedFix = false

  for (const [k, v] of Object.entries(customEmails || {})) {
    if (v && (v.subject?.trim() || v.body?.trim())) {
      hasAnyCustomEmail = true
      const body = v.body?.trim() || ''
      const subject = v.subject?.trim() || ''
      if (
        (vis && (mentionsQr(body) || mentionsQr(subject))) ||
        webinarBodyNeedsZoomRefresh(ev, k, body, 'email')
      ) {
        emails[k] = defaultsEmails[k] || {
          subject: subject || defaultEmailSubject(ev, k),
          body: defaultEmailBody(ev, k),
        }
        forcedFix = true
        continue
      }
      emails[k] = { subject, body }
    }
  }
  for (const [k, v] of Object.entries(customSms || {})) {
    if (v?.trim()) {
      hasAnyCustomSms = true
      const text = v.trim()
      if ((vis && mentionsQr(text)) || webinarBodyNeedsZoomRefresh(ev, k, text, 'sms')) {
        sms[k] = defaultsSms[k] || defaultSmsBody(ev, k)
        forcedFix = true
        continue
      }
      sms[k] = text
    }
  }

  const needsPersist = !hasAnyCustomEmail || !hasAnyCustomSms || forcedFix
  return { emails, sms, needsPersist }
}
