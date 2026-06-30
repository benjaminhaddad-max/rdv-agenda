import type { BrandCharter } from '@/lib/brand-charter'
import { brandCtaButton } from '@/lib/brand-charter'

export type LastChanceBrand = 'afem' | 'numerus' | 'hermione' | 'prepamedecine'

/** Pages AFEM — comparatifs prépas (re-qualification, pas outils Parcoursup) */
export const AFEM_URLS = {
  prepasParis: 'https://www.afem-edu.fr/prepas-medecine/paris',
  prepasIndex: 'https://www.afem-edu.fr/prepas-medecine',
  facParisCite: 'https://www.afem-edu.fr/facultes/paris-cite',
} as const

/** Facs parisiennes — base leads IDF */
export const PARIS_FACS_SHORT =
  'Paris Cité, Sorbonne, Paris-Saclay, UPEC (Créteil), Sorbonne Paris Nord (Villetaneuse) et UVSQ'

/** URLs partenaires — angle Paris / IDF (certaines pages à créer, voir docs/marketing-last-chance-contenus-cta-idf.md) */
export const PARTNER_URLS = {
  afemPrepasParis: AFEM_URLS.prepasParis,
  prepamedecineParis: 'https://prepamedecine.fr/prepa-medecine-paris/',
  hermionePassLas: 'https://hermione.co/pass-las/',
  hermionePlanningEteParis: 'https://hermione.co/pass-las/#planning-ete-paris',
  hermioneOrauxParis: 'https://hermione.co/pass-las/#oraux-paris',
  numerusPassLasParis: 'https://www.numerusclub.fr/pass-las-paris',
  numerusConcoursBlancParis: 'https://www.numerusclub.fr/concours-blanc-pass-las-paris',
} as const

/** Lien formulaire CRM — re-qualifier : prépa choisie ou pas */
export const FORM_REQUAL_PREPA = 'As-tu déjà choisi ta prépa ? Je réponds en 2 min →'

