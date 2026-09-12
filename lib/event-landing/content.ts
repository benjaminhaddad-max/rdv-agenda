import type { EventDateFormat, EventLandingEvent, LandingCopy, LandingKind } from './types'
import { campusAccess, durationHours, prettyLocation } from './format'

const TEMOINS_BRAND: LandingCopy['temoins'] = [
  {
    name: 'Lirone',
    role: 'Grand Admis médecine — Paris Cité',
    photo: '/event-landing/avis/lirone.jpg',
    quote:
      '« Diploma Santé, c’est un cadre de soutien. Les professeurs sont là, et on n’est pas livré à soi-même. »',
  },
  {
    name: 'Lucie',
    role: 'Grande Admise médecine — Paris Cité',
    photo: '/event-landing/avis/lucie.jpg',
    quote:
      '« Des classes à taille humaine, un suivi individuel, et des professeurs à qui on peut poser les questions. »',
  },
  {
    name: 'Camille',
    role: 'Grande Admise — LAS, UPEC',
    photo: '/event-landing/avis/camille.jpg',
    quote:
      '« L’encadrement est tel que personne ne vous laissera tomber. À la moindre incompréhension, les professeurs sont là. »',
  },
]

const TEMOINS_IMMERSION: LandingCopy['temoins'] = [
  {
    name: 'Lirone',
    role: 'Grand Admis médecine — Paris Cité',
    photo: '/event-landing/avis/lirone.jpg',
    quote:
      '« J’y suis allé en Terminale, un peu par curiosité. L’examen blanc m’a mis une claque — et c’est exactement pour ça que j’ai voulu être préparé. »',
  },
  {
    name: 'Lucie',
    role: 'Grande Admise médecine — Paris Cité',
    photo: '/event-landing/avis/lucie.jpg',
    quote:
      '« Mes parents sont venus au cours du matin. C’est ce qui les a convaincus que ce n’était pas qu’une question de travail, mais aussi de méthode. »',
  },
  {
    name: 'Alexandre',
    role: 'Admis médecine — Paris Cité',
    photo: '/event-landing/avis/alexandre.jpg',
    quote:
      '« J’avais peur d’être largué au cours. En fait c’est l’inverse : j’ai compris que c’était faisable, à condition de s’y prendre autrement. »',
  },
]

function limitedBadge(event: EventLandingEvent): string | null {
  if (event.max_capacity == null || event.max_capacity <= 0) return null
  return `Places limitées à ${event.max_capacity}`
}

