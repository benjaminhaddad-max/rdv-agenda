/**
 * lib/email-reminders.ts
 *
 * Templates HTML des emails de relance avant un RDV (en parallele des SMS).
 *
 *  - 48h : confirmation avec lien
 *  - 24h : relance si prospect pas confirme
 *  - matin : rappel + lien visio si applicable
 *
 * Tous les emails utilisent un layout simple, branded Diploma Sante.
 * Le destinataire principal est `prospect_email` ; si `email_parent` est
 * renseigne il est ajoute en cc.
 */

import { sendBrevoEmail } from '@/lib/brevo'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://rdv-agenda.vercel.app'
const PREPA_ADDRESS = process.env.PREPA_ADDRESS || 'nos locaux à Paris'
const PREPA_CODE = process.env.PREPA_CODE || ''
const REPLANIF_URL = process.env.REPLANIF_URL || SITE_URL

const SENDER = {
  email: process.env.BREVO_SENDER_EMAIL || 'rdv@diploma-sante.fr',
  name: process.env.BREVO_SENDER_NAME || 'Diploma Santé',
}

// ─── Layout commun ──────────────────────────────────────────────────────────
// Couleurs charte Diploma Santé 2026 :
//  - Bleu Nuit  #12314d (texte principal)
//  - Bleu Foncé #1a2438 (accents profonds)
//  - Bleu Diploma #4fabdb (liens, CTA, accents)
//  - Doré web   #c6aa7c (liseré premium)
//  - Gris clair #dddddc (bordures)
type LayoutOptions = {
  heroTitle?: string
  heroSubtitle?: string
  finalCtaUrl?: string
  finalCtaLabel?: string
  finalFootnote?: string
}

function emailLayout(content: string, options?: LayoutOptions): string {
  const finalCta = options?.finalCtaUrl && options?.finalCtaLabel ? `
  <tr>
    <td>
      <div class="cta-section" style="background:#1C2436; padding:44px 20px; text-align:center;" bgcolor="#1C2436" align="center">
        <p style="font-family:'DM Serif Display', Georgia, serif; font-size:22px; color:#FFFFFF; margin:0 0 14px; line-height:1.3;">Une question ?</p>
        <p style="font-size:16px; line-height:1.75; color:rgba(255,255,255,0.7); margin:0 0 28px; max-width:420px; margin-left:auto; margin-right:auto;">
          Notre équipe est disponible pour vous accompagner.
        </p>
        <a href="${options.finalCtaUrl}" style="display:inline-block; background-color:#C2AB82; color:#1C2436 !important; font-family:'DM Sans',Arial,sans-serif; font-size:16px; font-weight:700; padding:14px 32px; border-radius:100px; text-decoration:none;">
          ${options.finalCtaLabel}
        </a>
        ${options.finalFootnote ? `<p style="margin-top:16px; font-size:14px; color:rgba(255,255,255,0.5);">${options.finalFootnote}</p>` : ''}
      </div>
    </td>
  </tr>` : ''

  return `
<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style type="text/css">
  body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .body-section { padding: 28px 20px 44px !important; }
    .cta-section { padding: 36px 20px !important; }
  }
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Matter','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#12314d">
  <div style="text-align:center; padding:20px 0 8px; background-color:#FFFFFF;">
    <img src="https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png" alt="Diploma Santé" width="260" style="display:block; margin:0 auto; width:260px;">
  </div>

  <table class="email-container" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse; max-width:640px; margin:0 auto;">
    <tr>
      <td>
        <div class="body-section" style="background-color:#FFFFFF; padding:16px 20px 44px; font-size:16px; line-height:1.65; color:#3D4B5C;" bgcolor="#FFFFFF">
          ${content}
          <p style="margin:20px 0 4px;color:#3D4B5C">Bien à vous,</p>
          <p style="margin:0;font-weight:700;color:#1C2436">L'équipe Diploma Santé</p>
        </div>
      </td>
    </tr>
    ${finalCta}
  </table>
</body></html>`
}

// ─── Helpers graphiques partagés (charte Diploma Santé) ─────────────────────

