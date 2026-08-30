/**
 * Aperçu HTML emails — porté depuis Events Studio
 * (public/events-studio/index.html : pvWrap / pvConfEmail / pvEmail).
 */

import { defaultEmailBody, evAvant, evName, evPour, evRef, type CommsEventLike } from './comms-defaults'
import { eventUsesVisio, type EventBrand } from './config'

type BrandTheme = {
  name: string
  logo: string | null
  sender: string
  dark: string
  dark2: string
  accent: string
  surface: string
}

const BRAND_THEME: Record<EventBrand, BrandTheme> = {
  diploma: {
    name: 'Diploma Santé',
    logo: 'https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png',
    sender: 'admissions@diploma-sante.fr',
    dark: '#1C2436',
    dark2: '#232D44',
    accent: '#C2AB82',
    surface: '#F5F2EC',
  },
  medibox: {
    name: 'Medibox',
    logo: null,
    sender: 'contact@medibox.fr',
    dark: '#0C2E2B',
    dark2: '#124540',
    accent: '#199481',
    surface: '#F2F6F4',
  },
  edumove: {
    name: 'Edumove',
    logo: 'https://www.edumove.fr/edumove-logo.svg',
    sender: 'admissions@edumove.fr',
    dark: '#1B1D3A',
    dark2: '#26284A',
    accent: '#EC680A',
    surface: '#F6F5F2',
  },
}

export type PreviewEvent = CommsEventLike & {
  brief?: string | null
  brand?: string | null
}

function esc(str: string) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function brandOf(ev: PreviewEvent): BrandTheme {
  const id = (ev.brand || 'diploma') as EventBrand
  return BRAND_THEME[id] || BRAND_THEME.diploma
}

function timeRange(ev: PreviewEvent) {
  if (!ev.event_date) return ''
  const d = new Date(ev.event_date)
  const s = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  return ev.event_time_end ? `De ${s} à ${ev.event_time_end}` : `À ${s}`
}

function startTime(ev: PreviewEvent) {
  if (!ev.event_date) return ''
  return new Date(ev.event_date).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

function dateLong(ev: PreviewEvent) {
  if (!ev.event_date) return ''
  const s = new Date(ev.event_date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Paris',
  })
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

function visioBtn(url: string) {
  return `<div style="background:linear-gradient(135deg,#2D8CFF,#1A6FD1);border-radius:12px;padding:24px;margin:28px 0;text-align:center;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.8);margin:0 0 12px;font-weight:700;">Rejoindre la visioconférence</p><a href="${esc(url)}" style="display:inline-block;background:#FFF;color:#2D8CFF!important;font-size:15px;font-weight:700;padding:14px 32px;border-radius:100px;text-decoration:none;">Rejoindre →</a><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:12px 0 0;word-break:break-all;">${esc(url)}</p></div>`
}

function qrBlk() {
  return `<div style="background:#F5F2EC;border-radius:16px;padding:32px;text-align:center;margin:28px auto;max-width:360px;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#C2AB82;margin:0 0 20px;font-weight:700;">Votre QR Code</p><div style="width:220px;height:220px;margin:0 auto;border-radius:12px;border:3px solid #1C2436;background:#fff;display:flex;align-items:center;justify-content:center;color:#9A9A9A;font-size:13px;">QR code personnel</div><div style="width:48px;height:2px;background:linear-gradient(90deg,transparent,#C2AB82,transparent);margin:20px auto;"></div><p style="font-size:14px;color:#3D4B5C;margin:0;">Présentez ce QR code <strong style="color:#1C2436;">à l'entrée</strong></p></div>`
}

function zoomSoonBlk() {
  return `<div style="background:linear-gradient(135deg,#2D8CFF,#1A6FD1);border-radius:12px;padding:24px;margin:28px 0;text-align:center;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.8);margin:0 0 12px;font-weight:700;">Visioconférence Zoom</p><p style="font-size:15px;color:#FFF;margin:0;line-height:1.5;">Le lien de connexion Zoom vous sera communiqué avant le webinaire.</p></div>`
}

/** Accès : Zoom pour webinaire, QR uniquement pour les événements physiques (JPO). */
function accessBlock(ev: PreviewEvent) {
  if (eventUsesVisio(ev)) {
    return ev.zoom_join_url ? visioBtn(ev.zoom_join_url) : zoomSoonBlk()
  }
  return qrBlk()
}

function briefBlock(ev: PreviewEvent, accent: string) {
  if (!ev.brief) return ''
  const lines = ev.brief
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const content =
    lines.length > 1
      ? `<ul style="margin:0;padding:0;list-style:none;">${lines
          .map(
            (l) =>
              `<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;"><span style="color:${accent};font-size:16px;flex-shrink:0;line-height:1.5;font-weight:700;">✓</span><span style="font-size:15px;line-height:1.7;color:#3D4B5C;">${esc(l)}</span></li>`,
          )
          .join('')}</ul>`
      : `<p style="font-size:15px;line-height:1.7;color:#3D4B5C;margin:0;">${esc(ev.brief)}</p>`
  return `<div style="background:linear-gradient(135deg,#F5F2EC,#EDE8DF);border-radius:12px;padding:24px;margin:24px 0;border-left:4px solid ${accent};"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:${accent};margin:0 0 16px;font-weight:700;">Ce qui vous attend</p>${content}</div>`
}

