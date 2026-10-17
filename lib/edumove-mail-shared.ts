/**
 * Mails Edumove envoyés depuis le CRM (onglet Edumove) : modèles, variables,
 * mise en page. Fichier sans dépendance serveur : l'aperçu du navigateur et
 * l'envoi (lib/edumove-mail.ts) utilisent exactement le même rendu.
 */

import { EDUMOVE_DOCUMENT_LABELS, EDUMOVE_FAC_NAMES, edumoveMissingDocs } from '@/lib/edumove-stage'

export const EDUMOVE_SITE_URL_PUBLIC = 'https://candidature.edumove.fr'
/** Lien unique de l'appli Edumove Lab (store du téléphone, sinon version web). */
export const EDUMOVE_LAB_APP_URL = 'https://edumovelab.vercel.app/app'

export type EdumoveMailTemplate = {
  id: string
  name: string
  /** Quand l'utiliser (affiché à l'équipe). */
  usage: string
  subject: string
  /** Texte simple : lignes vides = paragraphes, {{variables}} remplacées. */
  body: string
}

export const EDUMOVE_MAIL_VARIABLES: { key: string; label: string }[] = [
  { key: 'prenom', label: 'Prénom' },
  { key: 'nom', label: 'Nom' },
  { key: 'facs', label: 'Facs choisies' },
  { key: 'pieces_manquantes', label: 'Pièces manquantes' },
  { key: 'lien_appli', label: "Lien de l'appli" },
  { key: 'lien_espace', label: 'Lien espace candidat' },
]

export const EDUMOVE_DEFAULT_TEMPLATES: EdumoveMailTemplate[] = [
  {
    id: 'finaliser',
    name: 'Finaliser sa candidature',
    usage: 'Compte créé mais candidature jamais déposée.',
    subject: '{{prenom}}, votre candidature Edumove n’est pas encore envoyée',
    body: `Bonjour {{prenom}},

Vous avez créé votre compte Edumove, mais votre candidature n’est pas encore envoyée.

Il ne vous reste que quelques minutes : vos notes, vos langues et vos préférences. C’est gratuit et sans engagement, et vous recevez votre réponse personnalisée en général sous 2 heures ouvrées.

Finalisez-la ici : {{lien_espace}}

À très vite,
L’équipe Edumove`,
  },
  {
    id: 'choix_facs',
    name: 'Choisir ses facs',
    usage: 'Réponse envoyée, mais aucune fac choisie.',
    subject: '{{prenom}}, choisissez vos facs pour lancer votre dossier',
    body: `Bonjour {{prenom}},

Votre réponse Edumove est disponible : elle indique les facs et filières qui vous sont ouvertes.

Pour que nous envoyions votre dossier, choisissez maintenant vos facs et déposez les pièces demandées depuis votre espace : {{lien_espace}}

Une question ? Répondez simplement à ce mail ou écrivez-nous depuis votre espace candidat.

L’équipe Edumove`,
  },
  {
    id: 'pieces',
    name: 'Pièces manquantes',
    usage: 'Facs choisies, mais il manque des pièces obligatoires.',
    subject: '{{prenom}}, il manque des pièces à votre dossier',
    body: `Bonjour {{prenom}},

Pour envoyer votre dossier à {{facs}}, il nous manque :
{{pieces_manquantes}}

Vous pouvez les déposer depuis votre espace candidat : {{lien_espace}}

Merci, et à très vite,
L’équipe Edumove`,
  },
  {
    id: 'test_link',
    name: 'LINK · Test d’entrée',
    usage: 'Dossier envoyé à LINK (Médecine, Dentaire, Kiné) : préparer le test.',
    subject: '{{prenom}}, votre test d’entrée LINK',
    body: `Bonjour {{prenom}},

Votre dossier a bien été transmis à LINK Campus (Rome).

Prochaine étape : le test d’entrée (QCM en français, 80 questions : biologie, chimie, maths, physique et culture générale). Les frais de test sont de 200 € (non remboursables).

Nous revenons vers vous avec la date et le lien de paiement. Vous trouverez un exemple de test dans votre espace : {{lien_espace}}

L’équipe Edumove`,
  },
  {
    id: 'entretien_ucjc',
    name: 'UCJC · Entretien',
    usage: 'Dossier envoyé à l’UCJC : planifier l’entretien.',
    subject: '{{prenom}}, votre entretien avec l’UCJC',
    body: `Bonjour {{prenom}},

Votre dossier a bien été transmis à l’UCJC (Madrid).

L’admission se fait sur un entretien vidéo d’environ 15 minutes avec la direction (en espagnol pour Médecine et Dentaire, en français pour les autres filières). Les résultats arrivent sous une semaine.

Nous revenons vers vous très vite avec un créneau.

L’équipe Edumove`,
  },
  {
    id: 'tests_ue',
    name: 'UE · Tests et rapport technique',
    usage: 'Dossier pour l’Universidad Europea : tests et rapport technique.',
    subject: '{{prenom}}, la suite de votre dossier Universidad Europea',
    body: `Bonjour {{prenom}},

Pour votre candidature à l’Universidad Europea, deux étapes :

1. Le rapport technique académique (60 €, sur hostudents.com) s’il n’est pas encore fait.
2. Les tests de sélection (langue, aptitudes, motivation et matière). Les résultats arrivent sous 48 h ; en cas d’admission, un acompte de 2 500 € est à verser sous 2 jours.

Suivez chaque étape dans votre espace candidat : {{lien_espace}}

L’équipe Edumove`,
  },
  {
    id: 'appli',
    name: 'Télécharger l’appli',
    usage: 'À utiliser au lancement de l’appli Edumove Lab (pas encore publiée).',
    subject: '{{prenom}}, suivez votre dossier dans l’appli Edumove Lab',
    body: `Bonjour {{prenom}},

Votre dossier Edumove se suit maintenant dans l’appli Edumove Lab, avec le même e-mail et le même mot de passe :
- votre réponse et chaque étape en direct ;
- vos pièces à déposer en photo ;
- un conseiller et un assistant pour vos questions ;
- l’anglais, l’espagnol et l’italien jusqu’au B2.

Téléchargez-la ici : {{lien_appli}}

L’équipe Edumove`,
  },
  {
    id: 'libre',
    name: 'Message libre',
    usage: 'Tout le reste.',
    subject: '',
    body: `Bonjour {{prenom}},



L’équipe Edumove`,
  },
]

