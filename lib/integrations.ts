/**
 * Catalogue des outils externes branchés au CRM (Paramètres → Intégrations).
 * Fichier sans dépendance serveur : partagé entre la page et /api/crm/integrations.
 *
 * `toggle: true` → l'intégration peut être mise en pause depuis Paramètres.
 * Le réglage est stocké dans crm_settings sous `integration_<id>_enabled`
 * (absent = activée) et lu côté serveur par isIntegrationEnabled() (lib/settings.ts).
 */

export type IntegrationCategory = 'communication' | 'leads' | 'partenaires' | 'visio-ia' | 'technique' | 'ancien-crm'

export type IntegrationDef = {
  id: string
  name: string
  category: IntegrationCategory
  /** Une phrase, affichée sur la carte */
  tagline: string
  /** Détail affiché dans la fiche */
  does: string[]
  direction: 'entrant' | 'sortant' | 'les deux'
  frequency: string
  /** Variables d'environnement requises (noms seulement — jamais les valeurs) */
  env: string[]
  /** Variables facultatives (affichées à titre indicatif) */
  envOptional?: string[]
  toggle?: boolean
  /** Ce qui se passe quand on met en pause */
  pauseEffect?: string
  /** Page du CRM où on règle le détail */
  manage?: { href: string; label: string }
  /** Couleur de la pastille d'icône */
  color: string
}

export const INTEGRATION_CATEGORIES: Array<{ id: IntegrationCategory; label: string; description: string }> = [
  { id: 'communication', label: 'Communication', description: 'Téléphone, emails et SMS envoyés ou reçus par l’équipe.' },
  { id: 'leads', label: 'Arrivée des leads', description: 'Les sources qui créent ou complètent des fiches contact automatiquement.' },
  { id: 'partenaires', label: 'Plateformes & partenaires', description: 'Inscriptions, événements, partenaires et applis élèves.' },
  { id: 'visio-ia', label: 'Visio & IA', description: 'Liens de visio, transcription et intelligence artificielle.' },
  { id: 'technique', label: 'Technique', description: 'Services qui font tourner le CRM en coulisses.' },
  { id: 'ancien-crm', label: 'Ancien CRM', description: 'Outil utilisé avant la bascule sur ce CRM.' },
]