export interface LastChanceStepDef {
  brand: LastChanceBrand
  label: string
  subject: string
  preheader: string
  paragraphs: string[]
  ctaLabel: string
  ctaHref?: string
  showFormLink?: boolean
  formLinkLabel?: string
}

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
    preheader: 'Tu as ta place en PASS/LAS — il reste à trancher sur la prépa.',
    paragraphs: [
      'Tu t\'es demandé quelle est <strong>la meilleure prépa PASS/LAS</strong> pour Paris en 2026. Si tu lis cet email, c\'est que <strong>ta place en médecine pour septembre est déjà acquise</strong> — la vraie question n\'est plus Parcoursup, c\'est : <strong>as-tu déjà choisi ta prépa, ou tu hésites encore ?</strong>',
      'Réponse honnête : il n\'existe pas une prépa « meilleure » pour tout le monde — c\'est celle alignée avec <strong>ta fac parisienne</strong> (Cité, Sorbonne, Saclay, Créteil, Villetaneuse, UPEC), ton budget et ta façon de travailler. Certaines structures couvrent mal certaines facs.',
      'L\'AFEM publie un <strong>comparatif indépendant des prépas médecine à Paris</strong> : tarifs réels, avis, couverture des 6 facs, PASS/LAS — mis à jour pour la rentrée 2026.',
      'Que tu envisages une prépa, un tutorat ciblé ou l\'autonomie, ce comparatif t\'aide à trancher <strong>avant de signer</strong> — ou à confirmer que ton choix actuel est cohérent.',
      'En 2 minutes, tu peux aussi nous dire où tu en es (déjà inscrit, en réflexion, pas de prépa) : on t\'oriente vers le bon conseil.',
    ],
    ctaLabel: 'Je découvre le comparatif des prépas à Paris →',
    ctaHref: AFEM_URLS.prepasParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'numerus',
    label: 'J2',
    subject: 'PASS/LAS à Paris : où en es-tu vraiment avant septembre ?',
    preheader: 'Fac parisienne en vue — fais le point sur ton niveau réel.',
    paragraphs: [
      'Tu t\'es demandé <strong>où tu en es vraiment</strong> avant ta rentrée PASS/LAS en <strong>fac parisienne</strong> — Paris Cité, Sorbonne, Saclay, UPEC, Villetaneuse ou UVSQ : le rythme du concours n\'a rien à voir avec le lycée.',
      'Résultat classique en septembre à Paris : surprise au premier partiel, panique, mauvaise remise en question — alors que tout cela aurait pu être anticipé cet été.',
      '<strong>Numerus Club</strong> met en relation des futurs PASS/LAS d\'Île-de-France avec des étudiants ayant réussi le concours dans <strong>une fac parisienne</strong>.',
      'Un premier échange ou un concours blanc te donne une photo réaliste : matières fortes, lacunes à combler, rythme de travail à viser dès la rentrée.',
      'Ce n\'est pas pour te juger : c\'est un repère pour préparer l\'été intelligemment — et pour savoir si ta prépa (ou ton plan solo) est à la hauteur du barème de ta fac.',
    ],
    ctaLabel: 'Échanger avec un étudiant PASS/LAS à Paris →',
    ctaHref: PARTNER_URLS.numerusPassLasParis,
    showFormLink: true,
    formLinkLabel: 'Je précise ma fac parisienne et ma prépa (2 min) →',
  },
  {
    brand: 'hermione',
    label: 'J3',
    subject: 'PASS/LAS à Paris en 2026 : installe ta méthode avant septembre',
    preheader: 'Méthode de travail — le vrai facteur de réussite en fac parisienne.',
    paragraphs: [
      'Tu intègres une <strong>fac de médecine parisienne</strong> en PASS ou LAS — le volume de cours explose dès la première semaine. <strong>La méthode</strong> fera la différence avant même le premier partiel.',
      'Sans organisation, tu passes tes journées à relire sans mémoriser, à accumuler les fiches sans jamais les revoir — et le classement parisien est impitoyable.',
      '<strong>Club Hermione</strong> accompagne les futurs PASS/LAS d\'Île-de-France : planning hebdomadaire réaliste, mémorisation sur gros volumes, gestion du stress avant les partiels.',
      'L\'objectif n\'est pas 12 h par jour cet été : installer des automatismes (fiches, annales de <strong>ta fac</strong>, reprises espacées) pour arriver serein à la rentrée.',
      'Les étudiants qui préparent l\'été avec une méthode gagnent plusieurs semaines d\'avance sur ceux qui « découvrent » le rythme parisien en octobre.',
    ],
    ctaLabel: 'Structurer ma méthode PASS/LAS à Paris →',
    ctaHref: PARTNER_URLS.hermionePassLas,
    showFormLink: true,
    formLinkLabel: 'Je précise ma fac parisienne et ma prépa (2 min) →',
  },
  {
    brand: 'prepamedecine',
    label: 'J4',
    subject: 'PASS/LAS Paris : ton comparatif prépa personnalisé en 24 h (gratuit)',
    preheader: 'Prépas Paris & IDF — conseil indépendant sous 24 h.',
    paragraphs: [
      'Tu attends ton <strong>comparatif prépa PASS/LAS à Paris</strong> sous 24 h — voici ce que tu reçois : une short-list indépendante pour les facs parisiennes, sans que nous vendions aucune formation.',
      'À Paris, plus de 30 structures se disputent les futurs PASS/LAS : Diploma, Médisup, Antémed-Epsilon, CPCM… Difficile de comparer quand chaque site promet la lune.',
      '<strong>PrépaMédecine.fr</strong> croise ton profil (fac parisienne visée, budget, autonomie, prépa déjà signée ou non) avec les structures <strong>réellement adaptées à Paris</strong>.',
      'Un conseiller te rappelle sous 24 h — 15 à 20 minutes, gratuit, sans pression commerciale.',
      'Tu repars avec des noms concrets, des fourchettes de prix réelles et les points à vérifier avant de signer.',
    ],
    ctaLabel: 'Recevoir mon comparatif prépa Paris sous 24 h →',
    ctaHref: PARTNER_URLS.prepamedecineParis,
    showFormLink: true,
    formLinkLabel: 'Je précise ma fac parisienne et mon budget (2 min) →',
  },
  {
    brand: 'afem',
    label: 'J5',
    subject: 'PASS, LAS ou LSPS : prépa, tutorat ou les deux avant septembre ?',
    preheader: 'Place acquise — il reste à arbitrer prépa, tutorat ou solo.',
    paragraphs: [
      'Ta rentrée PASS/LAS est fixée — <strong>as-tu déjà tranché</strong> entre prépa classique, tutorat, colles ou autonomie ? Beaucoup de futurs étudiants hésitent encore en juin, alors que les places en prépa se remplissent.',
      'Prépa annuelle, cours en ligne, tutorat hebdomadaire, stages d\'été… Le budget total peut varier du simple au triple. L\'erreur classique : payer une prépa complète alors qu\'un accompagnement ciblé (ou l\'inverse) suffirait.',
      'L\'AFEM t\'aide à arbitrer selon <strong>ton profil réel</strong> : fac parisienne, budget, autonomie, prépa déjà signée ou non.',
      'Nos conseillers sont des étudiants en médecine et des enseignants — pas des commerciaux. Ils connaissent ce qui fonctionne sur le terrain pour chaque fac.',
      'Commence par notre comparatif Paris si tu n\'as pas encore choisi — ou dis-nous en 2 minutes si tu es déjà inscrit quelque part.',
    ],
    ctaLabel: 'Voir le comparatif prépas Paris →',
    ctaHref: AFEM_URLS.prepasParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'numerus',
    label: 'J6',
    subject: 'PASS/LAS Paris : ce que ton premier concours blanc t\'apprendra',
    preheader: 'Simuler le concours d\'une fac parisienne avant septembre.',
    paragraphs: [
      'Tu te demandes ce que <strong>le premier concours blanc</strong> t\'apprendra avant ta rentrée en <strong>fac parisienne</strong> — réponse : une photo réaliste de ton niveau, sous pression, comme au vrai partiel.',
      'À Paris, les promos PASS/LAS sont massives : classement publié vite, QCM chronométrés, volume de questions bien supérieur au lycée.',
      'Un <strong>concours blanc avant la rentrée</strong>, calibré sur les annales de ta fac parisienne, reproduit ces conditions : durée limitée, correction détaillée, matières à renforcer.',
      'Sur Numerus Club, des coachs ayant réussi le concours dans une <strong>fac parisienne</strong> proposent des simulations en visio ou en présentiel, avec débrief personnalisé.',
      'Tu repars avec un plan d\'action concret pour l\'été : quoi réviser, combien de temps, dans quel ordre — avant d\'investir dans une prépa.',
    ],
    ctaLabel: 'Réserver un concours blanc PASS/LAS Paris →',
    ctaHref: PARTNER_URLS.numerusConcoursBlancParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'hermione',
    label: 'J7',
    subject: 'PASS/LAS Paris : le planning à préparer cet été (pas en septembre)',
    preheader: 'Feuille de route été → rentrée en fac parisienne.',
    paragraphs: [
      'Le <strong>planning à préparer cet été</strong> avant ta rentrée PASS/LAS à Paris : c\'est ce qui évite d\'arriver cramé ou en retard le jour J.',
      'La clé : <strong>3 à 5 sessions par semaine</strong>, matières prioritaires selon <strong>ta fac parisienne</strong> (coefficients, QCM vs rédactionnel), vacances protégées.',
      'Hermione propose une feuille de route type pour les futurs PASS/LAS d\'Île-de-France : bio-chimie en priorité, annales de ta fac, pauses pour consolider.',
      'Tu structures aussi ta semaine type de rentrée : créneaux fixes, reprises espacées, bilan hebdomadaire — des habitudes qui font la différence dès le premier mois à Paris.',
      'Les étudiants qui suivent un planning d\'été arrivent en septembre avec une routine, pas avec de la culpabilité ou du retard.',
    ],
    ctaLabel: 'Télécharger le planning été PASS/LAS Paris →',
    ctaHref: PARTNER_URLS.hermionePlanningEteParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'prepamedecine',
    label: 'J8',
    subject: 'Prépas PASS/LAS à Paris — filtre par budget et fac',
    preheader: 'Comparateur Paris & IDF — prépas alignées sur ta fac.',
    paragraphs: [
      'Tu veux <strong>comparer les prépas PASS/LAS à Paris</strong> selon ton budget et ta fac — pas parcourir toute la France à l\'aveugle.',
      'Notre base recense les structures <strong>Paris et Île-de-France</strong> : filtres par budget, PASS/LAS, présentiel / hybride, alignement avec Paris Cité, Sorbonne, Saclay, UPEC, USPN ou UVSQ.',
      'Chaque fiche résume : heures réelles, corrections personnalisées, préparation aux oraux, couverture de <strong>ta fac parisienne</strong>.',
      'Un conseiller PrépaMédecine t\'aide à lire entre les lignes des plaquettes et à éviter les pièges (frais cachés, promesses gonflées).',
      'Tu gagnes des heures — et tu évites de signer une prépa mal calibrée pour le concours parisien.',
    ],
    ctaLabel: 'Comparer les prépas PASS/LAS à Paris →',
    ctaHref: PARTNER_URLS.prepamedecineParis,
    showFormLink: true,
    formLinkLabel: 'As-tu déjà une prépa ? Conseil gratuit en 2 min →',
  },
  {
    brand: 'afem',
    label: 'J9',
    subject: 'Tu vises la médecine à Paris : 6 facs — ta prépa prépare la bonne ?',
    preheader: 'Déjà admis — ta prépa couvre-t-elle ta fac parisienne ?',
    paragraphs: [
      'Tu es orienté vers une fac parisienne — <strong>ta prépa (ou celle que tu envisages) prépare-t-elle vraiment la bonne ?</strong> Paris Cité, Sorbonne, Saclay, UPEC, Villetaneuse, UVSQ : coefficients et épreuves diffèrent.',
      'Une prépa « généraliste » QCM ne sera pas optimale si ta fac pondère le rédactionnel. Une prépa très orientée oraux peut être surdimensionnée si ta fac est 90 % QCM.',
      'Notre <strong>comparatif des prépas à Paris</strong> indique quelles structures couvrent quelles facs, avec tarifs et avis — pour valider ton choix avant septembre.',
      'Si tu as déjà signé, tu peux vérifier en 2 minutes que ton contrat est aligné. Si tu hésites encore, le comparatif t\'évite une prépa mal calibrée à 8 000 €.',
      'Un conseiller AFEM peut confirmer ou corriger ton choix en 15 minutes — gratuitement.',
    ],
    ctaLabel: 'Vérifier les prépas pour ma fac parisienne →',
    ctaHref: AFEM_URLS.prepasParis,
    showFormLink: true,
    formLinkLabel: 'J\'indique ma fac et ma prépa actuelle (2 min) →',
  },
  {
    brand: 'numerus',
    label: 'J10',
    subject: 'PASS/LAS à Paris : une année de classement — anticipe dès maintenant',
    preheader: 'Comprendre le classement en fac parisienne change ta stratégie.',
    paragraphs: [
      'Tu entres en <strong>PASS ou LAS dans une fac parisienne</strong> — c\'est une année de <strong>classement</strong>. Comprendre cette logique avant septembre change toute ta stratégie.',
      'À Paris, les promos sont énormes : chaque point compte, les matières à fort coefficient deviennent prioritaires, la régularité bat le sprint de dernière minute.',
      'Les étudiants qui comprennent cela dès septembre adaptent leur stratégie : annales de <strong>leur fac</strong>, suivi du classement, gestion du stress.',
      'Numerus Club te met en contact avec des étudiants ayant vécu le concours dans une <strong>fac parisienne</strong> — retours concrets, pas discours marketing de prépa.',
      'Tu peux poser tes questions en direct : premier semestre, erreurs à éviter, équilibre vie/travail — et si ta prépa vaut vraiment le coup pour ta fac.',
    ],
    ctaLabel: 'Échanger avec un ancien PASS/LAS parisien →',
    ctaHref: PARTNER_URLS.numerusPassLasParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'hermione',
    label: 'J11',
    subject: 'PASS/LAS Paris : août utile ou août perdu avant la rentrée ?',
    preheader: 'La bonne dose de travail cet été en fac parisienne.',
    paragraphs: [
      'Août utile ou août perdu avant ta rentrée <strong>PASS/LAS à Paris</strong> ? Ni tout arrêter, ni s\'épuiser à 10 h par jour avant même le premier cours.',
      'La troisième voie : <strong>3 à 5 sessions par semaine</strong>, matières ciblées selon <strong>ta fac parisienne</strong>, pauses et vacances protégées.',
      'Hermione t\'aide à calibrer cet équilibre : bac solide ou lacunes, fac exigeante (Cité, Sorbonne…) ou plus accessible, prépa déjà signée ou autonomie.',
      'Tu reçois des repères concrets : priorités matières, pauses, progression sans te comparer à toute la promo parisienne.',
      'L\'été devient un investissement mesuré — pas une punition ni une perte de temps.',
    ],
    ctaLabel: 'Calibrer mon été PASS/LAS à Paris →',
    ctaHref: PARTNER_URLS.hermionePassLas,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'prepamedecine',
    label: 'J12',
    subject: 'PASS/LAS Paris : 4 questions avant de choisir ta prépa',
    preheader: '4 questions qui évitent 80 % des mauvais choix à Paris.',
    paragraphs: [
      'Avant de signer une prépa <strong>à Paris</strong>, voici les <strong>4 questions</strong> qui évitent 80 % des mauvais choix — si tu ne peux pas y répondre, tu n\'es pas prêt à t\'engager.',
      '<strong>1. Quelle fac parisienne vises-tu ?</strong> (Cité, Sorbonne, Saclay, UPEC, USPN, UVSQ — pas « médecine en général »).<br><strong>2. Quel budget total ?</strong> (mensualités + options + transport IDF).<br><strong>3. Cadre ou autonomie ?</strong><br><strong>4. Prépa seule ou combo tutorat / colles ?</strong>',
      'Nos conseillers PrépaMédecine t\'aident à structurer tes réponses en 15 minutes — gratuitement, pour les prépas <strong>Paris & IDF</strong>.',
      'Tu repars avec une short-list cohérente pour le concours parisien — pas 15 noms trouvés sur Google.',
    ],
    ctaLabel: 'Répondre aux 4 questions (prépa Paris) →',
    ctaHref: PARTNER_URLS.prepamedecineParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'afem',
    label: 'J13',
    subject: 'Prépa PASS/LAS Paris : 7 790 € ou 9 200 € — le vrai calcul avant septembre',
    preheader: 'Tarifs réels des prépas parisiennes — avant de signer.',
    paragraphs: [
      'Tu as ta place en PASS/LAS — <strong>as-tu déjà réglé ta prépa</strong>, ou tu compares encore les offres ? Les prix affichés (7 790 €, 9 200 €…) sont rarement le coût final : options, stages, colles et frais cachés s\'ajoutent.',
      'La bonne question : <strong>combien coûte une heure utile de préparation</strong> pour TA fac — cours, corrections, suivi réel, pas la plaquette marketing.',
      'Notre comparatif Paris détaille les fourchettes par structure, ce qui est inclus, et le rapport qualité-prix pour chaque fac.',
      'Si tu as déjà signé, vérifie que tu n\'as pas surpayé pour une couverture inutile. Si tu hésites, compare avant que les places partent.',
      'Indique-nous en 2 minutes si tu es déjà inscrit — on t\'aide à valider ou ajuster.',
    ],
    ctaLabel: 'Comparer les tarifs des prépas à Paris →',
    ctaHref: AFEM_URLS.prepasParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'numerus',
    label: 'J14',
    subject: 'Futur PASS/LAS à Paris : 5 erreurs à éviter avant la rentrée',
    preheader: 'Les 5 erreurs classiques des futurs PASS/LAS parisiens.',
    paragraphs: [
      'Tu vises Paris en PASS/LAS : voici les <strong>5 erreurs classiques</strong> à éviter avant la rentrée — et comment des anciens du concours parisien les ont contournées.',
      '<strong>1.</strong> Choisir sa prépa avant sa fac.<br><strong>2.</strong> Négliger les annales de SA fac (pas celles d\'une autre).<br><strong>3.</strong> Travailler sans planning ni bilan hebdomadaire.<br><strong>4.</strong> S\'isoler — le concours se prépare aussi en groupe.<br><strong>5.</strong> Attendre le premier partiel pour « voir » son niveau.',
      'Des coachs Numerus, passés par le concours à Paris, partagent comment ils ont fait (ou comment ils les ont évitées de justesse).',
      'Un échange de 30 minutes peut te faire gagner des mois d\'essais-erreurs.',
      'C\'est gratuit pour démarrer sur la plateforme — sans engagement.',
    ],
    ctaLabel: 'Éviter ces 5 erreurs PASS/LAS à Paris →',
    ctaHref: PARTNER_URLS.numerusPassLasParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'hermione',
    label: 'J15',
    subject: 'PASS/LAS Paris : anticiper les oraux avant septembre',
    preheader: 'Oraux & rédactionnel — souvent décisifs en fac parisienne.',
    paragraphs: [
      'Les <strong>oraux et le rédactionnel PASS/LAS</strong> sont souvent sous-estimés — sur plusieurs <strong>facs parisiennes</strong>, ils font la différence entre admis, liste d\'attente et recalé.',
      'S\'exprimer clairement, structurer une réponse en 2 minutes, gérer le stress face à un jury : des compétences qui s\'entraînent — pas des talents innés.',
      'Hermione propose des simulations d\'oraux adaptées au concours médecine <strong>à Paris</strong> — format, barème, attentes selon ta fac.',
      'Les étudiants qui découvrent le format oral en janvier perdent un avantage sur ceux qui se préparent dès septembre.',
      'Un premier échange permet de voir si le coaching Hermione te correspond — et si ta prépa couvre bien cette dimension pour ta fac.',
    ],
    ctaLabel: 'Préparer mes oraux PASS/LAS (Paris) →',
    ctaHref: PARTNER_URLS.hermioneOrauxParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'prepamedecine',
    label: 'J16',
    subject: 'Top prépas PASS/LAS Paris 2026 : ce que les avis disent vraiment',
    preheader: 'Avis structurés — prépas Paris & IDF.',
    paragraphs: [
      'Avant de t\'inscrire, tu veux savoir ce que disent vraiment les <strong>avis sur les prépas PASS/LAS à Paris</strong> — sans te fier aux notes Google bruitées.',
      'PrépaMédecine croise avis vérifiés, retours de conseillers indépendants et critères objectifs : heures, effectifs, alignement avec <strong>ta fac parisienne</strong>.',
      'Avant de signer 7 000 à 9 000 €, mérite un regard structuré : suivi, corrections, préparation aux épreuves spécifiques de Paris Cité, Sorbonne, Saclay, UPEC, USPN ou UVSQ.',
      'Nos conseillers t\'indiquent les questions à poser en entretien de prépa — celles qui révèlent la vraie qualité pour le concours parisien.',
      'Tu évites les mauvaises surprises après la rentrée en fac.',
    ],
    ctaLabel: 'Voir les avis sur les prépas PASS/LAS à Paris →',
    ctaHref: PARTNER_URLS.prepamedecineParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'afem',
    label: 'J17',
    subject: 'Futur PASS/LAS : QCM, rédactionnel, oral — ta fac ne joue pas pareil',
    preheader: 'Ta fac parisienne a ses épreuves — ta prépa les couvre ?',
    paragraphs: [
      'QCM, rédactionnel, oral : <strong>ta fac parisienne ne joue pas pareil</strong> — et ta stratégie (et ta prépa) doivent suivre le barème réel, pas une méthode générique.',
      'Certaines facs sont dominées par le QCM chronométré. D\'autres pondèrent fortement le rédactionnel ou l\'oral. Ta prépa doit préparer <strong>ces</strong> épreuves, pas un concours « moyen ».',
      'Si tu n\'as pas encore choisi ta prépa, notre <strong>comparatif Paris</strong> indique quelles structures sont alignées avec chaque fac.',
      'Si tu es déjà inscrit, c\'est le moment de vérifier que ton accompagnement colle à ton barème — avant septembre.',
      'Dis-nous en 2 minutes ta fac et ta situation prépa : on te dit si tu es sur la bonne voie.',
    ],
    ctaLabel: 'Voir quelles prépas préparent ma fac →',
    ctaHref: AFEM_URLS.prepasParis,
    showFormLink: true,
    formLinkLabel: 'Je précise ma fac et ma prépa (2 min) →',
  },
  {
    brand: 'numerus',
    label: 'J18',
    subject: 'PASS/LAS Paris : ton avantage avant la rentrée en fac',
    preheader: 'Construire ta méthode avant le classement parisien.',
    paragraphs: [
      'Tu n\'es pas encore en médecine — et c\'est ton <strong>avantage</strong> avant ta rentrée <strong>PASS/LAS en fac parisienne</strong> : pas de mauvaises habitudes, pas de stress de classement, pas de fatigue de partiel.',
      'C\'est le meilleur moment pour <strong>construire la bonne méthode</strong> — avec un étudiant qui connaît déjà le concours de ta fac à Paris.',
      'Numerus Club connecte futurs PASS/LAS d\'Île-de-France et coachs ayant réussi à Paris Cité, Sorbonne, Saclay, UPEC, USPN ou UVSQ.',
      'Mise en relation gratuite pour démarrer — vous arrangez ensuite format et tarif directement.',
      'Tu profites de l\'expérience parisienne — avant de t\'engager à 8 000 € dans une prépa que tu n\'as pas encore validée.',
    ],
    ctaLabel: 'Trouver un coach PASS/LAS Paris →',
    ctaHref: PARTNER_URLS.numerusPassLasParis,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'hermione',
    label: 'J19',
    subject: 'PASS/LAS Paris : un coach avant la rentrée, ça change quoi ?',
    preheader: 'Coaching pré-rentrée en fac parisienne.',
    paragraphs: [
      'Un <strong>coach avant ta rentrée PASS/LAS à Paris</strong>, ça change quoi ? Il t\'évite les erreurs qu\'il a faites dans <strong>ta fac</strong> et te donne un cadre réaliste.',
      'Les étudiants accompagnés avant septembre arrivent avec : planning testé, priorités claires (selon barème parisien), mémorisation adaptée, confiance mesurée.',
      'Hermione propose un premier échange pour les futurs PASS/LAS d\'Île-de-France : visio, fréquence, objectifs de l\'été, fac visée.',
      'Tu poses toutes tes questions sans engagement : organisation, stress, prépa déjà signée ou non, oraux.',
      'Beaucoup attendent « d\'être en retard » — les plus malins anticipent avant le choc du classement parisien.',
    ],
    ctaLabel: 'Réserver un échange PASS/LAS Paris →',
    ctaHref: PARTNER_URLS.hermionePassLas,
    showFormLink: true,
    formLinkLabel: FORM_REQUAL_PREPA,
  },
  {
    brand: 'prepamedecine',
    label: 'J20',
    subject: 'Rentrée PASS/LAS Paris 2026 : checklist + conseiller gratuit',
    preheader: '7 points à valider avant septembre en fac parisienne.',
    paragraphs: [
      'Rentrée <strong>PASS/LAS Paris 2026</strong> : voici la <strong>checklist des 7 points</strong> à valider — et un rappel conseiller gratuit si un point manque.',
      '① Fac parisienne validée (Cité, Sorbonne, Saclay, UPEC, USPN ou UVSQ). ② Prépa Paris choisie ou autonomie assumée. ③ Planning été calé. ④ Matériel prêt. ⑤ Annales de <strong>ta fac</strong> téléchargées. ⑥ Réseau (groupe, coach). ⑦ Santé protégée.',
      'Si un point manque, chaque semaine compte maintenant.',
      'Un conseiller PrépaMédecine fait le point en 15 minutes : gratuit, indépendant, spécialiste <strong>prépas Paris & IDF</strong>.',
      'C\'est le moment de verrouiller tes choix avant le choc de septembre.',
    ],
    ctaLabel: 'Valider ma checklist PASS/LAS Paris →',
    ctaHref: PARTNER_URLS.prepamedecineParis,
    showFormLink: true,
    formLinkLabel: 'Dernière chance : être rappelé gratuitement →',
  },
]