/** Numéro stylisé doré (cercle) pour les listes. */
const numberedItem = (n: number, html: string) => `
  <tr>
    <td style="vertical-align:top;padding:0 12px 12px 0;width:28px">
      <div style="width:24px;height:24px;border-radius:50%;background:#fbf3e3;color:#a4844c;font-size:14px;font-weight:700;text-align:center;line-height:24px">${n}</div>
    </td>
    <td style="vertical-align:top;padding:2px 0 12px 0;color:#3a4a5b;font-size:16px;line-height:1.65">${html}</td>
  </tr>
`

/** Eyebrow de section : petit trait doré + label uppercase. */
const sectionTitle = (label: string) => `
  <p style="margin:8px 0 14px;font-weight:700;color:#12314d;font-size:16px;letter-spacing:1.2px">
    <span style="display:inline-block;width:18px;height:2px;background:#c6aa7c;vertical-align:middle;margin-right:10px;margin-bottom:3px"></span>${label}
  </p>
`

/** Icône calendrier (utilisée dans le bloc RDV). */
const iconCalendar = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c6aa7c" stroke-width="1.8" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`

/** Forme organique décorative (clin d'œil au serpent isotype). */
const shapeRdv = `<svg width="74" height="22" viewBox="0 0 74 22" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;position:absolute;right:14px;top:14px;opacity:0.55"><path d="M2 11 Q 12 1, 22 11 T 42 11 T 62 11" stroke="#4fabdb" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="68" cy="11" r="2.2" fill="#c6aa7c"/></svg>`

/** Bloc encadré "Votre rendez-vous" — box avec barre dorée + flèche dorée. */
const rdvBox = (dateStr: string, meetingLabel: string, eyebrow = 'Votre rendez-vous') => `
  <table cellpadding="0" cellspacing="0" style="margin:22px 0 26px;border-collapse:separate;width:100%;max-width:520px">
    <tr>
      <td style="position:relative;background:linear-gradient(135deg,#f6f9fc 0%,#eef4fa 100%);border-left:3px solid #c6aa7c;border-radius:0 10px 10px 0;padding:18px 22px">
        ${shapeRdv}
        <p style="margin:0 0 12px">
          <span style="display:inline-block;background:#fff5e6;color:#a4844c;font-size:14px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;padding:4px 10px;border-radius:3px">${eyebrow}</span>
        </p>
        <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#12314d;line-height:1.5">
          ${iconCalendar}&nbsp;&nbsp;${dateStr}
        </p>
        <p style="margin:0;font-size:16px;color:#5b6b7a;line-height:1.6"><span style="color:#c6aa7c;font-weight:700;margin-right:6px">→</span>${meetingLabel}</p>
      </td>
    </tr>
  </table>
`

/** Construit le label du type de RDV (visio / téléphone / présentiel). */
function getMeetingLabel(meetingType: string | null, meetingLink?: string | null): string {
  if (meetingType === 'visio') return 'En visioconférence (lien envoyé le matin du RDV)'
  if (meetingType === 'telephone') return 'Par téléphone — notre équipe vous appelle au numéro communiqué'
  return `En présentiel — ${resolvePresentielCampus(meetingLink)}`
}

/** Construit la liste des items "Comment bien préparer le RDV". */
function getMeetingPrepItems(meetingType: string | null, meetingLink?: string | null): string[] {
  if (meetingType === 'visio') {
    return [
      `Vous recevrez le <strong>lien de visio</strong> par email le matin du rendez-vous.`,
      `Prévoyez un endroit calme, un casque ou des écouteurs si possible, et une connexion stable.`,
    ]
  }
  if (meetingType === 'telephone') {
    return [
      `Notre référent pédagogique vous appellera <strong>directement à l&rsquo;heure prévue</strong> sur le numéro que vous nous avez communiqué.`,
      `Prévoyez un endroit calme et assurez-vous d&rsquo;avoir du réseau au moment de l&rsquo;appel.`,
    ]
  }
  return [
    `Présentez-vous <strong>5 minutes avant l&rsquo;heure prévue</strong> à l&rsquo;accueil de l&rsquo;école.`,
    `Adresse : <strong>${resolvePresentielCampus(meetingLink)}</strong>${PREPA_CODE ? ` (code d&rsquo;entrée : <strong>${PREPA_CODE}</strong>)` : ''}.`,
  ]
}

