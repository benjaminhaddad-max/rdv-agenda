import type { BrandCharter } from '@/lib/brand-charter'
import { buildBrandStepBody } from '@/lib/marketing/brand-step-bodies'
import { FORM_CTA_PLACEHOLDER } from '@/lib/marketing/last-chance-cta-landings'

export type LastChanceBrand = 'afem' | 'numerus' | 'hermione' | 'prepamedecine'

/** Objet distinct par mail (J1–J20) — évite regroupement Gmail et fatigue objet. */
export const LAST_CHANCE_SUBJECTS: Record<string, string> = {
  J1: 'Tu vises la médecine à Paris en 2026 : la meilleure prépa PASS/LAS est…',
  J2: 'Futur PASS/LAS : quelle prépa choisir pour ta fac avant septembre ?',
  J3: 'Tu vises la médecine en 2026 ? Installe ta méthode avant le PASS/LAS',
  J4: 'Futur PASS/LAS : ton comparatif prépa personnalisé en 24 h (gratuit)',
  J5: 'PASS, LAS ou LSPS : prépa, tutorat ou les deux avant septembre ?',
  J6: "Futur étudiant en médecine : ce que le premier concours blanc t'apprendra",
  J7: 'Futur PASS/LAS : le planning à préparer cet été (pas en septembre)',
  J8: '30 prépas pour futurs PASS/LAS — filtre par ville et budget',
  J9: 'Tu vises la médecine à Paris : 6 facs — ta prépa prépare la bonne ?',
  J10: 'Futur PASS/LAS : ce sera une année de classement (anticipe avant septembre)',
  J11: 'Avant la rentrée médecine : août utile ou août perdu ?',
  J12: 'PASS, LAS ou LSPS : 4 questions avant de choisir ta prépa',
  J13: 'Prépa PASS/LAS Paris : 7 790 € ou 9 200 € — le vrai calcul avant septembre',
  J14: 'Futur PASS/LAS à Paris : 5 erreurs à éviter avant la rentrée',
  J15: 'Tu vas faire médecine : anticiper les oraux avant septembre',
  J16: "Top prépas PASS/LAS 2025 : ce que les avis disent (avant de t'inscrire)",
  J17: 'Futur PASS/LAS : QCM, rédactionnel, oral — ta fac ne joue pas pareil',
  J18: "Tu n'es pas encore en médecine — et c'est ton avantage",
  J19: 'Futur PASS/LAS : un coach avant la rentrée, ça change quoi ?',
  J20: 'Rentrée PASS/LAS 2026 : checklist 7 points + rappel conseiller gratuit',
}

/** @deprecated Utiliser LAST_CHANCE_SUBJECTS — conservé pour compat. */
export const LAST_CHANCE_SUBJECT = LAST_CHANCE_SUBJECTS.J1

/** 6 facultés de médecine en Île-de-France — libellés officiels */
export const PARIS_FACS_LIST =
  'Université Paris Cité, Sorbonne Université, Université Paris-Saclay, Université Paris-Est Créteil, Sorbonne Paris Nord et Université Versailles Saint-Quentin'

/** CTA — lien formulaire marque uniquement */
export const FORM_CTA_HREF = FORM_CTA_PLACEHOLDER

/** Libellé CTA par marque (toujours vers /form de la marque expéditrice) */
export const BRAND_FORM_CTA_LABEL: Record<LastChanceBrand, string> = {
  afem: 'Recevoir des conseils personnalisés en remplissant ce formulaire →',
  numerus: 'Entrer en contact avec un coach PASS/LAS via ce formulaire →',
  hermione: 'Faire le point sur mon orientation en remplissant ce formulaire →',
  prepamedecine: 'Recevoir un comparatif personnalisé en remplissant ce formulaire →',
}

export interface LastChanceStepDef {
  brand: LastChanceBrand
  label: string
  subject: string
  preheader: string
  paragraphs: string[]
  ctaLabel: string
}

