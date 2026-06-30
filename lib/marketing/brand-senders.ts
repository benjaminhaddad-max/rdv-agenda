/**
 * Configuration canonique des expéditeurs par marque (Brevo).
 * Domaine à valider dans Brevo avant d'activer la marque (active: true).
 */
export interface BrandSenderConfig {
  slug: string
  name: string
  sender_email: string
  sender_name: string
  reply_to: string
  website_url: string
  charter_source_url: string
  /** false tant que le domaine n'est pas validé dans Brevo */
  active: boolean
}

export const BRAND_SENDER_CONFIGS: BrandSenderConfig[] = [
  {
    slug: 'afem',
    name: 'AFEM',
    sender_email: 'contact@afem-edu.fr',
    sender_name: 'AFEM',
    reply_to: 'contact@afem-edu.fr',
    website_url: 'https://afem-edu.fr',
    charter_source_url: 'https://afem-edu.fr',
    active: true,
  },
  {
    slug: 'hermione',
    name: 'Club Hermione',
    sender_email: 'contact@hermione.co',
    sender_name: 'Club Hermione',
    reply_to: 'contact@hermione.co',
    website_url: 'https://hermione.co',
    charter_source_url: 'https://hermione.co',
    active: true,
  },
  {
    slug: 'prepamedecine',
    name: 'PrépaMédecine.fr',
    sender_email: 'contact@prepamedecine.fr',
    sender_name: 'PrépaMédecine.fr',
    reply_to: 'contact@prepamedecine.fr',
    website_url: 'https://prepamedecine.fr',
    charter_source_url: 'https://prepamedecine.fr',
    active: true,
  },
  {
    slug: 'numerus',
    name: 'Numerus Club',
    sender_email: 'contact@numerusclub.fr',
    sender_name: 'Numerus Club',
    reply_to: 'contact@numerusclub.fr',
    website_url: 'https://www.numerusclub.fr',
    charter_source_url: 'https://www.numerusclub.fr/devenir-coach.html',
    active: false,
  },
]

export function getBrandSenderConfig(slug: string): BrandSenderConfig | null {
  return BRAND_SENDER_CONFIGS.find(b => b.slug === slug) || null
}
