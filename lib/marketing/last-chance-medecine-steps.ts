import type { BrandCharter } from '@/lib/brand-charter'
import { brandCtaButton } from '@/lib/brand-charter'

export type LastChanceBrand = 'afem' | 'numerus' | 'hermione' | 'prepamedecine'

export interface LastChanceStepDef {
  brand: LastChanceBrand
  label: string
  subject: string
  preheader: string
  /** Paragraphes HTML autorisés (sans balises racine) */
  paragraphs: string[]
  ctaLabel: string
  /** Lien CTA — défaut = site marque */
  ctaHref?: string
  /** Lien formulaire pré-rempli CRM (variable {{lien_formulaire}}) */
  showFormLink?: boolean
  formLinkLabel?: string
}

/** Corps intérieur email (sans enveloppe charte — ajoutée à l'envoi) */
export function buildLastChanceStepBody(def: LastChanceStepDef, charter: BrandCharter): string {
  const ctaHref = def.ctaHref || charter.website_url
  const parts: string[] = [
    `<p style="margin:0 0 16px;font-size:16px;color:${charter.text_color}">Bonjour <strong>{{prenom}}</strong>,</p>`,
  ]

  for (const p of def.paragraphs) {
    parts.push(
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${charter.text_color}">${p}</p>`,
    )
  }

  parts.push(
    `<p style="margin:28px 0 20px;text-align:center">${brandCtaButton(charter, def.ctaLabel, ctaHref)}</p>`,
  )

  if (def.showFormLink) {
    const label = def.formLinkLabel || 'Répondre en 2 clics (formulaire pré-rempli) →'
    parts.push(
      `<p style="margin:0 0 16px;text-align:center;font-size:14px">`,
      `<a href="{{lien_formulaire}}" style="color:${charter.primary_color};font-weight:600">${label}</a>`,
      `</p>`,
    )
  }

  parts.push(
    `<p style="margin:24px 0 0;font-size:14px;color:${charter.muted_color}">`,
    `À très vite,<br><strong style="color:${charter.text_color}">L'équipe ${charter.name}</strong>`,
    `</p>`,
  )

  return parts.join('\n')
}