function immersionCopy(event: EventLandingEvent, fmt: EventDateFormat): LandingCopy {
  const cap = limitedBadge(event)
  return {
    kind: 'immersion',
    breadcrumb: event.name,
    heroTitle: 'Une journée en',
    heroAccent: 'première année de médecine',
    chapeaux: [
      'Pas une présentation de l’école. **Une vraie journée d’étudiant en PASS** : un cours en amphi avec un de nos professeurs, un examen blanc en conditions réelles, puis la correction et le débriefing.',
      'À la fin de la journée, vous saurez ce que demande réellement cette année — et où vous en êtes.',
    ],
    badges: ['Gratuit', 'Ouvert aux parents', cap].filter(Boolean) as string[],
    whyTitle: 'Ce que vous ne pouvez pas savoir',
    whyAccent: 'avant de l’avoir vécu',
    whyLead: 'Les plaquettes se ressemblent toutes. Une journée en conditions réelles, non.',
    avantages: [
      {
        title: 'Le niveau attendu',
        text: 'Un cours d’amphi au rythme réel, sur un chapitre du programme de PASS. Vous verrez en une heure ce qu’une brochure ne peut pas décrire : la densité, la vitesse, le volume de notes à prendre.',
      },
      {
        title: 'Votre position de départ',
        text: 'L’examen blanc de l’après-midi est corrigé et classé, comme à la faculté. Ce n’est pas un test de sélection : c’est un repère, et il est souvent plus rassurant qu’on ne le craint.',
      },
      {
        title: 'Ce qui fait la différence',
        text: 'Le débriefing porte sur la méthode : comment on prend des notes utiles, comment on répond à un QCM à barème négatif, comment on tient le rythme sur neuf mois.',
      },
    ],
    derouleTitle: 'Le déroulé de',
    derouleAccent: 'la journée',
    derouleLead: 'Huit heures construites comme une vraie journée de PASS, pauses comprises.',
    deroule: [
      {
        time: '9h – 9h30',
        title: 'Accueil et installation',
        text: 'Vous récupérez votre badge, votre fascicule de cours et votre carnet. Le café est sur place.',
      },
      {
        time: '9h30 – 11h30',
        title: 'Cours en amphi',
        text: 'Deux heures sur un chapitre de biologie cellulaire, par un enseignant-chercheur qui fait cours toute l’année à nos PASS. Aucun aménagement : c’est le cours tel qu’il est donné.',
      },
      {
        time: '11h30 – 12h15',
        title: 'Méthode de prise de notes',
        text: 'Un référent reprend votre cahier avec vous. Ce qu’il faut noter, ce qu’il ne faut pas, comment structurer pour pouvoir réviser trois mois plus tard.',
      },
      {
        time: '12h15 – 13h30',
        title: 'Déjeuner avec nos étudiants',
        text: 'Des étudiants de deuxième et troisième année de médecine déjeunent avec vous. C’est le moment où les vraies questions se posent.',
      },
      {
        time: '13h30 – 15h',
        title: 'Examen blanc',
        text: 'Un QCM au format de votre faculté, avec son barème — dégressif là où il l’est. En silence, en conditions d’épreuve.',
      },
      {
        time: '15h – 16h',
        title: 'Correction et classement',
        text: 'Votre copie corrigée, votre note, votre position dans le groupe. Puis la correction détaillée, question par question.',
      },
      {
        time: '16h – 17h',
        title: 'Débriefing et échange libre',
        text: 'Ce que votre copie dit de votre méthode. Et un temps avec l’équipe pédagogique pour les questions d’orientation.',
      },
    ],
    aPrevoir: [
      'De quoi écrire, et rien d’autre',
      'Le déjeuner est offert',
      'Les parents peuvent assister au cours du matin',
      'Prévoir la journée entière : la correction de l’après-midi est le cœur de l’événement',
    ],
    temoinsTitle: 'Ils sont venus',
    temoinsAccent: 'l’an dernier',
    temoinsLead: 'Et ils ont tous les trois été admis en médecine.',
    temoins: TEMOINS_IMMERSION,
    tarif: 'Gratuit, déjeuner compris\nInscription obligatoire',
    acces: campusAccess(event.location),
    faq: [
      {
        q: 'C’est vraiment gratuit ?',
        a: cap
          ? `Oui, déjeuner compris. L’inscription est obligatoire parce que les places sont limitées à ${event.max_capacity}, pas parce qu’il y a un tarif caché.`
          : 'Oui, déjeuner compris. L’inscription est obligatoire pour organiser l’accueil, pas parce qu’il y a un tarif caché.',
      },
      {
        q: 'Faut-il déjà avoir décidé de faire médecine ?',
        a: 'Non. Beaucoup viennent précisément pour trancher. Le cours et l’examen blanc donnent une idée concrète de ce que demande l’année — c’est aussi utile pour renoncer en connaissance de cause.',
      },
      {
        q: 'Je suis en Seconde, est-ce trop tôt ?',
        a: 'Non. Venir tôt permet de choisir ses spécialités en sachant à quoi elles servent.',
      },
      {
        q: 'Mes parents peuvent-ils venir ?',
        a: 'Oui, au cours du matin et au débriefing de fin de journée. Le déjeuner et l’examen blanc sont réservés aux élèves.',
      },
      {
        q: 'L’examen blanc compte-t-il pour une admission ?',
        a: 'Non, en aucun cas. Il n’est pas conservé, il ne constitue pas un dossier, et il n’a aucune incidence sur une candidature ultérieure.',
      },
      {
        q: `Je ne peux pas venir le ${fmt.jour} ${fmt.mois.toLowerCase()}`,
        a: 'Les autres dates sont sur la page Nos événements. Vous pouvez aussi nous appeler pour être orienté vers la prochaine session.',
      },
    ],
    ctaKicker: '',
    ctaTitle: 'Une journée pour savoir',
    ctaAccent: 'où vous en êtes',
    ctaLead: `Gratuit, déjeuner compris, parents bienvenus. Le ${fmt.dateLongue}, de ${fmt.horaires}.`,
    ctaLabel: 'Réserver ma place',
    formKicker: 'Inscription gratuite',
    formTitle: 'Réserver ma place',
    formSuccessTitle: 'Place réservée',
    formSuccessText: event.has_comms
      ? 'Vous recevez votre confirmation par email dans quelques minutes.'
      : 'Votre place est enregistrée. Présentez-vous à l’accueil le jour J.',
  }
}