function detailTbl(ev: PreviewEvent, accent: string, dark: string) {
  const vis = eventUsesVisio(ev)
  const loc = vis ? 'Visioconférence' : ev.location || 'À confirmer'
  return `<h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:${dark};margin:0 0 20px;padding-bottom:14px;border-bottom:1.5px solid #EAE8E3;">Détails</h2><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="padding:8px 16px 8px 0;vertical-align:top;width:50%;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${accent};margin:0 0 4px;font-weight:700;">Événement</p><p style="font-size:16px;color:${dark};margin:0;font-weight:700;">${esc(evName(ev))}</p></td><td style="padding:8px 0 8px 16px;vertical-align:top;width:50%;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${accent};margin:0 0 4px;font-weight:700;">Date</p><p style="font-size:16px;color:${dark};margin:0;font-weight:700;">${dateLong(ev)}<br>${timeRange(ev)}</p></td></tr><tr><td style="padding:8px 16px 8px 0;vertical-align:top;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${accent};margin:0 0 4px;font-weight:700;">Lieu</p><p style="font-size:16px;color:${dark};margin:0;font-weight:700;">${esc(loc)}</p></td><td style="padding:8px 0 8px 16px;vertical-align:top;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${accent};margin:0 0 4px;font-weight:700;">Participant</p><p style="font-size:16px;color:${dark};margin:0;font-weight:700;">Jean Dupont</p></td></tr></table>`
}

function wrap(ev: PreviewEvent, heroT: string, heroS: string, body: string, access: string) {
  const b = brandOf(ev)
  const logoBlock = b.logo
    ? `<img src="${b.logo}" alt="${esc(b.name)}" width="260" style="display:block;margin:0 auto;width:260px;">`
    : `<span style="display:inline-block;font-size:26px;font-weight:700;letter-spacing:5px;color:${b.dark};font-family:'DM Sans',Arial,sans-serif;">${esc(b.name).toUpperCase()}</span>`
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:${b.surface};font-family:'DM Sans',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:${b.surface};"><tr><td align="center" style="padding:24px 16px;"><div style="text-align:center;padding:28px 0 20px;background:#FFF;border-radius:16px 16px 0 0;max-width:640px;margin:0 auto;">${logoBlock}</div><table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;"><tr><td><div style="background:${b.dark};padding:32px 32px 40px;text-align:center;"><h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:28px;line-height:1.2;color:#FFF;margin:0 0 16px;">${heroT}</h1><p style="font-size:16px;line-height:1.65;color:rgba(255,255,255,0.72);max-width:440px;margin:0 auto;">${heroS}</p><div style="width:48px;height:2px;background:linear-gradient(90deg,${b.accent},transparent);margin:28px auto 0;"></div></div></td></tr><tr><td><div style="background:#FFF;padding:36px 32px;">${body}${access}</div></td></tr><tr><td><div style="background:${b.dark};padding:40px 32px;text-align:center;border-radius:0 0 16px 16px;"><h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:#FFF;margin:0 0 12px;">À très bientôt !</h2><p style="font-size:15px;line-height:1.65;color:rgba(255,255,255,0.65);margin:0 0 24px;">Nous avons hâte de vous retrouver. N'hésitez pas à nous contacter !</p><a href="mailto:${b.sender}" style="display:inline-block;background:${b.accent};color:${b.dark}!important;font-size:15px;font-weight:700;padding:14px 32px;border-radius:100px;text-decoration:none;">Nous contacter →</a><p style="margin-top:16px;font-size:11px;color:rgba(255,255,255,0.3);">${esc(b.name)}</p></div></td></tr></table><p style="font-size:11px;color:#9A9A9A;text-align:center;margin:24px 0 0;">© ${new Date().getFullYear()} ${esc(b.name)}</p></td></tr></table></body></html>`
}