interface ReminderTarget {
  prospectEmail: string
  emailParent?: string | null
}

export interface ReminderResult {
  ok: boolean
  error?: string
  messageId?: string
}

export async function sendBookingConfirmationEmail(
  target: ReminderTarget,
  firstName: string,
  dateStr: string,
  meetingType: string | null,
  meetingLink: string | null | undefined,
  apptId: string,
): Promise<ReminderResult> {
  const meetingLabel = getMeetingLabel(meetingType, meetingLink)
  const meetingPrepItems = getMeetingPrepItems(meetingType, meetingLink)
  const visioBlock = (meetingType === 'visio' && meetingLink) ? `
    ${sectionTitle('LIEN DE VISIO')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:separate">
      <tr>
        <td style="background:#12314d;border-radius:6px">
          <a href="${meetingLink}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.2px">
            Rejoindre la visioconférence&nbsp;&nbsp;→
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 22px;font-size:16px;color:#5b6b7a;line-height:1.6">
      Lien direct&nbsp;: <a href="${meetingLink}" style="color:#5b6b7a;text-decoration:underline;word-break:break-all">${meetingLink}</a>
    </p>
  ` : ''

  const content = `
    <p style="margin:0 0 14px">Bonjour <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 14px">
      Votre rendez-vous d&rsquo;orientation Diploma Santé est bien confirmé. Voici toutes les informations utiles.
    </p>

    ${rdvBox(dateStr, meetingLabel)}
    ${visioBlock}

    ${sectionTitle('COMMENT BIEN PRÉPARER LE RDV')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;border-collapse:collapse;width:100%">
      ${[
        ...meetingPrepItems,
        `Notez les <strong>questions</strong> que vous voulez aborder pendant l&rsquo;échange.`,
      ].map((html, i) => numberedItem(i + 1, html)).join('')}
    </table>
  `

  return sendReminderEmail({
    target,
    subject: `Confirmation de votre RDV Diploma Santé — ${dateStr}`,
    html: emailLayout(content, {
      heroTitle: 'Votre rendez-vous est confirmé',
      heroSubtitle: 'Retrouvez ici toutes les informations pratiques pour préparer sereinement votre échange.',
    }),
    tag: `reminder:booking:${apptId}`,
  })
}