function jpoCopy(event: EventLandingEvent, fmt: EventDateFormat): LandingCopy {
  const cap = limitedBadge(event)
  const dropIn = durationHours(event) >= 5
  return {
    kind: 'jpo',
    breadcrumb: event.name,
    heroTitle: event.name,
    heroAccent: null,
    chapeaux: [
      'Pas une réunion d’information en ligne. **Une rencontre sur le campus** : l’équipe pédagogique, les salles, les questions que vous n’osez pas poser dans un formulaire.',
      'Vous repartez avec une idée claire des voies d’accès (PASS, LAS, LSPS) et de ce que Diploma Santé propose — ou pas — pour votre profil.',
    ],
    badges: ['Gratuit', 'Ouvert aux parents', cap || (dropIn ? `${fmt.horaires}` : null)].filter(
      Boolean,
    ) as string[],
    whyTitle: 'Ce que vous voyez',
    whyAccent: 'sur place, pas sur une plaquette',
    whyLead: 'Les sites se ressemblent. Une heure sur le campus, non.',
    avantages: [
      {
        title: 'Le campus tel qu’il est',
        text: 'Les salles de cours, les espaces de travail, le rythme d’une journée Diploma. Mieux qu’une visite virtuelle : vous voyez comment on travaille ici.',
      },
      {
        title: 'Des réponses précises',
        text: 'PASS, LAS, LSPS, réforme 2027, Parcoursup, financement : les questions se posent à quelqu’un qui connaît les facultés franciliennes, pas à une FAQ générique.',
      },
      {
        title: 'Un échange, pas un entretien',
        text: 'Ce n’est pas un oral d’admission. Vous venez vous renseigner. Les parents sont les bienvenus pour le même échange.',
      },
    ],
    derouleTitle: dropIn ? 'Comment se passe' : 'Le déroulé de',
    derouleAccent: dropIn ? 'la visite' : 'la journée',
    derouleLead: dropIn
      ? `Vous venez quand vous voulez entre ${fmt.horaires}. Comptez 45 minutes à 1h30 sur place.`
      : `Accueil à ${fmt.timeStart}, fin vers ${fmt.timeEnd || 'la fin de matinée'}.`,
    deroule: dropIn
      ? [
          {
            time: fmt.horaires,
            title: 'Accueil toute la journée',
            text: 'Vous arrivez, on vous oriente. Pas de créneau imposé : l’équipe est là de l’ouverture à la fermeture.',
          },
          {
            time: 'Sur place',
            title: 'Présentation des prépas',
            text: 'Lycée, PASS, LAS, LSPS, PAES FR/EU : quel parcours pour quel profil, et ce qui change avec la réforme 2027.',
          },
          {
            time: 'Selon votre arrivée',
            title: 'Échange individuel',
            text: 'Classe actuelle, faculté visée, questions de financement. Un membre de l’équipe prend le temps.',
          },
          {
            time: 'Avant de partir',
            title: 'Visite du campus',
            text: 'Salles, amphis, espaces de travail. Vous voyez le cadre dans lequel les étudiants révisent.',
          },
        ]
      : [
          {
            time: fmt.timeStart,
            title: 'Accueil',
            text: 'Café, badge, et un point sur le déroulement de la visite.',
          },
          {
            time: 'Ensuite',
            title: 'Présentation des prépas',
            text: 'Les voies d’accès et ce que Diploma Santé propose pour chacune.',
          },
          {
            time: 'Puis',
            title: 'Visite et questions',
            text: 'Campus, méthode, et le temps des questions — y compris celles des parents.',
          },
        ],
    aPrevoir: [
      dropIn ? `Venir entre ${fmt.horaires}, sans créneau imposé` : 'Prévoir 1 h à 1 h 30 sur place',
      'Les parents sont les bienvenus',
      'Rien à apporter',
      'L’inscription permet d’anticiper l’accueil',
    ],
    temoinsTitle: 'Ils sont passés',
    temoinsAccent: 'par Diploma',
    temoinsLead: 'Et ils ont été admis en études de santé.',
    temoins: TEMOINS_BRAND,
    tarif: 'Gratuit\nInscription recommandée',
    acces: campusAccess(event.location),
    faq: [
      {
        q: 'C’est vraiment gratuit ?',
        a: 'Oui. L’inscription sert à organiser l’accueil, pas à facturer quoi que ce soit.',
      },
      {
        q: 'Faut-il déjà avoir décidé de faire médecine ?',
        a: 'Non. Beaucoup viennent pour comparer PASS, LAS et LSPS, ou pour savoir si une prépa a un sens pour eux.',
      },
      {
        q: 'Mes parents peuvent-ils venir ?',
        a: 'Oui, c’est même souvent plus utile. Les questions de financement et d’organisation se posent mieux à deux.',
      },
      {
        q: 'Combien de temps prévoir ?',
        a: dropIn
          ? 'Entre 45 minutes et 1h30, selon les questions. Vous n’êtes pas tenu de rester jusqu’à la fermeture.'
          : 'Environ une heure, davantage si vous voulez visiter le campus en détail.',
      },
      {
        q: 'Est-ce un entretien d’admission ?',
        a: 'Non. Vous venez vous renseigner. Une candidature, si vous le souhaitez, se fait ensuite en ligne.',
      },
      {
        q: `Je ne peux pas venir le ${fmt.dateLongue}`,
        a: 'Les autres dates sont sur diploma-sante.fr/evenements. Vous pouvez aussi nous appeler au 01 76 41 01 73.',
      },
    ],
    ctaKicker: '',
    ctaTitle: 'Venez poser vos questions',
    ctaAccent: 'sur place',
    ctaLead: `Gratuit, parents bienvenus. ${fmt.dateLongue}, ${fmt.horaires}.`,
    ctaLabel: 'Réserver ma place',
    formKicker: 'Inscription gratuite',
    formTitle: 'Réserver ma visite',
    formSuccessTitle: 'Inscription enregistrée',
    formSuccessText: event.has_comms
      ? 'Vous recevez votre confirmation par email dans quelques minutes.'
      : 'Votre inscription est enregistrée. Présentez-vous à l’accueil aux horaires indiqués.',
  }
}

