import type { BrandCharter } from '@/lib/brand-charter'
import { brandCtaButton } from '@/lib/brand-charter'

export type LastChanceBrand = 'afem' | 'numerus' | 'hermione' | 'prepamedecine'

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
    preheader: 'Pas la plus chère — celle alignée avec ta fac parisienne.',
    paragraphs: [
      'Tu t\'es demandé quelle est <strong>la meilleure prépa PASS/LAS</strong> pour viser la médecine à Paris en 2026. Réponse honnête : <strong>il n\'existe pas une prépa « meilleure » pour tout le monde</strong> — c\'est celle qui colle à ta fac cible, ton dossier et ta façon de travailler.',
      'Avant de t\'engager à 7 000 ou 9 000 €, la vraie question est donc : <strong>ta fac parisienne (Cité, Sorbonne, Saclay, Créteil…) est-elle adaptée à ton profil ?</strong> Une erreur d\'orientation coûte une année entière.',
      'Pour t\'aider à trancher sans commercial, l\'AFEM met à disposition des outils <strong>100 % gratuits</strong> : simulateur Parcoursup, quizz « fac × profil », calculateur de réussite PASS/LAS, QCM par matière avec corrections détaillées.',
      'Ces outils ont aidé des milliers de lycéens et étudiants à éviter les mauvais choix avant la rentrée — et à identifier la prépa (ou l\'absence de prépa) vraiment pertinente pour eux.',
      'En 10 minutes, tu peux déjà avoir une première vision claire de ton profil et des facs parisiennes qui te correspondent.',
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
      'Tu t\'es demandé <strong>où tu en es vraiment</strong> avant la rentrée PASS/LAS — et c\'est la bonne question : les notes du bac ne reflètent pas le rythme du concours, et les QCM de terminale n\'ont rien à voir avec ceux de la fac.',
      'Résultat classique en septembre : surprise au premier partiel, panique, mauvaise remise en question — alors que tout cela aurait pu être anticipé.',
      '<strong>Numerus Club</strong> met gratuitement en relation des futurs PASS/LAS avec des étudiants qui ont déjà passé le concours (PASS, LAS, parfois les deux).',
      'Un premier échange ou un concours blanc te donne une photo réaliste : matières fortes, lacunes à combler, rythme de travail à viser dès la rentrée.',
      'Ce n\'est pas un test « pour te juger » : c\'est un repère pour préparer l\'été intelligemment, sans te cramer ni te rassurer à tort.',
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
      'Tu vises la médecine en 2026 et tu sais que le volume de cours va exploser dès la première semaine — <strong>la méthode de travail</strong> fera la différence avant même le premier partiel.',
      'Sans organisation, tu passes tes journées à relire sans mémoriser, à accumuler les fiches sans jamais les revoir, à travailler beaucoup pour peu de résultats au classement.',
      '<strong>Club Hermione</strong> accompagne les futurs étudiants en médecine sur trois piliers : planning hebdomadaire réaliste, techniques de mémorisation adaptées aux gros volumes, et gestion du stress avant les partiels.',
      'L\'objectif n\'est pas de travailler 12 h par jour cet été : c\'est d\'installer des automatismes (fiches, annales, reprises espacées) pour arriver serein à la rentrée.',
      'Les étudiants qui préparent l\'été avec une méthode gagnent en moyenne plusieurs semaines d\'avance sur ceux qui « découvrent » le rythme en octobre.',
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
      'Tu attends ton <strong>comparatif prépa personnalisé sous 24 h</strong> — voici ce que tu vas recevoir : une short-list indépendante, adaptée à ton profil, sans que nous vendions aucune formation.',
      'Les plaquettes marketing affichent toutes d\'excellents taux, des professeurs « issus des meilleures facs », des promesses de réussite. Difficile de comparer objectivement quand chaque site vend sa propre formation.',
      '<strong>PrépaMédecine.fr</strong> est un comparateur <strong>indépendant</strong> : nous ne vendons aucune prépa. Notre rôle est de croiser ton profil (ville, budget, fac visée, autonomie) avec une short-list de structures adaptées.',
      'Un conseiller te rappelle sous 24 h pour un échange de 15 à 20 minutes — gratuit, sans engagement, sans pression commerciale.',
      'Tu repars avec des noms concrets, des fourchettes de prix réelles et les points à vérifier avant de signer.',
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
      'Prépa classique, tutorat, colles, cours en ligne, stages d\'été… <strong>comment arbitrer avant septembre ?</strong> Les combinaisons sont infinies — et le budget total peut varier du simple au triple pour un résultat comparable.',
      'Certaines personnes ont besoin d\'un cadre strict toute l\'année. D\'autres, déjà autonomes, n\'ont besoin que de colles ciblées ou d\'un suivi méthodologique.',
      'L\'AFEM t\'aide à arbitrer selon <strong>ton profil réel</strong> : niveau actuel, fac visée, budget familial, capacité à travailler seul, contraintes de transport.',
      'Nos conseillers sont des étudiants en médecine et des professeurs agrégés — pas des commerciaux. Ils connaissent les offres du marché et ce qui fonctionne vraiment sur le terrain.',
      'L\'objectif : que tu investisses au bon endroit — pas forcément le plus cher, mais le plus adapté.',
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
      'Tu te demandes ce que <strong>le premier concours blanc</strong> t\'apprendra avant septembre — et la réponse est simple : une photo réaliste de ton niveau, sous pression, comme au vrai partiel.',
      'Beaucoup d\'étudiants découvrent à ce moment-là qu\'ils ne savent pas gérer le temps, qu\'ils ont des trous dans certaines matières, ou qu\'ils paniquent sous pression — sans avoir pu s\'en rendre compte avant.',
      'Un <strong>concours blanc avant la rentrée</strong> reproduit ces conditions : durée limitée, correction détaillée, retour sur les matières à renforcer.',
      'Sur Numerus Club, des coachs ayant réussi le concours (PASS ou LAS) proposent des simulations en visio ou en présentiel, avec débrief personnalisé.',
      'Tu repars avec un plan d\'action concret pour l\'été : quoi réviser, combien de temps, dans quel ordre.',
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
      'Le <strong>planning à préparer cet été</strong> (pas en septembre) : c\'est la feuille de route qui évite d\'arriver cramé ou en retard le jour de la rentrée.',
      'La clé, c\'est un <strong>planning réaliste</strong> : 3 à 5 sessions de travail par semaine, matières prioritaires selon ta fac cible, temps libre et vacances protégés.',
      'Hermione propose une feuille de route type : quelles matières attaquer en premier (souvent bio-chimie), comment alterner cours et annales, quand faire des pauses pour consolider.',
      'Tu apprends aussi à structurer ta semaine type de rentrée : créneaux fixes, reprises espacées, bilan hebdomadaire — des habitudes qui font la différence dès le premier mois.',
      'Les étudiants qui suivent un planning d\'été arrivent en septembre avec une routine, pas avec de la culpabilité ou du retard.',
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
      'Tu veux <strong>filtrer les 30+ prépas PASS/LAS</strong> par ville et budget — voici comment notre base t\'aide à comparer objectivement, au-delà des plaquettes marketing.',
      'Notre base recense plus de 30 structures PASS/LAS en France, avec filtres par ville, budget maximum, type de cursus (PASS/LAS/LSPS) et mode (présentiel, distanciel, mixte).',
      'Chaque fiche résume ce qu\'il faut vérifier : nombre d\'heures réelles, corrections personnalisées ou non, préparation aux oraux, alignement avec ta fac cible.',
      'Un conseiller PrépaMédecine peut t\'aider à lire entre les lignes des plaquettes et à éviter les pièges classiques (frais cachés, promesses gonflées).',
      'Tu gagnes des heures de recherche — et tu évites de choisir à l\'aveugle.',
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
      'Tu vises la médecine à Paris et tu te demandes si <strong>ta prépa prépare vraiment la bonne fac</strong> parmi les 6 grandes — chacune a ses coefficients, ses épreuves et sa culture de classement.',
      'Une prépa « généraliste » qui prépare surtout le QCM pur ne sera pas optimale si ta fac pondère fortement le rédactionnel ou l\'oral. Inversement, une prépa très orientée oraux peut être surdimensionnée si ta fac est 90 % QCM.',
      'L\'AFEM croise ton profil (forces, fac visée, mode de travail) avec les spécificités de chaque établissement parisien — données mises à jour chaque année.',
      'Évite de payer 8 000 à 9 000 € pour une prépa mal alignée : ce n\'est pas « la meilleure prépa » en absolu, c\'est la bonne pour <strong>ta</strong> fac.',
      'En 15 minutes avec un conseiller, tu peux valider ou corriger ton choix avant de signer.',
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
      'Tu entres dans une année de <strong>classement</strong> — et comprendre cette logique avant septembre change toute ta stratégie de révision.',
      'Cette logique change tout : chaque point compte, les matières à fort coefficient deviennent prioritaires, et la régularité bat le sprint de dernière minute.',
      'Les étudiants qui comprennent cela dès septembre adaptent leur stratégie : annales en conditions réelles, suivi du classement, gestion du stress, pas de perfectionnisme sur les matières à faible poids.',
      'Numerus Club te met en contact avec des étudiants qui ont vécu cette année — leurs retours concrets valent plus qu\'un discours marketing de prépa.',
      'Tu peux poser tes questions en direct : comment ils ont géré le premier semestre, quelles erreurs ils referaient différemment, comment ils ont protégé leur santé mentale.',
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
      'Août utile ou août perdu ? <strong>La bonne dose de travail cet été</strong> n\'est ni tout arrêter, ni s\'épuiser à 10 h par jour avant même la rentrée.',
      'La troisième voie : <strong>3 à 5 sessions par semaine</strong>, 1h30 à 3h par session, matières ciblées, pauses et vacances protégées.',
      'Hermione t\'aide à calibrer cet équilibre selon ton point de départ : bac scientifique solide ou lacunes à combler, fac exigeante ou accessible, prépa ou autonomie.',
      'Tu reçois des repères concrets : quelles matières en priorité, quand faire une pause, comment mesurer ta progression sans te comparer aux autres.',
      'L\'été devient un investissement mesuré — pas une punition ni une perte de temps.',
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
      'Avant de choisir ta prépa, voici les <strong>4 questions</strong> qui évitent 80 % des mauvais choix — si tu ne peux pas y répondre clairement, tu n\'es pas prêt à signer.',
      '<strong>1. Quelle fac vises-tu vraiment ?</strong> (pas « la médecine en général » — une fac précise, avec ses épreuves).<br><strong>2. Quel budget total ?</strong> (mensualités + options + déplacements + matériel).<br><strong>3. As-tu besoin de cadre ou d\'autonomie ?</strong><br><strong>4. Prépa seule, ou combo avec tutorat / colles ?</strong>',
      'Nos conseillers PrépaMédecine t\'aident à structurer tes réponses en 15 minutes, gratuitement.',
      'Tu repars avec une short-list cohérente — pas une liste de 15 noms trouvés sur Google.',
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
      '7 790 € ou 9 200 € affichés en brochure — <strong>voici le vrai calcul</strong> avant de t\'engager : options, stages, colles et frais cachés changent souvent la facture finale.',
      'La bonne question n\'est pas « combien coûte l\'année ? » mais <strong>combien coûte une heure utile de préparation</strong> — cours + corrections + suivi adapté à ta fac.',
      'L\'AFEM t\'aide à lire une offre commerciale : ce qui est inclus, ce qui est en supplément, ce qui est vraiment utile pour ta fac cible.',
      'Parfois, une prépa moins chère avec un bon alignement fac vaut mieux qu\'une premium généraliste.',
      'Comparer le coût par heure et par type de service évite les mauvaises surprises en cours d\'année.',
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
      'Tu vises Paris en PASS/LAS : voici les <strong>5 erreurs classiques</strong> à éviter avant la rentrée — et comment des anciens du concours parisien les ont contournées.',
      '<strong>1.</strong> Choisir sa prépa avant sa fac.<br><strong>2.</strong> Négliger les annales de SA fac (pas celles d\'une autre).<br><strong>3.</strong> Travailler sans planning ni bilan hebdomadaire.<br><strong>4.</strong> S\'isoler — le concours se prépare aussi en groupe.<br><strong>5.</strong> Attendre le premier partiel pour « voir » son niveau.',
      'Des coachs Numerus, passés par le concours à Paris, partagent comment ils ont fait (ou comment ils les ont évitées de justesse).',
      'Un échange de 30 minutes peut te faire gagner des mois d\'essais-erreurs.',
      'C\'est gratuit pour démarrer sur la plateforme — sans engagement.',
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
      'Les <strong>oraux PASS/LAS</strong> sont souvent sous-estimés — pourtant sur de nombreuses facs, ils font la différence entre admis, liste d\'attente et recalé.',
      'S\'exprimer clairement, structurer une réponse en 2 minutes, gérer le stress face à un jury : ce ne sont pas des talents innés, ce sont des compétences qui s\'entraînent.',
      'Hermione propose des simulations d\'oraux et des méthodes de prise de parole adaptées au concours médecine — dès la rentrée, mieux vaut savoir à quoi t\'attendre.',
      'Les étudiants qui découvrent le format oral en janvier perdent un avantage précieux sur ceux qui se sont préparés dès septembre.',
      'Un premier échange permet de voir si le format coaching Hermione te correspond et de repartir avec des exercices concrets.',
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
      'Avant de t\'inscrire, tu veux savoir ce que disent vraiment les <strong>avis sur les top prépas PASS/LAS 2025</strong> — sans te fier aux notes Google bruitées ou aux faux commentaires.',
      'PrépaMédecine croise avis vérifiés, taux déclarés par les structures, retours de conseillers indépendants et critères objectifs (heures, effectifs, spécialisation fac).',
      'Avant de signer un chèque de 7 000 à 9 000 €, mérite un regard structuré : pas seulement la note moyenne, mais ce que disent les élèves sur le suivi, les corrections, l\'alignement fac.',
      'Nos conseillers t\'indiquent les questions à poser en entretien de prépa — celles qui révèlent la vraie qualité de l\'accompagnement.',
      'Tu évites les mauvaises surprises après la rentrée.',
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
      'QCM, rédactionnel, oral : <strong>ta fac ne joue pas pareil</strong> — et ta stratégie de révision doit suivre le barème de TA faculté, pas une méthode générique.',
      'Ta stratégie de révision doit suivre <strong>le barème de TA fac</strong> — pas une méthode générique trouvée sur YouTube ou dans une prépa « one size fits all ».',
      'L\'AFEM référence les spécificités des principales facultés : types d\'épreuves, matières à fort coefficient, culture du classement.',
      'Tu adaptes ton temps de travail : plus d\'annales QCM pour une fac QCM-heavy, plus de rédaction et d\'oral pour une fac équilibrée.',
      'C\'est gratuit et accessible en ligne — en quelques clics sur afem-edu.fr.',
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
      'Tu n\'es pas encore en médecine — et c\'est ton <strong>avantage</strong> : pas de mauvaises habitudes, pas de stress de classement, pas de fatigue liée à un mauvais partiel.',
      'C\'est paradoxalement le meilleur moment pour <strong>construire la bonne méthode</strong> — avec quelqu\'un qui connaît déjà le chemin.',
      'Numerus Club connecte futurs PASS/LAS et étudiants coachs (PASS, LAS, parfois réorientation). Échanges, concours blancs, conseils méthodo, vente de fiches entre étudiants.',
      'La plateforme est gratuite pour commencer la mise en relation — vous vous arrangez ensuite directement sur le format et le tarif.',
      'Tu profites de l\'expérience de ceux qui sont passés par là — sans payer une prépa à 8 000 € avant d\'avoir testé ton niveau.',
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
      'Un <strong>coach avant la rentrée</strong>, ça change quoi concrètement ? Il ne fait pas le travail à ta place — il t\'évite les erreurs qu\'il a faites et te donne un cadre réaliste.',
      'Les étudiants accompagnés avant septembre arrivent le jour J avec : un planning testé, des priorités claires, des techniques de mémorisation adaptées, et une confiance mesurée (pas fausse).',
      'Hermione propose un premier échange pour voir si le format te correspond : visio, fréquence, objectifs de l\'été.',
      'Tu peux poser toutes tes questions sans engagement : organisation, stress, équilibre vie/travail, préparation aux oraux.',
      'Beaucoup de futurs PASS/LAS attendent « d\'être en retard » pour demander de l\'aide — les plus malins anticipent.',
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
      'Rentrée PASS/LAS 2026 : voici la <strong>checklist des 7 points</strong> à valider avant septembre — et un dernier rappel conseiller gratuit si un point manque encore.',
      '① Fac cible validée (pas juste « médecine »). ② Prépa ou plan B choisi (ou décision consciente de l\'autonomie). ③ Planning été calé. ④ Matériel et manuels prêts. ⑤ Annales de TA fac téléchargées. ⑥ Réseau (amis, groupe, coach). ⑦ Sommeil et santé protégés.',
      'Si un point manque, il n\'est pas trop tard — mais chaque semaine compte maintenant.',
      'Un conseiller PrépaMédecine peut faire le point avec toi en 15 minutes : gratuit, indépendant, sans vente forcée.',
      'C\'est le bon moment pour verrouiller tes choix et aborder septembre sereinement.',
    ],
    ctaLabel: 'Valider ma checklist avec un conseiller',
    ctaHref: 'https://prepamedecine.fr',
    showFormLink: true,
    formLinkLabel: 'Dernière chance : être rappelé gratuitement →',
  },
]