// ─── Email 48h : confirmation ───────────────────────────────────────────────
export async function send48hConfirmEmail(
  target: ReminderTarget,
  firstName: string,
  dateStr: string,
  meetingType: string | null,
  meetingLink: string | null | undefined,
  token: string,
  apptId: string,
): Promise<ReminderResult> {
  const meetingLabel = getMeetingLabel(meetingType, meetingLink)
  const meetingPrepItems = getMeetingPrepItems(meetingType, meetingLink)
  const link = `${SITE_URL}/confirm/${token}`

  const content = `
    <p style="margin:0 0 14px">Bonjour <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 14px">
      Votre rendez-vous d&rsquo;orientation avec un référent pédagogique Diploma Santé est bien enregistré — merci de votre confiance&nbsp;!
      Ce moment d&rsquo;échange est conçu pour vous accompagner concrètement dans la construction de votre projet.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate;width:100%;max-width:520px">
      <tr>
        <td style="background:#0f2842;border-radius:10px;padding:18px 22px">
          <p style="margin:0 0 4px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.2px">Merci de confirmer votre présence.</p>
          <p style="margin:0 0 12px;color:#a8c4dd;font-size:16px;line-height:1.6">Un seul clic suffit — pas de formulaire, pas de mot de passe.</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#c6aa7c;border-radius:6px">
                <a href="${link}" style="display:inline-block;padding:12px 24px;color:#0f2842;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.3px">
                  ✓&nbsp;&nbsp;Confirmer ma présence
                </a>
              </td>
              <td style="padding-left:14px">
                <a href="${link}" style="color:#a8c4dd;text-decoration:underline;font-size:16px">ou cliquer ici</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${rdvBox(dateStr, meetingLabel)}

    ${sectionTitle('AU PROGRAMME DE NOTRE ÉCHANGE')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;width:100%">
      ${numberedItem(1, `Faire le point sur votre <strong>parcours actuel</strong> et vos objectifs (médecine, dentaire, kiné, pharma, sage-femme…).`)}
      ${numberedItem(2, `Identifier la <strong>préparation la plus adaptée</strong> à votre profil parmi nos parcours.`)}
      ${numberedItem(3, `Vous présenter notre <strong>méthode pédagogique</strong>, le déroulé de l&rsquo;année et les modalités pratiques.`)}
      ${numberedItem(4, `Répondre à toutes vos <strong>questions</strong> (rythme, internat, financement, débouchés…).`)}
    </table>

    ${sectionTitle('COMMENT BIEN PRÉPARER LE RDV')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;border-collapse:collapse;width:100%">
      ${[
        ...meetingPrepItems,
        `Dans la mesure du possible, ayez sous la main vos <strong>derniers bulletins</strong> ou résultats.`,
        `Notez les <strong>questions</strong> qui vous tiennent à cœur, on les abordera ensemble.`,
      ].map((html, i) => numberedItem(i + 1, html)).join('')}
    </table>
  `

  return sendReminderEmail({
    target,
    subject: `Votre rendez-vous Diploma Santé est confirmé — ${dateStr}`,
    html: emailLayout(content, {
      heroTitle: 'Plus que 48h avant votre rendez-vous',
      heroSubtitle: 'Un petit rappel pour tout préparer dans les meilleures conditions.',
    }),
    tag: `reminder:48h:${apptId}`,
  })
}

// ─── Email 24h : rappel + CTA "Confirmer ma présence" ──────────────────────
export async function send24hRelanceEmail(
  target: ReminderTarget,
  firstName: string,
  dateStr: string,
  meetingType: string | null,
  meetingLink: string | null | undefined,
  token: string,
  isConfirmedByProspect: boolean,
  apptId: string,
): Promise<ReminderResult> {
  const link = `${SITE_URL}/confirm/${token}`
  const meetingLabel = getMeetingLabel(meetingType, meetingLink)
  const meetingPrepItems = getMeetingPrepItems(meetingType, meetingLink)

  const content = `
    <p style="margin:0 0 14px">Bonjour <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 14px">
      Petit rappel&nbsp;: votre rendez-vous d&rsquo;orientation avec un référent pédagogique Diploma Santé est prévu <strong>demain</strong>.
      ${isConfirmedByProspect
        ? `Votre présence est déjà <strong>bien confirmée</strong>.`
        : `Pour nous aider à bien préparer notre échange, nous avons besoin de votre <strong>confirmation</strong>.`}
    </p>

    ${rdvBox(dateStr, meetingLabel, 'Demain')}

    ${!isConfirmedByProspect ? `
      <table cellpadding="0" cellspacing="0" style="margin:8px 0 22px;border-collapse:separate;width:100%;max-width:520px">
        <tr>
          <td style="background:#0f2842;border-radius:10px;padding:20px 22px">
            <p style="margin:0 0 4px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.2px">Un seul clic suffit pour confirmer votre présence.</p>
            <p style="margin:0 0 14px;color:#a8c4dd;font-size:16px;line-height:1.6">Pas de formulaire, pas de mot de passe — il suffit de cliquer sur le bouton ci-dessous, et c&rsquo;est validé.</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#c6aa7c;border-radius:6px">
                  <a href="${link}" style="display:inline-block;padding:13px 26px;color:#0f2842;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.3px">
                    ✓&nbsp;&nbsp;Confirmer ma présence
                  </a>
                </td>
                <td style="padding-left:14px">
                  <a href="${link}" style="color:#a8c4dd;text-decoration:underline;font-size:16px">ou cliquer ici</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    ` : ''}

    ${sectionTitle('COMMENT BIEN PRÉPARER LE RDV')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;border-collapse:collapse;width:100%">
      ${[
        ...meetingPrepItems,
        `Dans la mesure du possible, ayez sous la main vos <strong>derniers bulletins</strong> ou résultats.`,
        `Notez les <strong>questions</strong> qui vous tiennent à cœur, on les abordera ensemble.`,
      ].map((html, i) => numberedItem(i + 1, html)).join('')}
    </table>
  `

  return sendReminderEmail({
    target,
    subject: isConfirmedByProspect
      ? `Votre RDV de demain est bien confirmé`
      : `Votre RDV de demain — confirmez votre présence`,
    html: emailLayout(content, {
      heroTitle: 'Votre rendez-vous est demain',
      heroSubtitle: isConfirmedByProspect
        ? 'Votre présence est confirmée, voici votre rappel de la veille.'
        : 'Merci de confirmer votre présence en un clic pour finaliser votre créneau.',
    }),
    tag: `reminder:24h:${apptId}`,
  })
}