/** Données d'un dossier utiles aux variables (copie crm_edumove_candidatures). */
export type EdumoveMailTarget = {
  prenom?: string | null
  nom?: string | null
  uni_selections?: Record<string, unknown> | null
  documents?: Record<string, unknown> | null
}

const capitalize = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
}

export function edumoveMailVars(t: EdumoveMailTarget): Record<string, string> {
  const unis = Object.keys(t.uni_selections ?? {})
  const missing = edumoveMissingDocs(t.uni_selections ?? {}, t.documents ?? {})
  return {
    prenom: capitalize(t.prenom),
    nom: String(t.nom ?? '').trim().toUpperCase(),
    facs: unis.map(u => EDUMOVE_FAC_NAMES[u] ?? u).join(', ') || 'vos facs',
    pieces_manquantes: missing.length
      ? missing.map(k => `- ${EDUMOVE_DOCUMENT_LABELS[k] ?? k}`).join('\n')
      : '- (aucune pièce obligatoire ne manque)',
    lien_appli: EDUMOVE_LAB_APP_URL,
    lien_espace: `${EDUMOVE_SITE_URL_PUBLIC}/espace.html`,
  }
}

export function renderEdumoveText(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    // Prénom absent : « Bonjour , » → « Bonjour, » ; « , votre… » en début → « Votre… »
    .replace(/ +,/g, ',')
    .replace(/^,\s*(.)/, (_, c: string) => c.toUpperCase())
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Texte simple → HTML : paragraphes, retours à la ligne, liens https cliquables. */
export function edumoveTextToHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map(p => {
    const html = esc(p).replace(/\n/g, '<br>').replace(/https:\/\/[^\s<]+/g, u => `<a href="${u}" style="color:#e65100">${u}</a>`)
    return `<p style="line-height:1.6;margin:0 0 12px">${html}</p>`
  }).join('')
}

/** Mise en page des mails Edumove (bandeau orange). */
export function edumoveEmailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#e65100;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">Edumove</td></tr>
<tr><td style="padding:24px">${title ? `<h1 style="font-size:18px;margin:0 0 14px">${esc(title)}</h1>` : ''}${bodyHtml}
${cta ? `<p style="margin:22px 0 0"><a href="${esc(cta.url)}" style="background:#e65100;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:bold">${esc(cta.label)}</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`
}

/** Mail complet d'un modèle pour un dossier (aperçu et envoi). */
export function renderEdumoveMail(subject: string, body: string, target: EdumoveMailTarget) {
  const vars = edumoveMailVars(target)
  const s = renderEdumoveText(subject, vars).trim()
  const text = renderEdumoveText(body, vars)
  return { subject: s, text, html: edumoveEmailLayout('', edumoveTextToHtml(text)) }
}
