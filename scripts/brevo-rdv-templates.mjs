/**
 * scripts/brevo-rdv-templates.mjs
 *
 * Génère les modèles Brevo des mails de RDV Diploma Santé (IDs 168-176, tag
 * « rdv-crm », cf. lib/rdv-email-templates.ts) selon la charte graphique 2026 :
 * bleu nuit #12314d, bleu médecin #4fabdb (un mot accentué dans le titre),
 * doré #d3ab67 (CTA, chiffres clés sur bleu nuit), PP Pangaia / Clash Display /
 * Matter, tout arrondi, boutons pilule, aucun emoji.
 *
 *   bun scripts/brevo-rdv-templates.mjs preview <dossier>   → aperçus HTML (plusieurs cas par modèle)
 *   BREVO_API_KEY=… bun scripts/brevo-rdv-templates.mjs push → met à jour les modèles dans Brevo
 *
 * Les modèles utilisent la syntaxe Brevo ({{ params.X }}, {% if %}) ; les
 * paramètres sont ceux de rdvTemplateParams().
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS = 'https://rdv-agenda.vercel.app'
const LOGO = 'https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png'

const NUIT = '#12314d'
const MEDECIN = '#4fabdb'
const CLAIR = '#a3cceb'
const DORE = '#d3ab67'
const PANNEAU = '#f4f7fa'
const ROND = '#f1f7fb'
const FILET = '#e6eaee'
const TEXTE_2 = '#4d647b'

const SERIF = `'PP Pangaia',Georgia,'Times New Roman',serif`
const CLASH = `'Clash Display','Helvetica Neue',Helvetica,Arial,sans-serif`
const MATTER = `'Matter','Helvetica Neue',Helvetica,Arial,sans-serif`

// ─── Conditions Brevo, évaluables aussi pour les aperçus ────────────────────
const C = {
  visio: { b: 'params.MODE == "visio"', f: p => p.MODE === 'visio' },
  tel: { b: 'params.MODE == "telephone"', f: p => p.MODE === 'telephone' },
  pres: { b: 'params.MODE == "presentiel"', f: p => p.MODE === 'presentiel' },
  code: { b: 'params.CODE_ENTREE', f: p => !!p.CODE_ENTREE },
  visioLien: { b: 'params.MODE == "visio" and params.LIEN_VISIO', f: p => p.MODE === 'visio' && !!p.LIEN_VISIO },
  confirme: { b: 'params.CONFIRME == "oui"', f: p => p.CONFIRME === 'oui' },
  nonConfirme: { b: 'params.CONFIRME != "oui"', f: p => p.CONFIRME !== 'oui' },
}

/** p = null → syntaxe Brevo ; p = objet → rendu d'aperçu avec ces paramètres. */
function ctx(p) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return {
    v: k => (p ? esc(p[k]) : `{{ params.${k} }}`),
    /** when([[cond, html], …], sinon) → {% if %}…{% elif %}…{% else %}…{% endif %} */
    when: (branches, otherwise = '') => {
      if (p) {
        const hit = branches.find(([c]) => c.f(p))
        return hit ? hit[1] : otherwise
      }
      return branches.map(([c, h], i) => `{% ${i ? 'elif' : 'if'} ${c.b} %}${h}`).join('')
        + (otherwise ? `{% else %}${otherwise}` : '') + '{% endif %}'
    },
  }
}

// ─── Briques de mise en page ────────────────────────────────────────────────

const accent = w => `<span style="color:${MEDECIN}">${w}</span>`

const p = (html, extra = '') =>
  `<p style="margin:0 0 18px;font-family:${MATTER};font-size:16px;line-height:28px;color:${NUIT};${extra}">${html}</p>`

const eyebrow = (label, color = MEDECIN) =>
  `<p style="margin:0 0 14px;font-family:${CLASH};font-size:12px;line-height:16px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:${color}">${label}</p>`

function button(href, label, tone = 'dore') {
  const bg = tone === 'dore' ? DORE : NUIT
  const fg = tone === 'dore' ? NUIT : '#ffffff'
  return `
<table role="presentation" cellpadding="0" cellspacing="0" class="btn" style="margin:8px 0 14px">
  <tr><td bgcolor="${bg}" style="background:${bg};border-radius:999px">
    <a href="${href}" style="display:inline-block;padding:16px 34px;font-family:${CLASH};font-size:15px;line-height:20px;font-weight:600;letter-spacing:.3px;color:${fg};text-decoration:none;border-radius:999px">${label}</a>
  </td></tr>
</table>`
}