export const INTEGRATIONS: IntegrationDef[] = [
  // ── Communication ──────────────────────────────────────────────────────
  {
    id: 'aircall', name: 'Aircall', category: 'communication', color: '#00b388',
    tagline: 'Les appels arrivent sur les fiches contact, les noms des leads s’affichent dans Aircall.',
    does: [
      'Enregistre chaque appel (entrant, sortant, manqué) dès qu’il se termine et le range dans la timeline de la fiche contact, avec l’enregistrement audio.',
      'Rattrapage automatique toutes les 15 min au cas où un appel aurait été manqué.',
      'Envoie toutes les 10 min les nouveaux contacts du CRM dans le carnet Aircall : le télépro voit le nom de la personne qui appelle.',
      'Alimente les chiffres d’appels de l’onglet Équipe et du Suivi commercial.',
    ],
    direction: 'les deux', frequency: 'Temps réel + toutes les 10 / 15 min',
    env: ['AIRCALL_API_ID', 'AIRCALL_API_TOKEN'], envOptional: ['AIRCALL_WEBHOOK_TOKEN'],
    toggle: true,
    pauseEffect: 'Les appels passés pendant la pause ne seront plus enregistrés sur les fiches, et les nouveaux contacts ne seront plus envoyés dans Aircall. Aircall lui-même continue de fonctionner normalement.',
    manage: { href: '/admin/crm/reports/suivi-commercial', label: 'Choisir les lignes suivies' },
  },
  {
    id: 'brevo', name: 'Brevo', category: 'communication', color: '#0b996e',
    tagline: 'Envoie tous les emails du CRM et récupère ouvertures, clics et désinscriptions.',
    does: [
      'Envoie les campagnes email, les programmes automatiques (J1, J3…), les rappels de RDV, les notifications de formulaire et les emails des workflows.',
      'Reçoit en retour chaque événement (délivré, ouvert, cliqué, rebond, désinscription) pour les statistiques de campagne et la liste des désinscrits.',
    ],
    direction: 'les deux', frequency: 'À chaque envoi + événements en temps réel',
    env: ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL'], envOptional: ['BREVO_SENDER_NAME', 'BREVO_SMTP_KEY'],
    manage: { href: '/admin/crm/campaigns', label: 'Campagnes & expéditeurs' },
  },
  {
    id: 'smsfactor', name: 'SMS Factor', category: 'communication', color: '#e8590c',
    tagline: 'Envoie les SMS de RDV (confirmation, J-2, J-1, 1 h avant) et les campagnes SMS.',
    does: [
      'SMS de confirmation à la prise de RDV, rappels 48 h et 24 h avant, puis 1 h et 5 min avant une visio.',
      'SMS de replanification après un no-show.',
      'Campagnes SMS (immédiates ou programmées) avec liens suivis.',
      'SMS de sondage de créneaux pour les salons.',
    ],
    direction: 'sortant', frequency: 'À chaque RDV + passages toutes les 5 min',
    env: ['SMSFACTOR_API_KEY'],
    manage: { href: '/admin/crm/sms-factor', label: 'Campagnes SMS' },
  },

  // ── Leads ──────────────────────────────────────────────────────────────
  {
    id: 'meta', name: 'Meta (Facebook / Instagram)', category: 'leads', color: '#1877f2',
    tagline: 'Les leads des formulaires Facebook et Instagram créent les fiches contact en direct.',
    does: [
      'Reçoit chaque lead des formulaires publicitaires en temps réel, avec une relève toutes les 15 min en filet de sécurité.',
      'Crée ou complète la fiche contact avec l’origine, le propriétaire et le workflow définis pour chaque formulaire.',
      'Lit les dépenses et performances des comptes publicitaires pour le Dashboard Ads.',
    ],
    direction: 'entrant', frequency: 'Temps réel + toutes les 15 min',
    env: ['META_APP_ID', 'META_APP_SECRET', 'META_VERIFY_TOKEN'],
    manage: { href: '/admin/crm/meta-ads', label: 'Pages et formulaires connectés' },
  },
  {
    id: 'nomad', name: 'Nomad Education', category: 'leads', color: '#7048e8',
    tagline: 'Importe les leads envoyés par le partenaire Nomad Education.',
    does: [
      'Reçoit les leads Nomad en temps réel.',
      'Relit en plus toutes les 15 min le Google Sheet partagé par Nomad pour ne rien rater.',
      'Les contacts sont créés ou complétés avec l’origine « Nomad Education (Partenaire) ».',
    ],
    direction: 'entrant', frequency: 'Temps réel + toutes les 15 min',
    env: [], envOptional: ['NOMAD_IMPORT_KEY', 'NOMAD_SHEET_CSV_URL'],
    toggle: true,
    pauseEffect: 'La relecture du Google Sheet s’arrête. Les leads envoyés en direct par Nomad continuent d’arriver.',
  },
  {
    id: 'afem', name: 'AFEM', category: 'leads', color: '#c2255c',
    tagline: 'Les formulaires du site afem-edu.fr créent des fiches contact, avec les vœux Parcoursup.',
    does: ['Chaque formulaire rempli sur le site AFEM arrive comme lead dans le CRM, avec ses vœux Parcoursup.'],
    direction: 'entrant', frequency: 'Temps réel',
    env: ['AFEM_WEBHOOK_TOKEN'],
  },
  {
    id: 'thotis', name: 'Thotis Media', category: 'leads', color: '#f08c00',
    tagline: 'Les leads générés par Thotis Media arrivent directement dans le CRM.',
    does: ['Chaque lead Thotis est créé ou complété dans le CRM dès sa réception.'],
    direction: 'entrant', frequency: 'Temps réel',
    env: ['THOTIS_WEBHOOK_TOKEN'],
  },
  {
    id: 'hermione', name: 'Hermione Orientation', category: 'leads', color: '#9c36b5',
    tagline: 'Liens de test d’orientation personnalisés dans les SMS, et résultats renvoyés sur la fiche.',
    does: [
      'Génère pour chaque lead un lien personnalisé vers le test d’orientation Hermione (inséré dans les SMS).',
      'Reçoit le classement d’orientation du lead et l’ajoute à sa fiche.',
    ],
    direction: 'les deux', frequency: 'Temps réel',
    env: [], envOptional: ['HERMIONE_LINK_SECRET', 'HERMIONE_WEBHOOK_TOKEN'],
  },

  // ── Plateformes & partenaires ──────────────────────────────────────────
  {
    id: 'diploma', name: 'Plateforme d’inscription Diploma', category: 'partenaires', color: '#b08d57',
    tagline: 'Les pré-inscriptions et inscriptions d’admission.diploma-sante.fr remontent dans le CRM.',
    does: [
      'Toutes les 5 min, lit les inscriptions de la plateforme admission.diploma-sante.fr.',
      'Met à jour les pré-inscriptions et fait avancer automatiquement les transactions (Pré-inscription → Finalisation → Inscription confirmée, ou Fermé perdu).',
      'Passe ensuite le statut du lead en « Pré-inscrit » (vérification toutes les 3 h).',
    ],
    direction: 'entrant', frequency: 'Toutes les 5 min',
    env: ['DIPLOMA_API_KEY'],
    toggle: true,
    pauseEffect: 'Les nouvelles inscriptions n’apparaîtront plus dans le CRM et les transactions n’avanceront plus toutes seules. Tout est rattrapé à la réactivation.',
  },
  {
    id: 'events', name: 'Plateforme Événements', category: 'partenaires', color: '#1c7ed6',
    tagline: 'Confirmations et rappels des inscrits aux JPO, salons et webinaires.',
    does: [
      'Toutes les 5 min, envoie les emails et SMS de confirmation et de rappel aux inscrits des événements.',
      'Permet à la plateforme Événements de créer et lister des formulaires du CRM.',
      'Prévient la plateforme à chaque formulaire rempli (avec relances automatiques en cas d’échec).',
    ],
    direction: 'les deux', frequency: 'Toutes les 5 min',
    env: ['EVENTS_SUPABASE_URL', 'EVENTS_SUPABASE_SERVICE_ROLE_KEY'], envOptional: ['EVENT_PLATFORM_WEBHOOK_URL'],
    toggle: true,
    pauseEffect: 'Les confirmations et rappels automatiques des événements ne partent plus. Ceux en retard partiront à la réactivation s’ils sont encore pertinents.',
    manage: { href: '/admin/crm/events', label: 'Événements' },
  },
  {
    id: 'linova', name: 'Linova Education', category: 'partenaires', color: '#2b8a3e',
    tagline: 'Réserver un RDV dans l’agenda Linova depuis une fiche, et suivre son statut.',
    does: [
      'Depuis une fiche contact, affiche les créneaux libres de Linova et réserve un RDV (initial ou alternance).',
      'Linova renvoie ensuite les changements de statut du RDV, ajoutés à la timeline de la fiche.',
    ],
    direction: 'les deux', frequency: 'À la demande + temps réel',
    env: ['LINOVA_API_KEY'], envOptional: ['CRM_WEBHOOK_SECRET'],
  },
  {
    id: 'apps', name: 'Applis élèves (Diplomalab, Medibox Lab)', category: 'partenaires', color: '#0ca678',
    tagline: 'L’activité des élèves dans les applis s’affiche sur leur fiche contact.',
    does: ['Reçoit les actions des élèves (connexion, exercice terminé…) et les affiche dans l’activité de la fiche contact.'],
    direction: 'entrant', frequency: 'Temps réel',
    env: [], envOptional: ['DIPLOMALAB_TRACKING_KEY', 'MEDIBOXLAB_TRACKING_KEY'],
  },

  // ── Visio & IA ─────────────────────────────────────────────────────────
  {
    id: 'google', name: 'Google Meet & Sheets', category: 'visio-ia', color: '#1a73e8',
    tagline: 'Un vrai lien Google Meet pour chaque RDV en visio.',
    does: [
      'Crée un lien Google Meet unique pour chaque RDV en visio (sans invitation envoyée par Google).',
      'Exporte certains leads attribués vers un Google Sheet partagé.',
    ],
    direction: 'sortant', frequency: 'À chaque RDV',
    env: ['GOOGLE_SA_CLIENT_EMAIL', 'GOOGLE_SA_PRIVATE_KEY'], envOptional: ['GOOGLE_MEET_ORGANIZER'],
  },
  {
    id: 'anthropic', name: 'Claude (IA)', category: 'visio-ia', color: '#d97757',
    tagline: 'Comptes rendus de visio, veille des concurrents et des forums lycées.',
    does: [
      'Rédige le compte rendu de chaque visio enregistrée et des conseils pour le télépro.',
      'Chaque matin, recense les événements des prépas concurrentes et les forums d’orientation des lycées.',
      'Aide à créer des workflows.',
    ],
    direction: 'sortant', frequency: 'À la demande + chaque matin',
    env: ['ANTHROPIC_API_KEY'],
  },
  {
    id: 'deepgram', name: 'Deepgram', category: 'visio-ia', color: '#13ef93',
    tagline: 'Transcrit l’audio des visios enregistrées, avant le compte rendu IA.',
    does: ['Transforme en texte (en français) l’audio des visios enregistrées.'],
    direction: 'sortant', frequency: 'À la demande',
    env: ['DEEPGRAM_API_KEY'],
  },

  // ── Technique ──────────────────────────────────────────────────────────
  {
    id: 'typesense', name: 'Typesense', category: 'technique', color: '#d6336c',
    tagline: 'Recherche de contacts instantanée et tolérante aux fautes de frappe.',
    does: [
      'Toutes les 2 min, copie les contacts modifiés dans le moteur de recherche.',
      'Si le service ne répond pas, la recherche bascule automatiquement sur la base du CRM (plus lente).',
    ],
    direction: 'sortant', frequency: 'Toutes les 2 min',
    env: ['TYPESENSE_HOST', 'TYPESENSE_API_KEY'],
  },

  // ── Ancien CRM ─────────────────────────────────────────────────────────
  {
    id: 'hubspot', name: 'HubSpot', category: 'ancien-crm', color: '#ff7a59',
    tagline: 'Ancien CRM. Toutes les données ont été importées ici ; plus aucun échange.',
    does: [
      'Toutes les données (contacts, transactions, historique) ont été copiées dans ce CRM, qui est désormais la seule source.',
      'Plus aucune lecture ni écriture vers HubSpot : les modifications faites ici ne partent plus là-bas, et rien n’en revient.',
    ],
    direction: 'les deux', frequency: '—',
    env: [],
  },
]

export const integrationSettingKey = (id: string) => `integration_${id}_enabled`

/** Clés crm_settings qui sont gérées par l'onglet Intégrations (à ne pas lister ailleurs). */
export function isIntegrationSettingKey(key: string): boolean {
  return /^integration_[a-z0-9]+_enabled$/.test(key)
}