function confEmail(ev: PreviewEvent, customBody: string) {
  const b = brandOf(ev)
  const vis = eventUsesVisio(ev)
  const tip = vis
    ? ev.zoom_join_url
      ? 'Gardez le <strong style="color:#1C2436;">lien de connexion</strong> ci-dessus à portée de main pour le jour J.'
      : 'Le <strong style="color:#1C2436;">lien Zoom</strong> vous sera envoyé avant le webinaire.'
    : 'Astuce : faites une <strong style="color:#1C2436;">capture d\'écran</strong> du QR code pour y accéder facilement.'
  const heroSub = customBody.trim()
    ? esc(customBody).replace(/\{prenom\}/g, `<strong style="color:${b.accent};">Jean</strong>`)
    : vis
      ? `Merci pour votre inscription ! Nous avons hâte de vous accueillir. ${
          ev.zoom_join_url
            ? 'Le lien de connexion se trouve ci-dessous.'
            : 'Vous recevrez le lien Zoom avant le webinaire.'
        }`
      : `Merci pour votre inscription ! Nous avons hâte de vous accueillir. Votre QR code personnel se trouve ci-dessous.`
  // access is embedded in body for confirmation (Studio behavior)
  return wrap(
    ev,
    `<em style="font-style:italic;color:${b.accent};">Votre inscription</em><br>est confirmée !`,
    heroSub,
    `${detailTbl(ev, b.accent, b.dark)}${briefBlock(ev, b.accent)}${accessBlock(ev)}<div style="background:#F5F2EC;border-left:4px solid ${b.accent};border-radius:0 12px 12px 0;padding:20px 24px;"><p style="font-size:15px;line-height:1.7;color:#3D4B5C;margin:0;font-style:italic;">${tip}</p></div>`,
    '',
  )
}