function salonCopy(event: EventLandingEvent, fmt: EventDateFormat): LandingCopy {
  const cap = limitedBadge(event)
  const lieu = prettyLocation(event.location) || 'le salon'
  return {
    kind: 'salon',
    breadcrumb: event.name,
    heroTitle: event.name,
    heroAccent: null,
    chapeaux: [
      `Retrouvez l’équipe Diploma Santé sur le stand. **Un échange de dix à vingt minutes** pour situer PASS, LAS et LSPS, et voir si une prépa a un sens pour votre profil.`,
      'Pas de conférence à suivre de bout en bout : vous venez quand vous voulez pendant les horaires du salon.',
    ],
    badges: ['Gratuit', 'Sans rendez-vous', cap].filter(Boolean) as string[],
    whyTitle: 'Pourquoi passer',
    whyAccent: 'sur le stand',
    whyLead: 'Les salons d’orientation accumulent les stands. Celui-ci sert à trancher des questions précises.',
    avantages: [
      {
        title: 'Les voies d’accès, clairement',
        text: 'PASS, LAS, LSPS, réforme 2027 : ce qui change pour un dossier Parcoursup, sans le jargon des plaquettes.',
      },
      {
        title: 'Un avis sur votre profil',
        text: 'Classe, spécialités, faculté visée. On vous dit ce qui est réaliste — y compris si Diploma n’est pas le bon cadre.',
      },
      {
        title: 'Les questions que vous n’écrivez pas',
        text: 'Rythme, charge de travail, financement, différence avec une prépa en ligne. Ça se dit plus vite en face à face.',
      },
    ],
    derouleTitle: 'Sur le stand,',
    derouleAccent: 'sans créneau',
    derouleLead: `Le stand est ouvert ${fmt.horaires}. Vous vous présentez, on vous reçoit.`,
    deroule: [
      {
        time: 'À l’arrivée',
        title: 'Accueil',
        text: 'Vous dites où vous en êtes (classe, projet, faculté). Deux minutes pour cadrer l’échange.',
      },
      {
        time: '10 à 20 min',
        title: 'Échange',
        text: 'Voies d’accès, méthode Diploma, questions des parents s’ils sont là.',
      },
      {
        time: 'Avant de partir',
        title: 'La suite, si vous voulez',
        text: 'Une brochure, un lien de candidature, ou simplement les idées plus claires. Rien n’est obligatoire.',
      },
    ],
    aPrevoir: [
      `Venir pendant les horaires du salon (${fmt.horaires})`,
      'Les parents sont les bienvenus',
      'Aucun document à apporter',
      'L’inscription nous aide à anticiper l’affluence',
    ],
    temoinsTitle: 'Ils ont choisi',
    temoinsAccent: 'Diploma Santé',
    temoinsLead: 'Et ils ont été admis en études de santé.',
    temoins: TEMOINS_BRAND,
    tarif: 'Gratuit\nInscription recommandée',
    acces: lieu,
    faq: [
      {
        q: 'C’est vraiment gratuit ?',
        a: 'Oui. L’inscription ne crée aucun tarif ni aucun engagement.',
      },
      {
        q: 'Faut-il un rendez-vous ?',
        a: 'Non. Vous venez pendant les horaires du salon. L’inscription nous permet d’anticiper le flux.',
      },
      {
        q: 'Mes parents peuvent-ils venir ?',
        a: 'Oui. Beaucoup d’échanges se font à trois, surtout sur le financement et le rythme de l’année.',
      },
      {
        q: 'Combien de temps ça dure ?',
        a: 'Dix à vingt minutes, davantage si vous avez beaucoup de questions.',
      },
      {
        q: 'Est-ce un entretien d’admission ?',
        a: 'Non. C’est un stand d’orientation. La candidature, si vous la faites, se fait ensuite en ligne.',
      },
      {
        q: `Je ne peux pas venir le ${fmt.dateLongue}`,
        a: 'Les autres dates sont sur diploma-sante.fr/evenements, ou par téléphone au 01 76 41 01 73.',
      },
    ],
    ctaKicker: '',
    ctaTitle: 'Passez nous voir',
    ctaAccent: 'sur le stand',
    ctaLead: `Gratuit, sans rendez-vous. ${fmt.dateLongue}, ${fmt.horaires} — ${lieu}.`,
    ctaLabel: 'Je m’inscris',
    formKicker: 'Inscription gratuite',
    formTitle: 'Prévenir de ma venue',
    formSuccessTitle: 'Inscription enregistrée',
    formSuccessText: 'Rendez-vous sur le stand aux horaires du salon. Aucun créneau à respecter.',
  }
}