// ─── Email matin du RDV (J-0, envoyé à 9h) ─────────────────────────────────
export async function sendMorningEmail(
  target: ReminderTarget,
  firstName: string,
  heureStr: string,
  meetingType: string | null,
  meetingLink: string | null | undefined,
  apptId: string,
  /** Si true, on n'affiche PAS le CTA de confirmation (déjà confirmé la veille). */
  isConfirmed: boolean,
  /** Token de confirmation — utilisé seulement si !isConfirmed. */
  token: string,
): Promise<ReminderResult> {
  const meetingLabel = getMeetingLabel(meetingType, meetingLink)
  const confirmLink = `${SITE_URL}/confirm/${token}`

  // Bloc CTA "Confirmer ma présence" — affiché UNIQUEMENT si pas encore confirmé
  const confirmBlock = !isConfirmed ? `
    <table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate;width:100%;max-width:520px">
      <tr>
        <td style="background:#0f2842;border-radius:10px;padding:18px 22px">
          <p style="margin:0 0 4px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.2px">Vous n&rsquo;avez pas encore confirmé votre présence.</p>
          <p style="margin:0 0 12px;color:#a8c4dd;font-size:16px;line-height:1.6">Un seul clic suffit — pas de formulaire, pas de mot de passe.</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#c6aa7c;border-radius:6px">
                <a href="${confirmLink}" style="display:inline-block;padding:12px 24px;color:#0f2842;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.3px">
                  ✓&nbsp;&nbsp;Confirmer ma présence
                </a>
              </td>
              <td style="padding-left:14px">
                <a href="${confirmLink}" style="color:#a8c4dd;text-decoration:underline;font-size:16px">ou cliquer ici</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  ` : ''

  // Bloc visio (lien de connexion) — uniquement si visio + lien dispo
  const visioBlock = (meetingType === 'visio' && meetingLink) ? `
    ${sectionTitle('REJOINDRE LA VISIO')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:separate">
      <tr>
        <td style="background:#12314d;border-radius:6px">
          <a href="${meetingLink}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.2px">
            Rejoindre la visioconférence&nbsp;&nbsp;→
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 22px;font-size:16px;color:#5b6b7a;line-height:1.6">
      Lien direct&nbsp;: <a href="${meetingLink}" style="color:#5b6b7a;text-decoration:underline;word-break:break-all">${meetingLink}</a>
    </p>
  ` : ''

  // Section infos pratiques selon type de RDV
  const practicalItems = meetingType === 'visio'
    ? [
        `Connectez-vous <strong>5 minutes avant</strong> l&rsquo;heure prévue pour vérifier votre micro et votre caméra.`,
        `Installez-vous dans un endroit calme, casque ou écouteurs si possible.`,
        `Notez les <strong>questions</strong> que vous voulez aborder pendant l&rsquo;échange.`,
      ]
    : meetingType === 'telephone'
    ? [
        `Notre référent pédagogique vous appelle <strong>à l&rsquo;heure prévue</strong> sur votre numéro.`,
        `Assurez-vous d&rsquo;être <strong>joignable et au calme</strong> au moment de l&rsquo;appel.`,
        `Notez les <strong>questions</strong> que vous voulez aborder pendant l&rsquo;échange.`,
      ]
    : [
        `Présentez-vous <strong>5 minutes avant l&rsquo;heure prévue</strong> à l&rsquo;accueil de l&rsquo;école.`,
        `Adresse&nbsp;: <strong>${resolvePresentielCampus(meetingLink)}</strong>${PREPA_CODE ? ` (code d&rsquo;entrée&nbsp;: <strong>${PREPA_CODE}</strong>)` : ''}.`,
        `Notez les <strong>questions</strong> que vous voulez aborder pendant l&rsquo;échange.`,
      ]

  const content = `
    <p style="margin:0 0 14px">Bonjour <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 14px">
      C&rsquo;est <strong>aujourd&rsquo;hui</strong> votre rendez-vous d&rsquo;orientation avec un référent pédagogique Diploma Santé.
      ${isConfirmed
        ? `Votre présence est confirmée — on a hâte de vous rencontrer&nbsp;!`
        : `Pour finaliser, il nous manque juste votre confirmation de présence.`}
    </p>

    ${rdvBox(`Aujourd&rsquo;hui à ${heureStr}`, meetingLabel, "C'est aujourd'hui")}

    ${confirmBlock}

    ${visioBlock}

    ${sectionTitle('INFOS PRATIQUES')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;border-collapse:collapse;width:100%">
      ${practicalItems.map((html, i) => numberedItem(i + 1, html)).join('')}
    </table>
  `

  return sendReminderEmail({
    target,
    subject: `Aujourd'hui ${heureStr} — votre rendez-vous Diploma Santé`,
    html: emailLayout(content, {
      heroTitle: "C'est aujourd'hui",
      heroSubtitle: 'Votre rendez-vous approche, voici les informations utiles avant votre échange.',
    }),
    tag: `reminder:morning:${apptId}`,
  })
}

