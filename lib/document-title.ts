/** Marque affichée dans l’onglet Chrome (tooltip / aperçu). */
export const DOCUMENT_TITLE_BRAND = 'Hub Diploma'

const EXACT_TITLES: Record<string, string> = {
  '/': 'Agenda',
  '/login': 'Connexion',
  '/reset-password': 'Nouveau mot de passe',
  '/telepro': 'Télépro',
  '/telepro/transactions': 'Transactions',
  '/inscription-salons': 'Inscription salons',
  '/inscription-staff': 'Inscription staff',
  '/admin/errors': 'Erreurs',
  '/admin/migration': 'Migration',
  '/admin/crm': 'Contacts',
  '/admin/crm/dashboard': 'Dashboard',
  '/admin/crm/agenda': 'Agenda',
  '/admin/crm/transactions': 'Transactions',
  '/admin/crm/tasks': 'Mes tâches',
  '/admin/crm/import': 'Import CSV',
  '/admin/crm/doublons': 'Doublons',
  '/admin/crm/recherche-prop': 'Recherche propriété',
  '/admin/crm/proprietes': 'Propriétés',
  '/admin/crm/users': 'Utilisateurs',
  '/admin/crm/parametres': 'Paramètres',
  '/admin/crm/campaigns': 'Campagnes',
  '/admin/crm/campaigns/webinars': 'Présentations',
  '/admin/crm/campaigns/webinars/new': 'Nouvelle présentation',
  '/admin/crm/campaigns/programs': 'Programmes',
  '/admin/crm/campaigns/marketing-lists': 'Listes marketing',
  '/admin/crm/campaigns/brands': 'Marques',
  '/admin/crm/campaigns/segments': 'Segments',
  '/admin/crm/email-templates': 'Modèles email',
  '/admin/crm/workflows': 'Workflows',
  '/admin/crm/forms': 'Formulaires',
  '/admin/crm/meta-ads': 'Meta Lead Ads',
  '/admin/crm/ads-dashboard': 'Dashboard Ads',
  '/admin/crm/sms-factor': 'SMS Factor',
  '/admin/crm/events': 'Événements',
  '/admin/crm/events/new': 'Nouvel événement',
  '/admin/crm/events/planning': 'Planning événements',
  '/admin/crm/events/import': 'Import événements',
  '/admin/crm/alternance': 'Contrats alternance',
  '/admin/crm/alternance/etudiants': 'Étudiants',
  '/admin/crm/alternance/entreprises': 'Entreprises',
  '/admin/crm/alternance/contrats': 'Contrats',
  '/admin/crm/alternance/documents': 'Documents',
  '/admin/crm/reports': 'Dashboards & Rapports',
  '/admin/crm/reports/suivi-commercial': 'Suivi commercial',
  '/admin/crm/reports/telepro-rdv': 'RDV par télépro',
  '/admin/crm/cutover': 'CRM',
}

/** Plus longs d’abord pour que `/campaigns/webinars/` gagne sur `/campaigns/`. */
const PREFIX_TITLES: Array<[string, string]> = [
  ['/admin/crm/campaigns/marketing-lists/', 'Liste marketing'],
  ['/admin/crm/campaigns/webinars/', 'Présentation'],
  ['/admin/crm/campaigns/programs/', 'Programme'],
  ['/admin/crm/campaigns/segments/', 'Segment'],
  ['/admin/crm/alternance/contrats/', 'Contrat'],
  ['/admin/crm/email-templates/', 'Modèle email'],
  ['/admin/crm/contacts/', 'Contact'],
  ['/admin/crm/campaigns/', 'Campagne'],
  ['/admin/crm/workflows/', 'Workflow'],
  ['/admin/crm/reports/', 'Rapport'],
  ['/admin/crm/events/', 'Événement'],
  ['/admin/crm/forms/', 'Formulaire'],
  ['/admin/crm/deals/', 'Transaction'],
]

function stripTrailingSlash(pathname: string): string {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '') || '/'
}

function normalizeAppPath(pathname: string): string {
  return stripTrailingSlash(pathname).replace(/^\/admin\/crm-v2(?=\/|$)/, '/admin/crm')
}

export function formatDocumentTitle(pageLabel: string): string {
  const label = pageLabel.trim()
  if (!label || label === DOCUMENT_TITLE_BRAND) return DOCUMENT_TITLE_BRAND
  if (label.endsWith(` · ${DOCUMENT_TITLE_BRAND}`)) return label
  return `${label} · ${DOCUMENT_TITLE_BRAND}`
}

/** Titre générique d’après l’URL. `null` = ne pas toucher (pages publiques avec metadata). */
export function titleFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const path = stripTrailingSlash(pathname)
  const normalized = normalizeAppPath(pathname)

  if (normalized.includes('/transactions') && (normalized.startsWith('/closer/') || normalized.startsWith('/telepro'))) {
    return 'Transactions'
  }
  if (normalized.startsWith('/closer/')) return 'Closer'

  const exact = EXACT_TITLES[normalized] || EXACT_TITLES[path]
  if (exact) return exact

  for (const [prefix, label] of PREFIX_TITLES) {
    if (normalized.startsWith(prefix) || path.startsWith(prefix)) return label
  }

  return null
}
