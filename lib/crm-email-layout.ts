/**
 * lib/crm-email-layout.ts
 *
 * Papier à en-tête Diploma Santé (charte 2026) pour les e-mails écrits à la
 * main depuis la fiche contact (« Email » → envoyer) : logo, texte en Matter,
 * pied de page sobre. Le texte et la signature restent ceux du commercial.
 * Pur string : utilisable côté serveur (envoi) et client (aperçu).
 */

const ASSETS = 'https://rdv-agenda.vercel.app'
const LOGO = 'https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png'

const NUIT = '#12314d'
const DORE = '#d3ab67'
const PANNEAU = '#f4f7fa'
const FILET = '#e6eaee'
const TEXTE_2 = '#4d647b'
const CLASH = `'Clash Display','Helvetica Neue',Helvetica,Arial,sans-serif`
const MATTER = `'Matter','Helvetica Neue',Helvetica,Arial,sans-serif`

const P_STYLE = `margin:0 0 18px;font-family:${MATTER};font-size:16px;line-height:27px;color:${NUIT}`

/** Un HTML déjà complet (modèle maison avec <html>/<body>) n'est pas ré-habillé. */
export function isFullEmailDocument(html: string): boolean {
  return /<html[\s>]|<body[\s>]/i.test(html)
}

/** Ligne seule « Libellé → https://… » : devient un bouton dans le mail. */
const BUTTON_LINE = /^([^\n]{2,80}?)\s*(?:→|->)\s*(https?:\/\/\S+)$/

function pillButton(label: string, href: string, primary: boolean): string {
  const bg = primary ? DORE : NUIT
  const fg = primary ? NUIT : '#ffffff'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr><td bgcolor="${bg}" style="background:${bg};border-radius:999px">`
    + `<a href="${href}" style="display:inline-block;padding:15px 32px;font-family:${CLASH};font-size:15px;line-height:20px;font-weight:600;letter-spacing:.3px;color:${fg};text-decoration:none;border-radius:999px">${label}</a>`
    + `</td></tr></table>`
}

/**
 * Texte brut saisi dans le CRM → HTML d'e-mail : échappé, liens cliquables,
 * paragraphes sur les lignes vides, retours à la ligne conservés. Une ligne
 * seule « Libellé → lien » devient un bouton (le dernier en doré : c'est l'action
 * principale, ex. « Réserver ma place » ; les précédents en bleu nuit).
 */
export function plainTextToEmailHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const linkify = (s: string) => s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, url =>
    `<a href="${url}" style="color:${NUIT};text-decoration:underline">${url}</a>`)
  const pars = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  const lastButton = pars.map(par => BUTTON_LINE.test(par.trim())).lastIndexOf(true)
  return pars
    .map((par, i) => {
      const btn = par.trim().match(BUTTON_LINE)
      if (btn) return pillButton(esc(btn[1].trim()), esc(btn[2]), i === lastButton)
      return `<p style="${P_STYLE}">${linkify(esc(par)).replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')
}

/** Habille le contenu d'un e-mail libre avec le papier à en-tête Diploma Santé. */
export function wrapCrmEmail(innerHtml: string, preheader = ''): string {
  if (isFullEmailDocument(innerHtml)) return innerHtml
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>Diploma Santé</title>
<style>
  @font-face{font-family:'Matter';src:url('${ASSETS}/event-landing/fonts/Matter-Regular.woff2') format('woff2');font-weight:400}
  @font-face{font-family:'Matter';src:url('${ASSETS}/event-landing/fonts/Matter-SemiBold.woff2') format('woff2');font-weight:600}
  @font-face{font-family:'Matter';src:url('${ASSETS}/event-landing/fonts/Matter-Bold.woff2') format('woff2');font-weight:700}
  @font-face{font-family:'Clash Display';src:url('${ASSETS}/event-landing/fonts/ClashDisplay-Semibold.woff2') format('woff2');font-weight:600}
  body{margin:0;padding:0;background:${PANNEAU}}
  .content p{${P_STYLE}}
  .content a{color:${NUIT}}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important}
    .px{padding-left:24px!important;padding-right:24px!important}
    .outer{padding:0!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PANNEAU}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PANNEAU}">${preheader}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PANNEAU}" style="background:${PANNEAU}">
<tr><td align="center" class="outer" style="padding:40px 16px 44px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${FILET};border-radius:36px">
    <tr><td class="px" style="padding:44px 52px 34px">
      <img src="${LOGO}" alt="Diploma Santé" width="168" style="display:block;width:168px;max-width:168px;height:auto;border:0">
    </td></tr>
    <tr><td class="px content" style="padding:0 52px 32px;font-family:${MATTER};font-size:16px;line-height:27px;color:${NUIT}">
${innerHtml}
    </td></tr>
  </table>
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
    <tr><td class="px" align="center" style="padding:28px 52px 0;font-family:${MATTER};font-size:12px;line-height:20px;color:${TEXTE_2}">
      <p style="margin:0 0 4px;font-family:${CLASH};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${NUIT}">Diploma Santé</p>
      <p style="margin:0 0 4px">Prépa médecine · Terminale Santé · PAES · PASS / LAS<br>100 quai de la Rapée, Paris&nbsp;12<sup>e</sup> · 29 rue Lauriston, Paris&nbsp;16<sup>e</sup></p>
      <p style="margin:0"><a href="https://diploma-sante.fr" style="color:${TEXTE_2};text-decoration:none">diploma-sante.fr</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`
}