export async function sendVisio1hEmail(
  target: ReminderTarget,
  firstName: string,
  heureStr: string,
  meetingLink: string,
  apptId: string,
): Promise<ReminderResult> {
  const content = `
    <p style="margin:0 0 14px">Bonjour <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 14px">
      Rappel : votre rendez-vous en visioconférence avec Diploma Santé commence dans <strong>1 heure</strong> (à ${heureStr}).
    </p>
    <p style="margin:0 0 14px">
      Pour vous permettre d&rsquo;arriver sereinement à l&rsquo;échange, nous vous partageons le lien de connexion dès maintenant ainsi que quelques repères pratiques.
    </p>

    ${sectionTitle('REJOINDRE LA VISIO')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:separate">
      <tr>
        <td style="background:#12314d;border-radius:6px">
          <a href="${meetingLink}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.2px">
            Rejoindre la visioconférence&nbsp;&nbsp;→
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 10px;font-size:16px;color:#5b6b7a;line-height:1.6">
      Lien direct&nbsp;: <a href="${meetingLink}" style="color:#5b6b7a;text-decoration:underline;word-break:break-all">${meetingLink}</a>
    </p>

    ${sectionTitle('AVANT DE VOUS CONNECTER')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;border-collapse:collapse;width:100%">
      ${[
        `Connectez-vous <strong>5 minutes en avance</strong> pour vérifier votre micro et votre caméra.`,
        `Installez-vous dans un environnement calme, avec une connexion internet stable.`,
        `Préparez vos questions : orientation, méthode de travail, organisation de l&rsquo;année, etc.`,
      ].map((html, i) => numberedItem(i + 1, html)).join('')}
    </table>
  `

  return sendReminderEmail({
    target,
    subject: `Rappel : votre visio commence à ${heureStr}`,
    html: emailLayout(content, {
      heroTitle: 'Votre visio commence dans 1 heure',
      heroSubtitle: 'Cliquez sur le lien ci-dessous pour rejoindre facilement votre rendez-vous.',
    }),
    tag: `reminder:visio-1h:${apptId}`,
  })
}