export const LAST_CHANCE_MEDECINE_STEPS: LastChanceStepDef[] = [
  {
    brand: 'afem',
    label: 'J1',
    subject: 'Tu vises la médecine à Paris en 2026 : la meilleure prépa PASS/LAS est…',
    preheader: 'Outils gratuits AFEM pour choisir ta fac et préparer septembre.',
    paragraphs: [
      'La rentrée PASS/LAS approche. Avant de t\'engager dans une prépa à 8 000 €, la vraie question : <strong>ta fac cible est-elle la bonne pour ton profil ?</strong>',
      'L\'AFEM propose des outils <strong>100 % gratuits</strong> : simulateur Parcoursup, quizz « fac × profil », calculateur de réussite PASS/LAS et QCM par matière.',
      'Des milliers d\'étudiants les ont utilisés avant septembre pour éviter les erreurs d\'orientation.',
    ],
    ctaLabel: 'Découvrir les outils gratuits AFEM',
    ctaHref: 'https://afem-edu.fr',
    showFormLink: true,
    formLinkLabel: 'Me faire rappeler par un conseiller AFEM →',
  },
  {
    brand: 'numerus',
    label: 'J2',
    subject: 'Futur PASS/LAS : où en es-tu vraiment ? (test gratuit avant septembre)',
    preheader: 'Fais le point sur ton niveau avant la rentrée médecine.',
    paragraphs: [
      'Beaucoup de futurs PASS/LAS surestiment — ou sous-estiment — leur niveau réel en juin. Résultat en septembre : mauvaise surprise au premier partiel.',
      'Numerus Club met en relation des <strong>étudiants qui ont déjà passé le concours</strong> avec des futurs PASS/LAS. Un premier échange ou un concours blanc te donne une photo claire de là où tu en es.',
      'C\'est gratuit pour commencer, sans engagement.',
    ],
    ctaLabel: 'Faire le point gratuitement',
    ctaHref: 'https://www.numerusclub.fr',
    showFormLink: true,
    formLinkLabel: 'Réserver mon test / échange gratuit →',
  },
  {
    brand: 'hermione',
    label: 'J3',
    subject: 'Tu vises la médecine en 2026 ? Installe ta méthode avant le PASS/LAS',
    preheader: 'Méthode de travail : le vrai facteur de réussite en PASS/LAS.',
    paragraphs: [
      'En PASS/LAS, le volume de cours explose dès la première semaine. Ceux qui réussissent ne sont pas forcément les plus forts : ce sont ceux qui ont une <strong>méthode installée avant septembre</strong>.',
      'Club Hermione accompagne les futurs étudiants en médecine sur l\'organisation, la mémorisation et le planning hebdomadaire — adapté à ta fac.',
      'Anticiper cet été, c\'est gagner 3 mois de retard en septembre.',
    ],
    ctaLabel: 'Installer ma méthode Hermione',
    ctaHref: 'https://hermione.co',
    showFormLink: true,
  },
  {
    brand: 'prepamedecine',
    label: 'J4',
    subject: 'Futur PASS/LAS : ton comparatif prépa personnalisé en 24 h (gratuit)',
    preheader: 'Comparateur indépendant — conseil gratuit sous 24 h.',
    paragraphs: [
      'Paris compte plus de 30 prépas PASS/LAS. Prix, format, taux de réussite affichés, avis… difficile de s\'y retrouver seul.',
      '<strong>PrépaMédecine.fr</strong> est un comparateur <strong>indépendant</strong> : on ne vend aucune prépa. Un conseiller te rappelle sous 24 h avec une short-list adaptée à ta ville, ton budget et ton profil.',
      'Gratuit, sans engagement.',
    ],
    ctaLabel: 'Obtenir mon comparatif gratuit',
    ctaHref: 'https://prepamedecine.fr',
    showFormLink: true,
    formLinkLabel: 'Demander mon conseil personnalisé →',
  },
  {
    brand: 'afem',
    label: 'J5',
    subject: 'PASS, LAS ou LSPS : prépa, tutorat ou les deux avant septembre ?',
    preheader: 'Comment arbitrer prépa classique et accompagnement ciblé.',
    paragraphs: [
      'Prépa annuelle, tutorat, colles, cours en ligne… Les combinaisons sont infinies et le budget aussi.',
      'L\'AFEM t\'aide à arbitrer selon ton profil : autonome ou besoin de cadre ? Budget serré ou confort ? Fac exigeante ou accessible ?',
      'Nos conseillers connaissent le terrain — association d\'étudiants en médecine, pas un commercial.',
    ],
    ctaLabel: 'Parler à un conseiller AFEM',
    ctaHref: 'https://afem-edu.fr',
    showFormLink: true,
  },
  {
    brand: 'numerus',
    label: 'J6',
    subject: "Futur étudiant en médecine : ce que le premier concours blanc t'apprendra",
    preheader: 'Simuler le concours avant septembre change ta préparation.',
    paragraphs: [
      'Le premier partiel PASS/LAS est un choc : QCM chronométrés, classement immédiat, pression collective.',
      'Un <strong>concours blanc avant la rentrée</strong> te montre ton vrai niveau, tes lacunes par matière et le rythme à viser.',
      'Sur Numerus Club, des coachs ayant réussi le concours proposent des simulations réalistes — en visio ou présentiel.',
    ],
    ctaLabel: 'Réserver un concours blanc',
    ctaHref: 'https://www.numerusclub.fr',
    showFormLink: true,
  },
  {
    brand: 'hermione',
    label: 'J7',
    subject: 'Futur PASS/LAS : le planning à préparer cet été (pas en septembre)',
    preheader: 'Planning type été → rentrée : la feuille de route Hermione.',
    paragraphs: [
      'Août n\'est pas une pause si tu vises la médecine : c\'est la fenêtre pour installer tes automatismes sans la pression des partiels.',
      'Hermione partage un <strong>planning type été</strong> : révisions ciblées, pauses, reprise progressive — pas 10 h/jour dès le 1er août.',
      'Tu repars en septembre avec une routine, pas avec de la culpabilité.',
    ],
    ctaLabel: 'Télécharger le planning type',
    ctaHref: 'https://hermione.co',
    showFormLink: true,
  },
  {
    brand: 'prepamedecine',
    label: 'J8',
    subject: '30 prépas pour futurs PASS/LAS — filtre par ville et budget',
    preheader: 'Toutes les prépas PASS/LAS filtrées selon tes critères.',
    paragraphs: [
      'Tu as peut-être déjà une liste de prépas en tête. Mais as-tu comparé les <strong>vrais tarifs</strong>, les formats hybrides et les spécialisations par fac ?',
      'Notre base recense plus de 30 structures PASS/LAS en France. Filtre par ville, budget max et type de cursus.',
      'Un conseiller peut t\'aider à lire entre les lignes des plaquettes marketing.',
    ],
    ctaLabel: 'Filtrer les prépas',
    ctaHref: 'https://prepamedecine.fr',
    showFormLink: true,
  },
  {
    brand: 'afem',
    label: 'J9',
    subject: 'Tu vises la médecine à Paris : 6 facs — ta prépa prépare la bonne ?',
    preheader: 'Chaque fac parisienne a ses spécificités d\'épreuves.',
    paragraphs: [
      'Paris Cité, Sorbonne, Saclay, UPEC, Villetaneuse, Créteil : les épreuves, coefficients et culture de classement diffèrent.',
      'Une prépa « généraliste » ne prépare pas toujours la fac que tu vises. L\'AFEM croise ton profil avec les spécificités de chaque établissement.',
      'Évite de payer 9 000 € pour une prépa mal alignée avec ta fac cible.',
    ],
    ctaLabel: 'Vérifier mon alignement fac / prépa',
    ctaHref: 'https://afem-edu.fr',
    showFormLink: true,
  },
  {
    brand: 'numerus',
    label: 'J10',
    subject: "Futur PASS/LAS : ce sera une année de classement (anticipe avant septembre)",
    preheader: 'Comprendre le classement dès maintenant change ta stratégie.',
    paragraphs: [
      'En PASS/LAS, tu n\'es pas évalué en absolu : tu es <strong>classé par rapport aux autres</strong>. Chaque point compte.',
      'Les étudiants qui anticipent cette logique adaptent leur stratégie dès septembre : matières à fort coefficient, annales, gestion du stress.',
      'Numerus Club te met en contact avec des étudiants qui ont vécu cette année — leurs retours valent plus qu\'un discours marketing.',
    ],
    ctaLabel: 'Échanger avec un ancien PASS/LAS',
    ctaHref: 'https://www.numerusclub.fr',
    showFormLink: true,
  },
  {
    brand: 'hermione',
    label: 'J11',
    subject: 'Avant la rentrée médecine : août utile ou août perdu ?',
    preheader: 'La bonne dose de travail cet été — ni trop, ni trop peu.',
    paragraphs: [
      'Travailler tout l\'été épuise avant septembre. Ne rien faire crée une dette impossible à rattraper.',
      'La clé : <strong>3 à 5 sessions par semaine</strong>, matières prioritaires, temps libre protégé.',
      'Hermione t\'aide à calibrer cet équilibre selon ton point de départ.',
    ],
    ctaLabel: 'Calibrer mon été avec Hermione',
    ctaHref: 'https://hermione.co',
    showFormLink: true,
  },
  {
    brand: 'prepamedecine',
    label: 'J12',
    subject: 'PASS, LAS ou LSPS : 4 questions avant de choisir ta prépa',
    preheader: '4 questions qui évitent 80 % des mauvais choix de prépa.',
    paragraphs: [
      '<strong>1.</strong> Quelle fac vises-tu vraiment ? <strong>2.</strong> Quel budget total (pas seulement la mensualité) ? <strong>3.</strong> As-tu besoin de cadre ou d\'autonomie ? <strong>4.</strong> Prépa seule ou combo tutorat ?',
      'Si tu ne peux pas répondre clairement aux 4, tu n\'es pas prêt à signer.',
      'Nos conseillers t\'aident à y voir clair — gratuitement, en 15 minutes.',
    ],
    ctaLabel: 'Répondre aux 4 questions avec un conseiller',
    ctaHref: 'https://prepamedecine.fr',
    showFormLink: true,
  },
  {
    brand: 'afem',
    label: 'J13',
    subject: 'Prépa PASS/LAS Paris : 7 790 € ou 9 200 € — le vrai calcul avant septembre',
    preheader: 'Décortiquer le vrai coût d\'une prépa PASS/LAS.',
    paragraphs: [
      'Les prix affichés cachent souvent des options : stages, colles, annales, frais de dossier.',
      'Sur 7 790 € ou 9 200 €, que paies-tu vraiment ? Heures de cours ? Corrections ? Accompagnement individuel ?',
      'L\'AFEM t\'aide à lire une offre commerciale et à comparer le coût par heure utile — pas le prix sur la brochure.',
    ],
    ctaLabel: 'Comparer le vrai coût des prépas',
    ctaHref: 'https://afem-edu.fr',
    showFormLink: true,
  },
  {
    brand: 'numerus',
    label: 'J14',
    subject: 'Futur PASS/LAS à Paris : 5 erreurs à éviter avant la rentrée',
    preheader: 'Les 5 erreurs classiques des futurs PASS/LAS parisiens.',
    paragraphs: [
      '<strong>1.</strong> Choisir sa prépa avant sa fac. <strong>2.</strong> Négliger les annales de SA fac. <strong>3.</strong> Travailler sans planning. <strong>4.</strong> Isoler socialement. <strong>5.</strong> Attendre le premier partiel pour réagir.',
      'Des coachs Numerus — passés par le concours à Paris — partagent comment ils les ont évitées (ou pas).',
    ],
    ctaLabel: 'Éviter ces 5 erreurs',
    ctaHref: 'https://www.numerusclub.fr',
    showFormLink: true,
  },
  {
    brand: 'hermione',
    label: 'J15',
    subject: 'Tu vas faire médecine : anticiper les oraux avant septembre',
    preheader: 'Les oraux PASS/LAS : souvent sous-estimés, souvent décisifs.',
    paragraphs: [
      'Le QCM fait la sélection de masse. Mais sur certaines facs, <strong>l\'oral fait la différence</strong> entre admis et liste d\'attente.',
      'S\'exprimer clairement, structurer une réponse, gérer le stress : ça ne s\'improvise pas la veille.',
      'Hermione propose des simulations d\'oraux dès la rentrée — mieux vaut savoir à quoi t\'attendre avant.',
    ],
    ctaLabel: 'Préparer mes oraux',
    ctaHref: 'https://hermione.co',
    showFormLink: true,
  },
  {
    brand: 'prepamedecine',
    label: 'J16',
    subject: "Top prépas PASS/LAS 2025 : ce que les avis disent (avant de t'inscrire)",
    preheader: 'Lire les avis utilement — critères objectifs.',
    paragraphs: [
      'Les avis Google et les forums sont bruités : étudiants satisfaits, déçus, trolls.',
      'PrépaMédecine croise avis vérifiés, taux déclarés et retours de conseillers indépendants.',
      'Avant de signer un chèque de 8 000 €, mérite un regard structuré.',
    ],
    ctaLabel: 'Voir les avis structurés',
    ctaHref: 'https://prepamedecine.fr',
    showFormLink: true,
  },
  {
    brand: 'afem',
    label: 'J17',
    subject: 'Futur PASS/LAS : QCM, rédactionnel, oral — ta fac ne joue pas pareil',
    preheader: 'Coefficients et types d\'épreuves par faculté.',
    paragraphs: [
      'Certaines facs favorisent le QCM pur. D\'autres pondèrent fortement le rédactionnel ou l\'oral.',
      'Ta stratégie de révision doit suivre <strong>le barème de TA fac</strong>, pas une méthode générique YouTube.',
      'L\'AFEM référence les spécificités des principales facultés — gratuitement.',
    ],
    ctaLabel: 'Voir les épreuves de ma fac',
    ctaHref: 'https://afem-edu.fr',
    showFormLink: true,
  },
  {
    brand: 'numerus',
    label: 'J18',
    subject: "Tu n'es pas encore en médecine — et c'est ton avantage",
    preheader: 'Pourquoi partir de zéro cet été peut être une force.',
    paragraphs: [
      'Tu n\'as pas encore de mauvaises habitudes de travail. Pas de stress de classement. Pas de fatigue accumulée.',
      'C\'est le moment idéal pour <strong>construire la bonne méthode</strong> avec quelqu\'un qui connaît le chemin.',
      'Numerus Club connecte futurs PASS/LAS et étudiants coachs — gratuitement pour démarrer.',
    ],
    ctaLabel: 'Profiter de mon avantage',
    ctaHref: 'https://www.numerusclub.fr',
    showFormLink: true,
  },
  {
    brand: 'hermione',
    label: 'J19',
    subject: 'Futur PASS/LAS : un coach avant la rentrée, ça change quoi ?',
    preheader: 'Coaching pré-rentrée : retours d\'expérience.',
    paragraphs: [
      'Un coach ne fait pas le travail à ta place. Il t\'évite les erreurs qu\'il a faites, te donne un cadre et te responsabilise.',
      'Les étudiants accompagnés avant septembre arrivent le jour J avec un planning, des priorités et une confiance mesurée.',
      'Hermione propose un premier échange pour voir si le format te correspond.',
    ],
    ctaLabel: 'Réserver un premier échange',
    ctaHref: 'https://hermione.co',
    showFormLink: true,
  },
  {
    brand: 'prepamedecine',
    label: 'J20',
    subject: 'Rentrée PASS/LAS 2026 : checklist 7 points + rappel conseiller gratuit',
    preheader: 'Checklist finale avant septembre + dernier conseil gratuit.',
    paragraphs: [
      '<strong>Checklist :</strong> fac cible validée · prépa ou plan B choisi · planning été calé · matériel prêt · annales de ta fac téléchargées · réseau amis/étudiants · santé/sommeil protégés.',
      'Si un point manque, il n\'est pas trop tard — mais le temps presse.',
      'Un conseiller PrépaMédecine peut faire le point avec toi en 15 min, gratuitement.',
    ],
    ctaLabel: 'Valider ma checklist avec un conseiller',
    ctaHref: 'https://prepamedecine.fr',
    showFormLink: true,
    formLinkLabel: 'Dernière chance : être rappelé gratuitement →',
  },
]