export function buildLastChanceStepBody(def: LastChanceStepDef, charter: BrandCharter): string {
  return buildBrandStepBody(
    { ...def, ctaLabel: BRAND_FORM_CTA_LABEL[def.brand] },
    charter,
  )
}

export const LAST_CHANCE_MEDECINE_STEPS: LastChanceStepDef[] = [
  {
    brand: 'afem',
    label: 'J1',
    subject: LAST_CHANCE_SUBJECTS.J1,
    preheader: 'Comparatif des prépas parisiennes — PASS/LAS 2026.',
    paragraphs: [
      'Tu as ta place en PASS/LAS pour septembre — la vraie question, c\'est <strong>quelle prépa choisir à Paris</strong>. Parmi les quelques <strong>prépas parisiennes</strong> du marché, <strong>Diploma Santé</strong> revient souvent dans les comparatifs pour les facs d\'Île-de-France.',
      'Il n\'existe pas une prépa « meilleure » pour tout le monde : tout dépend de <strong>ta fac</strong> (' + PARIS_FACS_LIST + '), de ton budget et de ton besoin de cadre.',
      'L\'AFEM recense les offres <strong>Paris & IDF</strong> : tarifs, couverture par fac, PASS/LAS, retours d\'étudiants — pour comparer avant de signer.',
      'Que tu envisages une prépa complète, un tutorat ou l\'autonomie, l\'important est de comparer <strong>avant de signer</strong> — ou de valider que ton choix actuel tient la route.',
      'Dis-nous en 2 minutes où tu en es : prépa déjà choisie, en réflexion, ou pas encore de prépa.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.afem,
  },
  {
    brand: 'numerus',
    label: 'J2',
    subject: LAST_CHANCE_SUBJECTS.J2,
    preheader: 'QCM, suivi, colles — quelle prépa pour ta fac parisienne ?',
    paragraphs: [
      'Tu as ta place en PASS/LAS pour septembre — la question qui revient : <strong>quelle prépa choisir à Paris</strong> ? Volume de QCM, suivi individuel, colles, présentiel ou hybride : les <strong>prépas parisiennes</strong> ne se valent pas toutes selon <strong>ta fac</strong> et ton profil.',
      'Il n\'y a pas une prépa « meilleure » pour tout le monde. Tout dépend du barème de ta fac (' + PARIS_FACS_LIST + '), de ton budget et de ton besoin de cadre.',
      '<strong>Numerus Club</strong> te met en relation avec des étudiants ayant réussi le concours dans une fac parisienne — pour comparer les options et éviter un mauvais choix de prépa.',
      'Indique ta fac, ton cursus (PASS/LAS) et si tu as déjà une prépa — ou si tu hésites encore.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.numerus,
  },
  {
    brand: 'hermione',
    label: 'J3',
    subject: LAST_CHANCE_SUBJECTS.J3,
    preheader: 'Méthode de travail — quelle prépa t\'accompagne vraiment ?',
    paragraphs: [
      'En PASS/LAS à Paris, le volume de cours explose dès la première semaine. <strong>La méthode</strong> — fiches, annales, reprises espacées — fait souvent plus que le nombre d\'heures de cours.',
      'Les <strong>prépas parisiennes</strong> n\'intègrent pas toutes la méthode pareil : colles et gros effectifs d\'un côté, suivi rapproché de l\'autre — à toi de voir ce qui colle à ton profil.',
      '<strong>Club Hermione</strong> complète souvent une prépa (ou un parcours solo) avec planning hebdomadaire, mémorisation et gestion du stress — particulièrement utile en fac parisienne où le classement compte.',
      'Précise en 2 minutes si tu as déjà une prépa — et laquelle, si c\'est le cas.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.hermione,
  },
  {
    brand: 'prepamedecine',
    label: 'J4',
    subject: LAST_CHANCE_SUBJECTS.J4,
    preheader: 'Comparatif prépas Paris — conseil indépendant.',
    paragraphs: [
      'À Paris, le marché des <strong>prépas PASS/LAS</strong> se résume à <strong>4 à 5 structures majeures</strong> — dont <strong>Diploma Santé</strong>, régulièrement comparée pour les concours des facs parisiennes.',
      'Les tarifs varient fortement selon les formules. Sans comparatif structuré sur le marché parisien, difficile de trancher.',
      '<strong>PrépaMédecine.fr</strong> croise ton profil (fac visée, budget, autonomie) avec les structures adaptées à <strong>Paris & IDF</strong> — sans vendre aucune formation.',
      'Un conseiller indépendant peut te rappeler sous 24 h avec une short-list et les fourchettes de prix réelles.',
      'Commence par nous dire si tu as déjà choisi ta prépa.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.prepamedecine,
  },
  {
    brand: 'afem',
    label: 'J5',
    subject: LAST_CHANCE_SUBJECTS.J5,
    preheader: 'Prépa, tutorat ou solo — le marché parisien.',
    paragraphs: [
      'Ta rentrée PASS/LAS est fixée — as-tu tranché entre <strong>prépa classique</strong>, tutorat, colles ou autonomie ? Beaucoup hésitent encore alors que les places partent.',
      'Une prépa annuelle complète à Paris peut représenter plusieurs milliers d\'euros. Un tutorat ciblé ou des colles seules, bien moins — mais ce n\'est pas la même couverture.',
      'L\'erreur classique : payer une prépa complète alors qu\'un accompagnement partiel suffirait — ou l\'inverse.',
      'L\'AFEM t\'aide à arbitrer selon ta fac parisienne, ton budget et ton niveau d\'autonomie.',
      'Indique où tu en es : prépa signée, tutorat seul, ou pas encore décidé.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.afem,
  },
  {
    brand: 'numerus',
    label: 'J6',
    subject: LAST_CHANCE_SUBJECTS.J6,
    preheader: 'Concours blanc & prépa — laquelle prépare ta fac ?',
    paragraphs: [
      'Un <strong>concours blanc</strong> calibré sur les annales de ta fac parisienne donne une photo réaliste de ton niveau — avant de t\'engager dans une prépa.',
      'Les <strong>prépas parisiennes</strong> n\'ont pas toutes les mêmes formats de simulation — à comparer selon <strong>ta fac</strong> (QCM chronométré vs rédactionnel).',
      'Sur <strong>Numerus Club</strong>, des coachs ayant réussi à Paris proposent aussi des simulations avec débrief personnalisé.',
      'Indique ta fac et si tu as déjà une prépa.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.numerus,
  },
  {
    brand: 'hermione',
    label: 'J7',
    subject: LAST_CHANCE_SUBJECTS.J7,
    preheader: 'Planning été + prépa — options Paris & IDF.',
    paragraphs: [
      'Le <strong>planning d\'été</strong> avant une rentrée PASS/LAS à Paris : 3 à 5 sessions par semaine, matières prioritaires selon ta fac, vacances protégées — pas 12 h par jour.',
      'Certaines <strong>prépas parisiennes</strong> fournissent un cadre estival structuré. <strong>Diploma Santé</strong> accompagne par exemple les futurs étudiants dès l\'été sur les matières à fort coefficient.',
      '<strong>Club Hermione</strong> propose une feuille de route type : bio-chimie en priorité, annales de ta fac, reprises espacées — en complément ou en alternative d\'une prépa.',
      'Précise : prépa signée ou encore en réflexion ?',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.hermione,
  },
  {
    brand: 'prepamedecine',
    label: 'J8',
    subject: LAST_CHANCE_SUBJECTS.J8,
    preheader: 'Budget & fac — comparer les prépas à Paris.',
    paragraphs: [
      'Comparer les <strong>prépas parisiennes</strong> selon <strong>ton budget</strong> et <strong>ta fac</strong> — pas parcourir toute la France à l\'aveugle.',
      'Présentiel, hybride, en ligne : les formats et les fourchettes varient selon les structures parisiennes.',
      '<strong>PrépaMédecine.fr</strong> filtre par budget, PASS/LAS et alignement fac — ' + PARIS_FACS_LIST + '.',
      'Précise ta fac et si tu as déjà une prépa : on t\'oriente vers les structures cohérentes.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.prepamedecine,
  },
  {
    brand: 'afem',
    label: 'J9',
    subject: LAST_CHANCE_SUBJECTS.J9,
    preheader: '6 facs parisiennes — ta prépa couvre la bonne ?',
    paragraphs: [
      PARIS_FACS_LIST + ' : <strong>coefficients et épreuves diffèrent</strong>. Ta prépa doit préparer le bon barème — pas un concours « moyen ».',
      'Une prépa très QCM ne suffit pas si ta fac pondère le rédactionnel. Les <strong>prépas parisiennes</strong> n\'ont pas toutes les mêmes spécialités selon la fac visée.',
      'Notre comparatif AFEM indique quelles structures couvrent quelles facs, avec tarifs et retours d\'étudiants.',
      'Si tu as déjà signé, vérifie que ton contrat est aligné. Si tu hésites, évite une prépa mal calibrée.',
      'Indique ta fac parisienne et ta prépa actuelle — ou dis-nous que tu n\'as pas encore choisi.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.afem,
  },
  {
    brand: 'numerus',
    label: 'J10',
    subject: LAST_CHANCE_SUBJECTS.J10,
    preheader: 'Classement parisien — quelle prépa t\'y prépare ?',
    paragraphs: [
      'En PASS/LAS dans une <strong>fac parisienne</strong>, c\'est une année de <strong>classement</strong>. Chaque point compte ; la régularité bat le sprint de dernière minute.',
      'Les <strong>prépas parisiennes</strong> ne préparent pas toutes au même rythme. <strong>Diploma Santé</strong> insiste par exemple sur le suivi continu et les bilans ; d\'autres structures misent sur le volume ou les colles.',
      '<strong>Numerus Club</strong> te met en contact avec des étudiants ayant vécu le concours à Paris — retours concrets sur ce qui a marché (prépa ou non).',
      'Précise : prépa choisie, en cours de réflexion, ou aucune pour l\'instant ?',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.numerus,
  },
  {
    brand: 'hermione',
    label: 'J11',
    subject: LAST_CHANCE_SUBJECTS.J11,
    preheader: 'Été utile — prépa ou plan solo ?',
    paragraphs: [
      'Août avant une rentrée PASS/LAS à Paris : ni tout arrêter, ni s\'épuiser. <strong>3 à 5 sessions par semaine</strong>, matières ciblées, vacances protégées.',
      'Certaines <strong>prépas parisiennes</strong> proposent des stages estivaux ; tu peux aussi combiner une prépa légère avec un coaching méthode <strong>Hermione</strong> — planning, mémorisation, gestion du stress.',
      'L\'été devient un investissement mesuré quand tu sais déjà quelle fac tu vises et quel niveau de cadre tu veux.',
      'Précise : prépa signée, en réflexion, ou autonomie assumée.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.hermione,
  },
  {
    brand: 'prepamedecine',
    label: 'J12',
    subject: LAST_CHANCE_SUBJECTS.J12,
    preheader: '4 questions avant de signer une prépa à Paris.',
    paragraphs: [
      'Avant de signer une prépa à Paris, <strong>4 questions</strong> évitent la plupart des mauvais choix :<br><strong>1.</strong> Quelle fac parisienne ?<br><strong>2.</strong> Quel budget total ?<br><strong>3.</strong> Cadre ou autonomie ?<br><strong>4.</strong> Prépa seule ou combo tutorat / colles ?',
      'Sans réponses claires, difficile de savoir quelle <strong>prépa parisienne</strong> te correspond vraiment.',
      '<strong>PrépaMédecine.fr</strong> structure ces réponses en 15 minutes — gratuit, indépendant, spécialiste <strong>Paris & IDF</strong>.',
      'Tu repars avec une short-list cohérente pour le concours parisien.',
      'Commence par nous dire si tu as déjà une prépa en tête ou signée.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.prepamedecine,
  },
  {
    brand: 'afem',
    label: 'J13',
    subject: LAST_CHANCE_SUBJECTS.J13,
    preheader: 'Tarifs affichés vs coût réel des prépas à Paris.',
    paragraphs: [
      'Les prix affichés des prépas parisiennes incluent rarement tout : options, stages, colles et frais annexes peuvent s\'ajouter.',
      'Les <strong>prépas parisiennes</strong> n\'ont pas toutes la même grille tarifaire. La bonne question — <strong>combien coûte une heure utile</strong> de préparation pour TA fac, avec suivi réel.',
      'Notre comparatif AFEM détaille les fourchettes par structure pour ' + PARIS_FACS_LIST + '.',
      'Si tu as déjà signé, vérifie que tu n\'as pas surpayé. Si tu hésites, compare avant que les places partent.',
      'Indique si ta prépa est déjà signée — ou si tu es encore en comparaison.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.afem,
  },
  {
    brand: 'numerus',
    label: 'J14',
    subject: LAST_CHANCE_SUBJECTS.J14,
    preheader: '5 erreurs avant la rentrée — et le choix de prépa.',
    paragraphs: [
      'Les <strong>5 erreurs classiques</strong> des futurs PASS/LAS parisiens :<br><strong>1.</strong> Choisir sa prépa avant sa fac.<br><strong>2.</strong> Négliger les annales de SA fac.<br><strong>3.</strong> Travailler sans planning.<br><strong>4.</strong> S\'isoler.<br><strong>5.</strong> Attendre le premier partiel pour juger son niveau.',
      'Erreur n°1 : signer dans une <strong>prépa parisienne</strong> sans avoir validé l\'alignement avec ta fac.',
      'Des coachs <strong>Numerus</strong>, passés par le concours à Paris, partagent comment ils ont évité ces pièges.',
      'Un échange peut te faire gagner des mois d\'essais-erreurs.',
      'Précise ta fac et si tu as déjà une prépa.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.numerus,
  },
  {
    brand: 'hermione',
    label: 'J15',
    subject: LAST_CHANCE_SUBJECTS.J15,
    preheader: 'Oraux & rédactionnel — quelle prépa pour ta fac ?',
    paragraphs: [
      'Sur plusieurs <strong>facs parisiennes</strong>, oraux et rédactionnel font la différence — pas seulement le QCM.',
      'Les <strong>prépas parisiennes</strong> ne pondèrent pas toutes ces épreuves pareil — à vérifier selon le barème de <strong>ta fac</strong> avant de signer.',
      '<strong>Hermione</strong> propose des simulations d\'oraux adaptées au concours médecine à Paris — en complément d\'une prépa ou en parcours ciblé.',
      'Précise ta fac et si ta prépa actuelle (ou celle que tu envisages) couvre les oraux.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.hermione,
  },
  {
    brand: 'prepamedecine',
    label: 'J16',
    subject: LAST_CHANCE_SUBJECTS.J16,
    preheader: 'Avis sur les prépas parisiennes — 2026.',
    paragraphs: [
      'Avant de t\'engager financièrement, tu veux des <strong>avis structurés</strong> sur les prépas PASS/LAS à Paris — pas seulement des notes Google.',
      '<strong>Diploma Santé</strong> revient dans certains retours étudiants sur le marché des <strong>prépas parisiennes</strong> — selon le profil et la fac visée.',
      '<strong>PrépaMédecine.fr</strong> croise avis vérifiés, critères objectifs (heures, effectifs, alignement fac) et conseils indépendants.',
      'Les bonnes questions en entretien de prépa révèlent la vraie qualité pour le concours parisien.',
      'Dis-nous quelle prépa tu envisages — ou si tu n\'as pas encore choisi.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.prepamedecine,
  },
  {
    brand: 'afem',
    label: 'J17',
    subject: LAST_CHANCE_SUBJECTS.J17,
    preheader: 'QCM, rédactionnel, oral — les prépas par fac.',
    paragraphs: [
      'QCM, rédactionnel, oral : <strong>ta fac parisienne ne joue pas pareil</strong>. Ta prépa doit préparer ces épreuves — pas une méthode générique.',
      'Université Paris Cité, Sorbonne Université, Université Paris-Saclay : profils d\'épreuves différents. Les <strong>prépas parisiennes</strong> n\'ont pas toutes les mêmes points forts — à croiser avec ton barème.',
      'Notre comparatif AFEM indique quelles structures sont alignées avec chaque fac.',
      'Si tu es déjà inscrit, c\'est le moment de vérifier que ton accompagnement colle à ton barème.',
      'Précise ta fac et ta prépa — ou indique que tu n\'as pas encore tranché.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.afem,
  },
  {
    brand: 'numerus',
    label: 'J18',
    subject: LAST_CHANCE_SUBJECTS.J18,
    preheader: 'Été — comparer les prépas avant de s\'engager.',
    paragraphs: [
      'Tu n\'es pas encore en médecine : c\'est le moment de <strong>construire la bonne méthode</strong> — et de valider ta prépa avant de t\'engager.',
      'Le marché des <strong>prépas parisiennes</strong> se limite à quelques structures majeures — à comparer selon ta fac et ton budget.',
      '<strong>Numerus Club</strong> connecte futurs PASS/LAS d\'IDF et coachs ayant réussi dans les facs parisiennes (' + PARIS_FACS_LIST + ').',
      'Mise en relation pour démarrer — tu profites de l\'expérience parisienne avant de signer.',
      'Indique ta fac visée et si tu as déjà une prépa.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.numerus,
  },
  {
    brand: 'hermione',
    label: 'J19',
    subject: LAST_CHANCE_SUBJECTS.J19,
    preheader: 'Coach + prépa — Hermione ou prépa classique ?',
    paragraphs: [
      'Un <strong>coach avant la rentrée PASS/LAS à Paris</strong> complète souvent une prépa — ou remplace une partie du cadre si tu es autonome.',
      '<strong>Diploma Santé</strong> ou une <strong>prépa parisienne</strong> classique offrent un encadrement structuré ; <strong>Hermione</strong> peut ajouter méthode, planning et gestion du stress selon ta fac.',
      'L\'enjeu : ne pas payer deux fois pour la même chose, ni rester sans cadre.',
      'Hermione propose un premier échange pour les futurs PASS/LAS d\'Île-de-France : objectifs d\'été, fac visée, complémentarité avec ta prépa.',
      'Précise si tu as déjà signé une prépa — et laquelle, le cas échéant.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.hermione,
  },
  {
    brand: 'prepamedecine',
    label: 'J20',
    subject: LAST_CHANCE_SUBJECTS.J20,
    preheader: 'Checklist rentrée — prépa validée ?',
    paragraphs: [
      'Rentrée <strong>PASS/LAS Paris 2026</strong> : <strong>7 points</strong> à valider — ① Fac parisienne. ② Prépa choisie ou autonomie. ③ Planning été. ④ Matériel. ⑤ Annales de ta fac. ⑥ Réseau. ⑦ Santé.',
      'Si le point ② manque, chaque semaine compte. Les <strong>prépas parisiennes</strong> remplissent vite leurs promos avant la rentrée.',
      'Un conseiller <strong>PrépaMédecine</strong> fait le point en 15 minutes : gratuit, indépendant, spécialiste <strong>prépas Paris & IDF</strong>.',
      'C\'est le moment de verrouiller tes choix avant le choc de septembre.',
      'Précise si ta prépa est validée — ou si tu hésites encore.',
    ],
    ctaLabel: BRAND_FORM_CTA_LABEL.prepamedecine,
  },
]