function webinaireCopy(event: EventLandingEvent, fmt: EventDateFormat): LandingCopy {
  const cap = limitedBadge(event)
  return {
    kind: 'webinaire',
    breadcrumb: event.name,
    heroTitle: event.name,
    heroAccent: null,
    chapeaux: [
      'En direct, depuis chez vous. **Le lien de connexion est envoyé après inscription** — il n’est pas publié ici.',
      'Un temps pour comprendre les voies d’accès, poser vos questions, et repartir avec une idée claire — pas un replay de présentation commerciale.',
    ],
    badges: ['En ligne', 'Gratuit', cap || `Durée ${fmt.horaires}`].filter(Boolean) as string[],
    whyTitle: 'Ce que vous emportez',
    whyAccent: 'de cette session',
    whyLead: 'Une heure pour poser les questions que les pages web ne tranchent pas.',
    avantages: [
      {
        title: 'Les voies d’accès',
        text: 'PASS, LAS, LSPS et ce que change la réforme 2027 pour un dossier Parcoursup. Sans jargon, avec des exemples de facultés franciliennes.',
      },
      {
        title: 'Le rythme réel',
        text: 'Ce que demande une première année, ce qu’une prépa change, et ce qu’elle ne change pas. Pour décider, pas pour « se rassurer ».',
      },
      {
        title: 'Vos questions en direct',
        text: 'Classe, spécialités, faculté, reconversion : vous posez la vôtre. Les parents peuvent suivre la session.',
      },
    ],
    derouleTitle: 'Le déroulé du',
    derouleAccent: 'webinaire',
    derouleLead: `${fmt.dateLongue}, ${fmt.horaires}. Connexion 10 minutes avant.`,
    deroule: [
      {
        time: fmt.timeStart,
        title: 'Ouverture',
        text: 'Le cadre de la session, et ce que vous pouvez en attendre — y compris ce que nous ne promettons pas.',
      },
      {
        time: 'Ensuite',
        title: 'Le fond',
        text: 'Voies d’accès, méthode, questions fréquentes. Un vrai cours d’orientation, pas une enfilade de slides.',
      },
      {
        time: fmt.timeEnd || 'Fin',
        title: 'Questions',
        text: 'Le temps est gardé pour vos questions, y compris celles que vous n’auriez pas posées dans un chat anonyme.',
      },
    ],
    aPrevoir: [
      'Un ordinateur ou un téléphone, et une connexion stable',
      'Le lien Zoom arrive par email après inscription',
      'Se connecter 10 minutes en avance',
      'Les parents peuvent suivre la session',
    ],
    temoinsTitle: 'Ils ont suivi',
    temoinsAccent: 'Diploma Santé',
    temoinsLead: 'Et ils ont été admis en études de santé.',
    temoins: TEMOINS_BRAND,
    tarif: 'Gratuit\nInscription obligatoire',
    acces: 'En ligne — lien envoyé après inscription',
    faq: [
      {
        q: 'C’est vraiment gratuit ?',
        a: 'Oui. L’inscription sert à vous envoyer le lien de connexion, pas à ouvrir un tarif.',
      },
      {
        q: 'Où est le lien Zoom ?',
        a: 'Il n’est pas public. Il part par email après inscription, avec un rappel avant la session.',
      },
      {
        q: 'Mes parents peuvent-ils suivre ?',
        a: 'Oui. Un seul lien suffit pour le foyer.',
      },
      {
        q: 'Faut-il déjà avoir décidé de faire médecine ?',
        a: 'Non. La session est faite pour ceux qui tranchent encore entre les voies, ou qui se demandent si une prépa est utile.',
      },
      {
        q: 'Y a-t-il un replay ?',
        a: 'La session est conçue pour le direct, notamment les questions. Inscrivez-vous pour recevoir le lien le jour J.',
      },
      {
        q: `Je ne suis pas libre le ${fmt.dateLongue}`,
        a: 'Les autres dates sont sur diploma-sante.fr/evenements, ou par téléphone au 01 76 41 01 73.',
      },
    ],
    ctaKicker: '',
    ctaTitle: 'Inscrivez-vous pour',
    ctaAccent: 'recevoir le lien',
    ctaLead: `Gratuit, en ligne. ${fmt.dateLongue}, ${fmt.horaires}.`,
    ctaLabel: 'Je m’inscris',
    formKicker: 'Inscription gratuite',
    formTitle: 'Recevoir le lien',
    formSuccessTitle: 'Inscription enregistrée',
    formSuccessText: event.has_comms
      ? 'Le lien de connexion vous est envoyé par email, avec un rappel avant la session.'
      : 'Votre inscription est enregistrée. Le lien de connexion vous sera communiqué avant la session.',
  }
}

export function buildLandingCopy(
  kind: LandingKind,
  event: EventLandingEvent,
  fmt: EventDateFormat,
): LandingCopy {
  if (kind === 'immersion') return immersionCopy(event, fmt)
  if (kind === 'webinaire') return webinaireCopy(event, fmt)
  if (kind === 'salon') return salonCopy(event, fmt)
  return jpoCopy(event, fmt)
}