function reminderEmail(ev: PreviewEvent, type: string, customBody: string) {
  const b = brandOf(ev)
  const vis = eventUsesVisio(ev)
  const loc = vis ? 'Visioconférence' : ev.location || 'À confirmer'
  const ds = dateLong(ev)
  const sT = startTime(ev)
  const bodyText = customBody.trim() || defaultEmailBody(ev, type)
  const p = `<p style="font-size:16px;line-height:1.7;color:#3D4B5C;margin:0 0 24px;">${esc(bodyText).replace(
    /\{prenom\}/g,
    `<strong style="color:${b.dark};">Jean</strong>`,
  )}</p>`
  const heroes: Record<string, [string, string]> = {
    'j-5': [
      `Plus que <em style="font-style:italic;color:${b.accent};">5 jours</em><br>${esc(evAvant(ev))} !`,
      `Nous avons hâte de vous retrouver !`,
    ],
    'j-3': [
      `<em style="font-style:italic;color:${b.accent};">J-3</em> — Préparez-vous !`,
      `Plus que 3 jours ${esc(evAvant(ev))} !`,
    ],
    'j-2': [
      `<em style="font-style:italic;color:${b.accent};">Après-demain,</em><br>c'est le jour J !`,
      `Le compte à rebours est lancé !`,
    ],
    'j-1': [
      `<em style="font-style:italic;color:${b.accent};">C'est demain !</em><br>On vous attend`,
      `Rendez-vous demain ${esc(evPour(ev))} !`,
    ],
    'j-0-matin': [`C'est <em style="font-style:italic;color:${b.accent};">aujourd'hui</em> !`, `Le grand jour est arrivé !`],
    'j-7': [
      `Plus qu'<em style="font-style:italic;color:${b.accent};">une semaine</em> !`,
      `${esc(evRef(ev, true))} approche.`,
    ],
    'j-0-10h': [`C'est <em style="font-style:italic;color:${b.accent};">ce soir</em> !`, `On vous attend.`],
    'j-0-18h25': [`Dans <em style="font-style:italic;color:${b.accent};">5 minutes</em> !`, `Rejoignez-nous.`],
  }
  const [heroT, heroS] = heroes[type] || [`Rappel — ${esc(evName(ev))}`, `Petit rappel !`]
  let extra = ''
  if (type === 'j-3') {
    const lI = vis ? 'En visioconférence.' : ev.location || 'À confirmer'
    extra = `<h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:${b.dark};margin:0 0 20px;padding-bottom:14px;border-bottom:1.5px solid #EAE8E3;">Infos pratiques</h2><p style="font-size:15px;color:#3D4B5C;margin:0 0 8px;"><strong style="color:${b.dark};">📅 Date :</strong> ${ds} ${timeRange(ev).toLowerCase()}</p><p style="font-size:15px;color:#3D4B5C;margin:0 0 8px;"><strong style="color:${b.dark};">📍 ${vis ? 'Connexion' : 'Lieu'} :</strong> ${esc(lI)}</p><p style="font-size:15px;color:#3D4B5C;margin:0 0 24px;"><strong style="color:${b.dark};">⏰ Conseil :</strong> Soyez prêt(e) 15 minutes en avance pour profiter pleinement de l'événement.</p>`
  }
  if (type === 'j-2') {
    extra = `<div style="background:linear-gradient(135deg,${b.dark},${b.dark2});border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:${b.accent};margin:0 0 8px;font-weight:700;">Rendez-vous</p><p style="font-size:18px;color:#FFF;margin:0 0 4px;font-weight:700;">${ds} ${timeRange(ev)}</p><p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0;">${esc(loc)}</p></div>`
  }
  if (type === 'j-1') {
    extra = `<div style="background:linear-gradient(135deg,${b.accent},#D4C49E);border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:${b.dark};margin:0 0 8px;font-weight:700;">Demain</p><p style="font-size:22px;color:${b.dark};margin:0 0 4px;font-weight:700;font-family:'DM Serif Display',Georgia,serif;">${sT}${!vis && ev.location ? ' — ' + esc(ev.location) : ''}</p><p style="font-size:14px;color:rgba(28,36,54,0.7);margin:0;">${esc(evName(ev))}</p></div>`
  }
  if (type === 'j-0-matin' || type === 'j-0-10h') {
    extra = `<div style="background:linear-gradient(135deg,${b.accent},#D4C49E);border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;"><p style="font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:${b.dark};margin:0 0 8px;font-weight:700;">Aujourd'hui</p><p style="font-size:22px;color:${b.dark};margin:0;font-weight:700;font-family:'DM Serif Display',Georgia,serif;">${timeRange(ev)}${!vis && ev.location ? ' — ' + esc(ev.location) : ''}</p></div>`
  }
  const details = type === 'j-5' || type === 'j-7' ? detailTbl(ev, b.accent, b.dark) : ''
  // Webinaire J-1 / Jour J : toujours afficher le bloc Zoom (ou « à venir »)
  const forceZoomAccess =
    vis && (type === 'j-1' || type.startsWith('j-0-') || type === 'confirmation' || type === 'j-3')
  const access = forceZoomAccess || !vis ? accessBlock(ev) : ''
  return wrap(ev, heroT, heroS, `${p}${briefBlock(ev, b.accent)}${extra}${details}`, access)
}

/** HTML complet du mail envoyé (comme Events Studio). */
export function buildEmailHtmlPreview(ev: PreviewEvent, stepId: string, customBody: string): string {
  if (stepId === 'confirmation') return confEmail(ev, customBody)
  return reminderEmail(ev, stepId, customBody)
}

export function brandSender(brand?: string | null): string {
  const id = (brand || 'diploma') as EventBrand
  return (BRAND_THEME[id] || BRAND_THEME.diploma).sender
}
