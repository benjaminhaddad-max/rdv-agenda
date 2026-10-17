/**
 * Règles Edumove affichées dans l'onglet Edumove du CRM (Règles des facs,
 * Automatisations). Relevé fidèle du code de la plateforme
 * candidature.edumove.fr (repo edumove-plateforme : espace.html,
 * candidature.html, status-engine.js, api/*) et du CRM, au 17/10/2026.
 *
 * Quand une règle change sur la plateforme, la changer ici aussi. Les points
 * « à trancher » sont des incohérences trouvées dans le code.
 */

export type FacRule = {
  key: 'LINK' | 'UCJC' | 'UE' | 'PASS_LAS'
  name: string
  city: string
  language: string
  admission: string
  contacts: string[]
  prices: { filiere: string; price: string; note?: string }[]
  eligibility: string[]
  steps: { value: string; label: string; detail: string }[]
  documents: { required: string[]; optional: string[]; afterAcceptance: string[] }
  dates: string[]
  warnings: string[]
}

export const EDUMOVE_FAC_RULES: FacRule[] = [
  {
    key: 'LINK',
    name: 'LINK Campus University',
    city: 'Rome (Italie)',
    language: 'Cours en italien · aucun prérequis de langue',
    admission: 'Test d’entrée (Médecine, Dentaire, Kiné) : QCM en français, 80 questions (bio ~18, chimie ~12, maths ~20, physique ~18, culture générale ~12), +1,5 / −0,4. Frais de test 200 € non remboursables. Pharmacie : admission sur dossier, sans test.',
    contacts: ['d.elfadli@unilink.it'],
    prices: [
      { filiere: 'Médecine', price: '19 800 €', note: '6 ans' },
      { filiere: 'Dentaire', price: '19 800 €', note: '6 ans' },
      { filiere: 'Kiné', price: '11 900 €', note: '3 ans' },
      { filiere: 'Pharmacie', price: '7 900 €', note: '5 ans' },
    ],
    eligibility: ['Toutes les filières sauf Vétérinaire.'],
    steps: [
      { value: 'en_attente', label: 'En attente', detail: 'Choix fait par le candidat, dossier pas encore envoyé.' },
      { value: 'dossier_envoye', label: 'Dossier envoyé', detail: 'Dossier transmis à LINK.' },
      { value: 'test_paye', label: 'Test payé', detail: 'Frais de test de 200 € réglés (pas pour Pharmacie).' },
      { value: 'test_passe', label: 'Test passé', detail: 'Test d’entrée passé (pas pour Pharmacie).' },
      { value: 'accepte', label: 'Accepté', detail: 'Admission confirmée par LINK.' },
      { value: 'inscrit', label: 'Inscrit', detail: 'Inscription finalisée : le dossier passe en « Accepté ».' },
    ],
    documents: {
      required: ['Formulaire de pré-candidature LINK (PDF à télécharger, rempli à la main)', 'Carte d’identité ou passeport'],
      optional: ['Relevé de notes du bac'],
      afterAcceptance: ['Diplôme', 'Photo', 'Certificat médical', 'Dichiarazione di Valore (2 à 4 semaines)'],
    },
    dates: ['Dernier test annoncé : 25 juin 2026 à Paris'],
    warnings: [
      'Date du test dépassée : la plateforme annonce encore le 25 juin 2026 (et « 15 avril » ailleurs). Dates de la rentrée 2027 à fixer.',
    ],
  },
  {
    key: 'UCJC',
    name: 'Universidad Camilo José Cela',
    city: 'Madrid (Espagne)',
    language: 'Cours en espagnol',
    admission: 'Entretien vidéo d’environ 15 min avec la direction : en espagnol (B1/B2) pour Médecine et Dentaire, en français pour les autres filières. Résultat sous 1 semaine, puis 1 semaine pour payer (sinon liste d’attente). Homologation du diplôme obligatoire.',
    contacts: ['eva.munoza@ucjc.edu', 'antonio.carrera@ucjc.edu'],
    prices: [
      { filiere: 'Médecine', price: '19 920 €', note: 'COMPLET' },
      { filiere: 'Dentaire', price: '18 420 €', note: '5 ans' },
      { filiere: 'Pharmacie', price: '10 140 €', note: '5 ans' },
      { filiere: 'Kiné', price: '9 420 €', note: '4 ans' },
    ],
    eligibility: ['Pas de Vétérinaire.', 'Médecine fermée (« plus de places »).', 'Dentaire : au moins 2 spécialités scientifiques.'],
    steps: [
      { value: 'en_attente', label: 'En attente', detail: 'Choix fait, dossier pas encore envoyé.' },
      { value: 'dossier_envoye', label: 'Dossier envoyé', detail: 'Dossier transmis à l’UCJC.' },
      { value: 'entretien_planifie', label: 'Entretien planifié', detail: 'Créneau de 15 min fixé.' },
      { value: 'entretien_passe', label: 'Entretien passé', detail: 'Résultat sous 1 semaine.' },
      { value: 'accepte', label: 'Accepté', detail: '1 semaine pour payer.' },
      { value: 'inscrit', label: 'Inscrit', detail: 'Inscription finalisée : le dossier passe en « Accepté ».' },
    ],
    documents: {
      required: ['Lettre de motivation (en espagnol)', 'Carte d’identité ou passeport', 'Formulaire d’admission UCJC (PDF à télécharger)'],
      optional: ['Attestation d’espagnol (même un certificat e-learning non officiel est apprécié)', 'Relevé du bac'],
      afterAcceptance: ['Homologation du diplôme'],
    },
    dates: ['Pas de session fixe : entretiens au fil de l’eau.'],
    warnings: [],
  },
  {
    key: 'UE',
    name: 'Universidad Europea',
    city: 'Madrid, Malaga, Valence, Alicante, Canaries (Espagne)',
    language: 'Espagnol (Médecine, Pharmacie, Véto) ; espagnol + anglais (Dentaire, sauf Canaries) ; Kiné Madrid aussi en français ; Prépa dentaire en anglais. Canaries : espagnol B2 exigé.',
    admission: 'Tests de sélection (langue, aptitudes, motivation, matière) pour Médecine, Dentaire, Véto et Kiné en français à Madrid ; les autres sont « hors PE ». Résultat sous 48 h, puis acompte de 2 500 € sous 2 jours.',
    contacts: ['jessica.simi@universidadeuropea.es'],
    prices: [
      { filiere: 'Médecine', price: 'Madrid 21 480 € · Canaries 18 900 €', note: '6 ans' },
      { filiere: 'Dentaire', price: 'Madrid 20 820 € · Malaga 19 200 € · Valence/Alicante 20 821 € · Canaries 16 900 €', note: '5 ans' },
      { filiere: 'Kiné', price: 'Madrid/Malaga 10 020 € · Valence/Alicante 10 080 € · Canaries 9 780 €', note: '4 ans' },
      { filiere: 'Pharmacie', price: 'Madrid 12 120 €', note: '5 ans' },
      { filiere: 'Vétérinaire', price: 'Madrid 19 500 €', note: '5 ans' },
      { filiere: 'Prépa dentaire', price: 'Alicante 17 000 €', note: '1 an, puis Dentaire 5 ans à 20 821 €' },
    ],
    eligibility: [
      'Médecine, Dentaire, Véto : au moins 2 spécialités scientifiques.',
      'Moyenne des spécialités scientifiques (Première + T1 de Terminale) : Médecine ≥ 16, Dentaire ≥ 15, Véto ≥ 14, Kiné ≥ 13, Pharmacie sans seuil.',
      'Places : tableau « complet / liste d’attente » tenu par l’équipe (ue_availability).',
    ],
    steps: [
      { value: 'en_attente', label: 'En attente', detail: 'Choix fait (ville + langue), dossier pas encore envoyé.' },
      { value: 'dossier_envoye', label: 'Dossier envoyé', detail: 'Dossier transmis à l’UE. Passer le voyant « remplissage » au vert prévient l’UE par mail.' },
      { value: 'tests_passes', label: 'Tests passés', detail: 'Résultat sous 48 h.' },
      { value: 'accepte', label: 'Accepté', detail: 'Acompte de 2 500 € à verser sous 2 jours.' },
      { value: 'acompte_verse', label: 'Acompte versé', detail: '2 500 € reçus.' },
      { value: 'inscrit', label: 'Inscrit', detail: 'Inscription finalisée : le dossier passe en « Accepté ».' },
    ],
    documents: {
      required: ['3 bulletins de Première fusionnés en un seul PDF', 'Carte d’identité ou passeport', 'Rapport technique académique (60 €, hostudents.com) — ou case « démarche lancée » cochée'],
      optional: [],
      afterAcceptance: ['Bac', 'Relevé de notes', 'Photo', 'Certificat médical', 'Attestation B2'],
    },
    dates: [
      'Tests Médecine : 19/02, 22/04, 21/05, 08/07/2026',
      'Tests Dentaire, Kiné, Véto : 14/01, 10/02, 10/03, 21/04, 12/05, 11/06, 21/07/2026',
    ],
    warnings: [
      'Sessions de tests dépassées : la plateforme affiche encore le calendrier 2025-2026 (dernière session le 21/07/2026). Calendrier de la rentrée 2027 à saisir.',
      'Prépa dentaire : le texte annonce l’anglais B2, mais le code accepte dès B1. À trancher.',
    ],
  },
  {
    key: 'PASS_LAS',
    name: 'PASS / LAS',
    city: 'France',
    language: 'Français',
    admission: 'Simple préférence de classement dans la candidature : aucune règle ni suivi côté Edumove.',
    contacts: [],
    prices: [],
    eligibility: ['Aucune règle sur la plateforme.'],
    steps: [],
    documents: { required: [], optional: [], afterAcceptance: [] },
    dates: [],
    warnings: [],
  },
]