const fallbackLink = href =>
  `<p style="margin:0 0 8px;font-family:${MATTER};font-size:13px;line-height:20px;color:${TEXTE_2}">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br><a href="${href}" style="color:${TEXTE_2};text-decoration:underline;word-break:break-all">${href}</a></p>`

const spacer = h => `<div style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</div>`

/** Bandeau bleu nuit du rendez-vous : date en doré, format et lieu. */
function rdvPanel(t, { label = 'Votre rendez-vous', when = t.v('DATE'), withPlace = true } = {}) {
  const place = withPlace ? t.when([[C.pres, `
      <p style="margin:14px 0 0;font-family:${MATTER};font-size:15px;line-height:24px;color:${CLAIR}">
        ${t.v('ADRESSE')}${t.when([[C.code, ` &nbsp;·&nbsp; code d’entrée ${t.v('CODE_ENTREE')}`]])}<br>
        <a href="${t.v('ITINERAIRE')}" style="color:#ffffff;text-decoration:underline">Itinéraire</a>
      </p>`]]) : ''
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 30px">
  <tr><td bgcolor="${NUIT}" style="background:${NUIT};border-radius:28px;padding:28px 32px">
      ${eyebrow(label, CLAIR)}
      <p style="margin:0;font-family:${SERIF};font-size:26px;line-height:32px;font-weight:700;color:${DORE}">${when}</p>
      <p style="margin:10px 0 0;font-family:${MATTER};font-size:16px;line-height:24px;color:#ffffff">${t.when([
        [C.visio, 'En visioconférence'],
        [C.tel, 'Par téléphone'],
      ], 'En présentiel')}</p>${place}
  </td></tr>
</table>`
}

/** Liste numérotée sur panneau gris, ou bordé (tone 'borde'), ronds bleu médecin. */
function steps(title, items, tone = 'gris') {
  const box = tone === 'gris'
    ? `bgcolor="${PANNEAU}" style="background:${PANNEAU};border-radius:28px;padding:28px 32px"`
    : `style="background:#ffffff;border:1px solid ${FILET};border-radius:28px;padding:27px 31px"`
  const rond = tone === 'gris' ? '#ffffff' : ROND
  const rows = items.map((html, i) => `
    <tr>
      <td valign="top" style="width:40px;padding:0 0 ${i === items.length - 1 ? 0 : 16}px">
        <div style="width:28px;height:28px;border-radius:14px;background:${rond};color:${MEDECIN};font-family:${CLASH};font-size:13px;font-weight:600;line-height:28px;text-align:center">${i + 1}</div>
      </td>
      <td valign="top" style="padding:3px 0 ${i === items.length - 1 ? 0 : 16}px;font-family:${MATTER};font-size:15px;line-height:24px;color:${NUIT}">${html}</td>
    </tr>`).join('')
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 30px">
  <tr><td ${box}>
    ${eyebrow(title)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
</table>`
}

/** Bloc visio : bouton (doré, ou bleu nuit quand la confirmation est l'action principale) + lien direct. */
const visioBlock = (t, tone = 'dore') =>
  `${button(t.v('LIEN_VISIO'), 'Rejoindre la visioconférence', tone)}${fallbackLink(t.v('LIEN_VISIO'))}${spacer(18)}`

const notice = html =>
  `<p style="margin:4px 0 0;padding-top:22px;border-top:1px solid ${FILET};font-family:${MATTER};font-size:14px;line-height:23px;color:${TEXTE_2}">${html}</p>`

/** Bloc Diploma Lab : l'application gratuite, à découvrir avant le rendez-vous. */
const APP_STORE = 'https://apps.apple.com/fr/app/diploma-lab/id6782543117'
const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=fr.diploma.sante'
const storeButton = (href, label) => `
      <td class="store" style="padding:0 10px 10px 0">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${NUIT}" style="background:${NUIT};border-radius:999px">
          <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${CLASH};font-size:14px;line-height:18px;font-weight:600;letter-spacing:.3px;color:#ffffff;text-decoration:none;border-radius:999px">${label}</a>
        </td></tr></table>
      </td>`