export async function sendVisio5minEmail(
  target: ReminderTarget,
  firstName: string,
  meetingLink: string,
  apptId: string,
): Promise<ReminderResult> {
  const content = `
    <p style="margin:0 0 14px">Bonjour <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 14px">
      Votre rendez-vous en visioconférence avec Diploma Santé commence dans <strong>5 minutes</strong>.
    </p>
    <p style="margin:0 0 14px">
      Vous pouvez rejoindre la salle dès maintenant pour vous installer tranquillement avant le début de l&rsquo;échange.
    </p>

    ${sectionTitle('REJOINDRE LA VISIO')}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:separate">
      <tr>
        <td style="background:#12314d;border-radius:6px">
          <a href="${meetingLink}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.2px">
            Rejoindre la visioconférence&nbsp;&nbsp;→
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 10px;font-size:16px;color:#5b6b7a;line-height:1.6">
      Lien direct&nbsp;: <a href="${meetingLink}" style="color:#5b6b7a;text-decoration:underline;word-break:break-all">${meetingLink}</a>
    </p>

    <p style="margin:0 0 6px">
      Si le bouton ne fonctionne pas, copiez-collez simplement le lien direct dans votre navigateur.
    </p>
  `

  return sendReminderEmail({
    target,
    subject: `Votre visio Diploma Santé commence dans 5 minutes`,
    html: emailLayout(content, {
      heroTitle: 'Votre visio commence dans 5 minutes',
      heroSubtitle: 'Vous pouvez rejoindre la salle dès maintenant.',
    }),
    tag: `reminder:visio-5min:${apptId}`,
  })
}

// ─── Email replanification (24h apres no-show) ──────────────────────────────
export async function sendReplanifierEmail(
  target: ReminderTarget,
  firstName: string,
  apptId: string,
): Promise<ReminderResult> {
  const content = `
    <p>Bonjour <strong>${firstName}</strong>,</p>
    <p>Nous n&rsquo;avons pas pu nous retrouver lors de votre rendez-vous prévu hier avec Diploma Santé.</p>
    <p>Pas de souci&nbsp;! Si vous souhaitez reprendre rendez-vous, c&rsquo;est très simple, en quelques clics&nbsp;:</p>
  `

  return sendReminderEmail({
    target,
    subject: 'On reprogramme votre rendez-vous ?',
    html: emailLayout(content, {
      heroTitle: 'On reprogramme votre rendez-vous ?',
      heroSubtitle: 'Choisissez un nouveau créneau en quelques clics.',
      finalCtaUrl: REPLANIF_URL,
      finalCtaLabel: 'Choisir un nouveau créneau',
      finalFootnote: 'Gratuit · Sans engagement',
    }),
    tag: `reminder:replanif:${apptId}`,
  })
}

// ─── Helper interne ─────────────────────────────────────────────────────────
async function sendReminderEmail(opts: {
  target: ReminderTarget
  subject: string
  html: string
  tag: string
}): Promise<ReminderResult> {
  const { target, subject, html, tag } = opts
  if (!target.prospectEmail) {
    return { ok: false, error: 'Pas d\'email prospect' }
  }
  // Destinataires : prospect + parent si renseigne (cc-style mais en `to`
  // pour simplifier le tracking Brevo)
  const to: Array<{ email: string }> = [{ email: target.prospectEmail }]
  if (target.emailParent && target.emailParent !== target.prospectEmail) {
    to.push({ email: target.emailParent })
  }
  try {
    const res = await sendBrevoEmail({
      sender: SENDER,
      to,
      subject,
      htmlContent: html,
      tags: [tag],
    })
    return { ok: true, messageId: res.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

function resolvePresentielCampus(meetingLink?: string | null): string {
  const candidate = String(meetingLink || '').trim()
  if (candidate && !/^https?:\/\//i.test(candidate)) return candidate
  return PREPA_ADDRESS
}