/** Orientation calculée au dépôt de la candidature (candidature.html, orient()). */
export const EDUMOVE_ORIENTATION_RULES: string[] = [
  'Score = moyenne de Terminale (T1/T2) si renseignée, sinon moyenne de Première.',
  'Pharmacie : espagnol B2 → UCJC + UE ; sinon anglais B1+ → UE ; sinon LINK (admission sur dossier).',
  'Médecine / Dentaire, espagnol B2 → UCJC + UE (Madrid/Malaga si 2 spécialités scientifiques et moyenne > 15 ; autres villes si > 12,5 ; sinon UCJC seule, sur entretien).',
  'Médecine / Dentaire, sinon anglais B1+ → UE Madrid/Malaga, autres villes ou LINK selon la moyenne.',
  'Médecine / Dentaire, sinon un peu d’espagnol (A2/B1) → UCJC (niveau « faible »). Sinon → LINK.',
  'Niveau affiché : fort si score ≥ 13, moyen si ≥ 10, faible en dessous.',
]

export type EdumoveAutomation = {
  when: string
  what: string
  to: string
  channel: string
  where: 'Plateforme' | 'CRM' | 'Appli'
  state: 'ok' | 'bug'
  note?: string
}

export const EDUMOVE_AUTOMATIONS: EdumoveAutomation[] = [
  {
    when: 'Candidature déposée (site ou appli)',
    what: 'Statut « En attente de réponse ». L’équipe admissions reçoit « [Activité étudiant] Nouvelle candidature soumise ».',
    to: 'admissions@edumove.fr', channel: 'Mail', where: 'Plateforme', state: 'ok',
  },
  {
    when: '2 heures ouvrées après le dépôt (8 h–20 h)',
    what: 'Réponse automatique : le dossier passe en « Réponse Edumove envoyée », le candidat reçoit « {prénom}, votre réponse Edumove est prête ! » et un SMS.',
    to: 'Candidat', channel: 'Mail + SMS', where: 'Plateforme', state: 'bug',
    note: 'Le SMS ne part jamais (mauvais nom de clé SMS), un statut posé à la main n’est pas protégé (manual_override mal lu), et les heures sont calculées en heure UTC.',
  },
  {
    when: 'Statut passé à « Réponse Edumove » depuis le CRM (case « prévenir » cochée)',
    what: '« {prénom}, votre réponse Edumove est disponible » + SMS vers l’espace candidat.',
    to: 'Candidat', channel: 'Mail + SMS', where: 'CRM', state: 'ok',
  },
  {
    when: 'Message de l’équipe au candidat (fiche ou onglet Edumove)',
    what: '« Nouveau message de l’équipe Edumove » + SMS, si « prévenir » est coché.',
    to: 'Candidat', channel: 'Mail + SMS', where: 'CRM', state: 'ok',
  },
  {
    when: 'Message du candidat dans sa messagerie',
    what: '« 💬 Message de {nom} » (réponse directe au candidat possible).',
    to: 'admissions@edumove.fr', channel: 'Mail', where: 'Plateforme', state: 'ok',
  },
  {
    when: 'Le candidat demande un rappel',
    what: '« 📞 Rappel demandé — {nom} » avec téléphone et e-mail ; le dossier affiche « Rappel demandé ».',
    to: 'admissions@edumove.fr', channel: 'Mail', where: 'Plateforme', state: 'ok',
  },
  {
    when: 'Le candidat dépose une pièce, modifie son profil ou confirme ses facs',
    what: '« [Activité étudiant] … — {nom} ».',
    to: 'admissions@edumove.fr', channel: 'Mail', where: 'Plateforme', state: 'ok',
  },
  {
    when: 'Message de l’équipe à une fac (fiche, onglet Edumove)',
    what: '« Nouveau message Edumove — {candidat} » avec le lien d’accès de la fac à ses candidats.',
    to: 'Contacts de la fac', channel: 'Mail', where: 'CRM', state: 'ok',
  },
  {
    when: 'Une fac répond ou change un suivi depuis son lien',
    what: '« Réponse {fac} — {candidat} ».',
    to: 'admissions@edumove.fr', channel: 'Mail', where: 'CRM', state: 'ok',
  },
  {
    when: 'Suivi d’une fac passé à « Inscrit »',
    what: 'Le dossier passe en « Accepté » (étape Inscrit).',
    to: '—', channel: 'Statut', where: 'CRM', state: 'ok',
  },
  {
    when: 'Nouveau lead d’un formulaire Edumove (HubSpot)',
    what: 'SMS « La plateforme de candidature Edumove est ouverte ! … » + mail Brevo n°116 « Déposez votre dossier gratuitement » (sauf formulaire Webinaire du 15/04).',
    to: 'Lead', channel: 'SMS + Mail', where: 'Plateforme', state: 'bug',
    note: 'Le webhook HubSpot n’est pas authentifié : n’importe qui peut le déclencher.',
  },
  {
    when: 'Dossier créé ou modifié sur la plateforme',
    what: 'Copie dans le CRM (vue Edumove, fiche contact), rattachée au contact par e-mail puis téléphone + nom.',
    to: '—', channel: 'Synchro', where: 'CRM', state: 'ok',
    note: 'Toutes les 10 minutes.',
  },
  {
    when: 'Candidature envoyée sur le site',
    what: 'Retour à l’espace candidat. La page qui pousse vers l’appli Edumove Lab (lien unique, QR code) est prête et sera activée à la publication de l’appli.',
    to: 'Candidat', channel: 'Page', where: 'Plateforme', state: 'ok',
  },
  {
    when: 'Question du candidat dans l’appli (à sa publication)',
    what: 'L’assistant répond avec le dossier du candidat sous les yeux ; s’il ne sait pas, il passe la main à l’équipe (mail à admissions, dossier marqué « Rappel demandé »).',
    to: 'Candidat / admissions', channel: 'Chat + Mail', where: 'Appli', state: 'ok',
  },
]
