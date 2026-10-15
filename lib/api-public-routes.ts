// Routes /api accessibles SANS session CRM.
//
// Le middleware exige une session CRM (compte rdv_users) pour toute route /api
// qui n'est pas listée ici. Chaque route listée assure elle-même sa protection
// (clé d'API, secret cron, signature de webhook, jeton dans l'URL…) ou est
// publique par nature (formulaires, prise de RDV, tracking web).
//
// ⚠️ Ajouter une route ici = la rendre joignable par n'importe qui sur internet.
// Ne le faire que si la route vérifie elle-même son appelant.

type PublicApiRule = { re: RegExp; methods?: string[] }

const PUBLIC_API_RULES: PublicApiRule[] = [
  { re: /^\/api\/auth\/login\/?$/ },

  // Appels machine : chaque route vérifie sa clé / son secret / sa signature
  { re: /^\/api\/cron\// }, // CRON_SECRET
  { re: /^\/api\/webhooks\// },
  { re: /^\/api\/external\// }, // clés DIPLOMALAB_TRACKING_KEY, etc.
  { re: /^\/api\/meta\/webhook\/?$/ },
  { re: /^\/api\/brevo\/webhook\/?$/ },
  { re: /^\/api\/(crm\/contacts\/)?nomad-import\/?$/ }, // x-nomad-key

  // Formulaires publics (pages /forms, embeds sur les sites, Diploma Lab)
  { re: /^\/api\/forms\/[^/]+\/(public|submit|embed\.js)\/?$/ },
  { re: /^\/api\/forms\/prefill\/?$/, methods: ['GET'] },

  // Prise de RDV publique (/book, widgets, /reschedule)
  { re: /^\/api\/booking\// },
  { re: /^\/api\/availability(\/pool)?\/?$/, methods: ['GET'] },
  { re: /^\/api\/appointments\/?$/, methods: ['POST'] },
  { re: /^\/api\/rdv-types\/?$/, methods: ['GET'] },

  // Liens à jeton envoyés aux prospects / partenaires
  { re: /^\/api\/(confirm|reschedule|salon-live)\/[^/]+\/?$/ },
  { re: /^\/api\/alternance\/dossier\/[^/]+\/?$/ },
  { re: /^\/api\/email-survey\/(oneclick|amp-submit)\/?$/ },
  { re: /^\/api\/ads-creatives(\/.*)?$/ }, // lien partagé créatifs (resolveAdsAccess)
  { re: /^\/api\/visio\/token\/?$/ }, // le nom de la salle sert de secret
  { re: /^\/api\/fac\/[^/]+\/?$/ }, // lien fac Edumove (code secret vérifié dans la route)

  // Pages publiques Events Studio / salons
  { re: /^\/api\/events-studio\/(salons-public|planning-public|events-public)\/?$/ },
  { re: /^\/api\/events-studio\/(qr|scan)\/[^/]+\/?$/ },

  { re: /^\/api\/podcast\/candidature\/?$/, methods: ['POST'] },
  { re: /^\/api\/web\/track\/?$/ }, // origine vérifiée dans la route
]

export function isPublicApiRoute(pathname: string, method: string): boolean {
  if (method === 'OPTIONS') return true // pré-requêtes CORS (jamais de données)
  return PUBLIC_API_RULES.some(
    (rule) => rule.re.test(pathname) && (!rule.methods || rule.methods.includes(method))
  )
}