const DIPLOMA_LAB = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 30px">
  <tr><td style="background:#ffffff;border:1px solid ${FILET};border-radius:28px;padding:27px 31px 17px">
    ${eyebrow('Diploma Lab')}
    <p style="margin:0 0 8px;font-family:${SERIF};font-size:21px;line-height:27px;font-weight:700;color:${NUIT}">Découvrez notre plateforme avant le rendez-vous</p>
    <p style="margin:0 0 18px;font-family:${MATTER};font-size:15px;line-height:24px;color:${NUIT}">Diploma Lab est la plateforme d’entraînement de Diploma Santé. L’application est disponible gratuitement sur iPhone et Android.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>${storeButton(APP_STORE, 'App Store')}${storeButton(GOOGLE_PLAY, 'Google Play')}</tr></table>
  </td></tr>
</table>`

const EMPECHEMENT = notice('En cas d’empêchement, merci de nous en informer en répondant à ce message.')

/** Préparation selon le format du RDV. */
const prepItems = t => [
  t.when([
    [C.visio, 'Installez-vous dans un endroit calme, avec une connexion stable. Un casque ou des écouteurs sont recommandés.'],
    [C.tel, 'Votre référent pédagogique vous appelle à l’heure prévue, sur le numéro communiqué lors de votre réservation.'],
  ], 'Merci de vous présenter à l’accueil du campus cinq minutes avant l’heure prévue.'),
  'Munissez-vous de vos derniers bulletins scolaires ou relevés de notes.',
  'Préparez les questions que vous souhaitez aborder.',
]

function layout({ preheader, eyebrow: eb, title, body }) {
  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>Diploma Santé</title>
<style>
  @font-face{font-family:'Matter';src:url('${ASSETS}/event-landing/fonts/Matter-Regular.woff2') format('woff2');font-weight:400}
  @font-face{font-family:'Matter';src:url('${ASSETS}/event-landing/fonts/Matter-SemiBold.woff2') format('woff2');font-weight:600}
  @font-face{font-family:'Matter';src:url('${ASSETS}/event-landing/fonts/Matter-Bold.woff2') format('woff2');font-weight:700}
  @font-face{font-family:'PP Pangaia';src:url('${ASSETS}/event-landing/fonts/PPPangaia-Bold.otf') format('opentype');font-weight:700}
  @font-face{font-family:'Clash Display';src:url('${ASSETS}/event-landing/fonts/ClashDisplay-Semibold.woff2') format('woff2');font-weight:600}
  body{margin:0;padding:0;background:${PANNEAU}}
  a{color:${NUIT}}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important}
    .px{padding-left:24px!important;padding-right:24px!important}
    .outer{padding:0!important}
    .title{font-size:28px!important;line-height:34px!important}
    .btn,.btn td{width:100%!important}
    .btn a{display:block!important;text-align:center!important;padding-left:12px!important;padding-right:12px!important}
    .store{display:block!important;width:100%!important;padding-right:0!important}
    .store table,.store td{width:100%!important}
    .store a{display:block!important;text-align:center!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PANNEAU}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PANNEAU}">${preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PANNEAU}" style="background:${PANNEAU}">
<tr><td align="center" class="outer" style="padding:40px 16px 44px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${FILET};border-radius:36px">
    <tr><td class="px" style="padding:44px 52px 0">
      <img src="${LOGO}" alt="Diploma Santé" width="168" style="display:block;width:168px;max-width:168px;height:auto;border:0">
    </td></tr>
    <tr><td class="px" style="padding:44px 52px 0">
      ${eyebrow(eb)}
      <h1 class="title" style="margin:0 0 26px;font-family:${SERIF};font-size:34px;line-height:40px;font-weight:700;color:${NUIT}">${title}</h1>
    </td></tr>
    <tr><td class="px" style="padding:0 52px">${body}</td></tr>
    <tr><td class="px" style="padding:30px 52px 46px;font-family:${MATTER};font-size:16px;line-height:26px;color:${NUIT}">
      <p style="margin:0">Bien cordialement,</p>
      <p style="margin:4px 0 0;font-weight:600">Service des admissions — Diploma Santé</p>
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

const hello = t => p(`Bonjour ${t.v('PRENOM')},`)

// ─── Les 9 modèles ──────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 168,
    name: 'RDV CRM — Confirmation de prise de RDV',
    subject: t => `Confirmation de votre rendez-vous d’orientation — ${t.v('DATE')}`,
    html: t => layout({
      preheader: `Rendez-vous d’orientation · ${t.v('DATE')}`,
      eyebrow: 'Confirmation',
      title: `Votre rendez-vous est ${accent('enregistré')}`,
      body: `${hello(t)}
        ${p('Nous vous confirmons votre rendez-vous d’orientation avec un référent pédagogique de Diploma Santé.')}
        ${rdvPanel(t)}
        ${t.when([[C.visioLien, visioBlock(t)]])}
        ${steps('Déroulement du rendez-vous', [
          'Un point sur votre parcours et votre projet d’études de santé.',
          'La préparation adaptée à votre profil et notre méthode de travail.',
          'Les modalités pratiques&nbsp;: organisation de l’année, campus, financement.',
        ], 'borde')}
        ${steps('Préparation', prepItems(t))}
        ${DIPLOMA_LAB}
        ${EMPECHEMENT}`,
    }),
  },
  {
    id: 169,
    name: 'RDV CRM — Rappel 48 h + confirmation',
    subject: t => `Confirmation de présence — rendez-vous du ${t.v('DATE')}`,
    html: t => layout({
      preheader: `Merci de confirmer votre présence · ${t.v('DATE')}`,
      eyebrow: 'Dans deux jours',
      title: `Merci de ${accent('confirmer')} votre présence`,
      body: `${hello(t)}
        ${p(`Votre rendez-vous d’orientation avec Diploma Santé est prévu le ${t.v('DATE')}. Nous vous remercions de bien vouloir confirmer votre présence.`)}
        ${button(t.v('LIEN_CONFIRMATION'), 'Confirmer ma présence')}
        ${spacer(18)}
        ${rdvPanel(t)}
        ${t.when([[C.visioLien, visioBlock(t, 'nuit')]])}
        ${steps('Préparation', prepItems(t))}
        ${DIPLOMA_LAB}
        ${EMPECHEMENT}`,
    }),
  },
  {
    id: 170,
    name: 'RDV CRM — Rappel veille (J-1)',
    subject: t => t.when([[C.confirme, 'Votre rendez-vous de demain — Diploma Santé']], 'Votre rendez-vous de demain — confirmation de présence'),
    html: t => layout({
      preheader: `Rendez-vous d’orientation · ${t.v('DATE')}`,
      eyebrow: 'Rappel',
      title: `Votre rendez-vous a lieu ${accent('demain')}`,
      body: `${hello(t)}
        ${p(`Nous vous rappelons votre rendez-vous d’orientation avec un référent pédagogique de Diploma Santé, prévu demain. ${t.when(
          [[C.confirme, 'Votre présence est confirmée.']],
          'Votre présence n’est pas encore confirmée&nbsp;; nous vous remercions de bien vouloir la confirmer.',
        )}`)}
        ${t.when([[C.nonConfirme, `${button(t.v('LIEN_CONFIRMATION'), 'Confirmer ma présence')}${spacer(18)}`]])}
        ${rdvPanel(t, { label: 'Demain' })}
        ${t.when([[C.visioLien, visioBlock(t, 'nuit')]])}
        ${steps('Préparation', prepItems(t))}
        ${DIPLOMA_LAB}
        ${EMPECHEMENT}`,
    }),
  },
  {
    id: 171,
    name: 'RDV CRM — Matin du RDV',
    subject: t => `Aujourd’hui à ${t.v('HEURE')} — votre rendez-vous Diploma Santé`,
    html: t => layout({
      preheader: `Votre rendez-vous d’orientation a lieu aujourd’hui à ${t.v('HEURE')}`,
      eyebrow: 'Aujourd’hui',
      title: `Votre rendez-vous a lieu ${accent('aujourd’hui')}`,
      body: `${hello(t)}
        ${p(`${t.when([
          [C.visio, `Votre référent pédagogique vous attend en visioconférence à ${t.v('HEURE')}.`],
          [C.tel, `Votre référent pédagogique vous appellera à ${t.v('HEURE')}.`],
        ], `Votre référent pédagogique vous attend au campus à ${t.v('HEURE')}.`)}${t.when([[C.nonConfirme,
          ' Votre présence n’est pas encore confirmée&nbsp;; nous vous remercions de bien vouloir la confirmer.']])}`)}
        ${t.when([[C.nonConfirme, `${button(t.v('LIEN_CONFIRMATION'), 'Confirmer ma présence', 'nuit')}${spacer(18)}`]])}
        ${rdvPanel(t, { label: 'Aujourd’hui', when: `${t.v('HEURE')}` })}
        ${t.when([[C.visioLien, visioBlock(t)]])}
        ${steps('Informations pratiques', [
          t.when([
            [C.visio, 'Connectez-vous quelques minutes en avance afin de vérifier votre micro et votre caméra.'],
            [C.tel, 'Merci de rester joignable, dans un endroit calme, à l’heure prévue.'],
          ], 'Merci de vous présenter à l’accueil du campus cinq minutes avant l’heure prévue.'),
          'Munissez-vous de vos derniers bulletins scolaires ou relevés de notes.',
          'Préparez les questions que vous souhaitez aborder.',
        ])}
        ${EMPECHEMENT}`,
    }),
  },
  {
    id: 172,
    name: 'RDV CRM — Visio dans 1 h',
    subject: t => `Votre visioconférence de ${t.v('HEURE')} — lien de connexion`,
    html: t => layout({
      preheader: `Votre lien de connexion pour ${t.v('HEURE')}`,
      eyebrow: 'Dans une heure',
      title: `Votre lien de ${accent('connexion')}`,
      body: `${hello(t)}
        ${p(`Votre rendez-vous d’orientation en visioconférence avec Diploma Santé débute à ${t.v('HEURE')}. Vous trouverez ci-dessous votre lien de connexion.`)}
        ${visioBlock(t)}
        ${steps('Avant de vous connecter', [
          'Connectez-vous quelques minutes en avance afin de vérifier votre micro et votre caméra.',
          'Installez-vous dans un endroit calme, avec une connexion stable.',
          'Munissez-vous de vos derniers bulletins scolaires ou relevés de notes.',
        ])}
        ${EMPECHEMENT}`,
    }),
  },
  {
    id: 173,
    name: 'RDV CRM — Visio dans 5 min',
    subject: () => 'Votre visioconférence débute dans 5 minutes',
    html: t => layout({
      preheader: 'Votre référent pédagogique vous attend',
      eyebrow: 'Dans 5 minutes',
      title: `La salle est ${accent('ouverte')}`,
      body: `${hello(t)}
        ${p('Votre rendez-vous d’orientation en visioconférence débute dans cinq minutes. Votre référent pédagogique vous attend&nbsp;; vous pouvez rejoindre la salle dès maintenant.')}
        ${visioBlock(t)}`,
    }),
  },
  {
    id: 174,
    name: 'RDV CRM — No-show : reprogrammer',
    subject: () => 'Votre rendez-vous d’orientation — Diploma Santé',
    html: t => layout({
      preheader: 'Absence constatée à votre rendez-vous d’orientation',
      eyebrow: 'Rendez-vous non honoré',
      title: `Reprendre ${accent('rendez-vous')}`,
      body: `${hello(t)}
        ${p('Vous n’étiez pas présent(e) à votre rendez-vous d’orientation avec Diploma Santé.')}
        ${p('Pour reprendre rendez-vous, vous pouvez sélectionner un nouveau créneau via le lien ci-dessous. Selon les disponibilités de nos référents pédagogiques, nous vous confirmerons ou non ce rendez-vous.')}
        ${button(t.v('LIEN_REPLANIF'), 'Choisir un nouveau créneau')}
        ${spacer(18)}`,
    }),
  },
  {
    id: 175,
    name: 'RDV CRM — Changement de format',
    subject: t => `Modification de votre rendez-vous — ${t.v('DATE')}`,
    html: t => layout({
      preheader: `Nouveau format pour votre rendez-vous du ${t.v('DATE')}`,
      eyebrow: 'Modification',
      title: `Votre rendez-vous a été ${accent('modifié')}`,
      body: `${hello(t)}
        ${p(`Le format de votre rendez-vous d’orientation a été modifié&nbsp;: il se tiendra désormais ${t.when([
          [C.visio, 'en visioconférence'],
          [C.tel, 'par téléphone'],
        ], `en présentiel, sur notre campus ${t.v('CAMPUS')}`)}. La date et l’heure restent inchangées.`)}
        ${rdvPanel(t)}
        ${t.when([[C.visioLien, visioBlock(t)]])}
        ${steps('Préparation', prepItems(t))}
        ${EMPECHEMENT}`,
    }),
  },
  {
    id: 176,
    name: 'RDV CRM — Invitation visio (participant)',
    subject: t => `Rendez-vous d’orientation de ${t.v('PROSPECT')} — ${t.v('DATE')}`,
    html: t => layout({
      preheader: `Vous êtes invité(e) au rendez-vous d’orientation de ${t.v('PROSPECT')}`,
      eyebrow: `Rendez-vous de ${t.v('PROSPECT')}`,
      title: `Invitation au rendez-vous d’${accent('orientation')}`,
      body: `${hello(t)}
        ${p(`${t.v('PROSPECT')} a rendez-vous en visioconférence avec un référent pédagogique de Diploma Santé, prépa aux études de santé. Vous avez été ajouté(e) à ce rendez-vous afin de pouvoir y assister.`)}
        ${p(`Cet échange permet de faire le point sur le projet d’études de santé de ${t.v('PROSPECT')} et de présenter la préparation adaptée à son profil.`)}
        ${rdvPanel(t, { label: 'Visioconférence', withPlace: false })}
        ${visioBlock(t)}
        ${notice('Pour toute question, ou si vous ne souhaitez pas participer, il vous suffit de répondre à ce message.')}`,
    }),
  },
]

// ─── Aperçus ────────────────────────────────────────────────────────────────

const BASE = {
  PRENOM: 'Camille', DATE: 'mardi 14 octobre à 17h00', HEURE: '17h00',
  MODE: 'presentiel', ADRESSE: '100 quai de la Rapée 75012 Paris', CAMPUS: 'quai de la Rapée',
  ITINERAIRE: 'https://www.google.com/maps/search/?api=1&query=100%20quai%20de%20la%20Rap%C3%A9e%2075012%20Paris',
  CODE_ENTREE: '', LIEN_VISIO: 'https://meet.google.com/abc-defg-hij', LIEN_CONFIRMATION: 'https://rdv-agenda.vercel.app/confirm/xyz',
  CONFIRME: '', LIEN_REPLANIF: 'https://rdv-agenda.vercel.app/book/diploma', PROSPECT: 'Camille Martin',
}
const VISIO = { MODE: 'visio', ADRESSE: '', CAMPUS: '', ITINERAIRE: '' }
const TEL = { MODE: 'telephone', ADRESSE: '', CAMPUS: '', ITINERAIRE: '', LIEN_VISIO: '' }
const CASES = {
  168: { presentiel: {}, visio: VISIO, telephone: TEL },
  169: { presentiel: {}, visio: VISIO },
  170: { 'non-confirme': {}, confirme: { CONFIRME: 'oui' } },
  171: { 'visio-non-confirme': VISIO, 'presentiel-confirme': { CONFIRME: 'oui' }, telephone: { ...TEL, CONFIRME: 'oui' } },
  172: { visio: VISIO },
  173: { visio: VISIO },
  174: { replanif: { MODE: '' } },
  175: { presentiel: {}, visio: VISIO },
  176: { participant: { ...VISIO, PRENOM: 'Sophie' } },
}

function preview(dir) {
  mkdirSync(dir, { recursive: true })
  const links = []
  for (const tpl of TEMPLATES) {
    for (const [label, over] of Object.entries(CASES[tpl.id])) {
      const t = ctx({ ...BASE, ...over })
      const file = `${tpl.id}-${label}.html`
      writeFileSync(join(dir, file), tpl.html(t))
      links.push(`<li><a href="${file}">${tpl.id} · ${tpl.name.replace('RDV CRM — ', '')} — ${label}</a><br><small>${tpl.subject(t)}</small></li>`)
    }
  }
  writeFileSync(join(dir, 'index.html'), `<!DOCTYPE html><meta charset="utf-8"><title>Mails de RDV</title><ul style="font-family:sans-serif;line-height:1.8">${links.join('')}</ul>`)
  console.log(`${links.length} aperçus dans ${dir}`)
}

async function push() {
  const key = (process.env.BREVO_API_KEY || '').trim()
  if (!key) throw new Error('BREVO_API_KEY manquante')
  const t = ctx(null)
  for (const tpl of TEMPLATES) {
    const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${tpl.id}`, {
      method: 'PUT',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ templateName: tpl.name, subject: tpl.subject(t), htmlContent: tpl.html(t) }),
    })
    console.log(tpl.id, res.status, res.ok ? 'OK' : await res.text())
  }
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'preview') preview(arg || 'rdv-email-previews')
else if (cmd === 'push') await push()
else console.log('Usage : preview <dossier> | push')
