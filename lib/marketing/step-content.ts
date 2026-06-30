import type { BrandCharter } from '@/lib/brand-charter'
import { buildLastChanceStepBody } from '@/lib/marketing/last-chance-medecine-steps'
import type { LastChanceStepDef } from '@/lib/marketing/last-chance-medecine-steps'
import { LAST_CHANCE_MEDECINE_STEPS } from '@/lib/marketing/last-chance-medecine-steps'

/** Contenu éditable d'une étape (stocké en base dans content_json) */
export interface ProgramStepContent {
  version: 1
  paragraphs: string[]
  ctaLabel: string
  ctaHref: string
  showFormLink: boolean
  formLinkLabel: string
}

export function defaultStepContent(charter: BrandCharter): ProgramStepContent {
  return {
    version: 1,
    paragraphs: [''],
    ctaLabel: 'En savoir plus →',
    ctaHref: charter.website_url,
    showFormLink: true,
    formLinkLabel: 'Répondre en 2 clics (formulaire pré-rempli) →',
  }
}

export function contentFromStepDef(def: LastChanceStepDef): ProgramStepContent {
  return {
    version: 1,
    paragraphs: [...def.paragraphs],
    ctaLabel: def.ctaLabel,
    ctaHref: def.ctaHref || '',
    showFormLink: !!def.showFormLink,
    formLinkLabel: def.formLinkLabel || 'Répondre en 2 clics (formulaire pré-rempli) →',
  }
}

export function contentFromLastChanceIndex(stepIndex: number): ProgramStepContent | null {
  const def = LAST_CHANCE_MEDECINE_STEPS[stepIndex]
  return def ? contentFromStepDef(def) : null
}

export function buildHtmlFromContent(
  content: ProgramStepContent,
  charter: BrandCharter,
  label: string,
): string {
  const def: LastChanceStepDef = {
    brand: charter.slug as LastChanceStepDef['brand'],
    label,
    subject: '',
    preheader: '',
    paragraphs: content.paragraphs.filter(p => p.trim()),
    ctaLabel: content.ctaLabel,
    ctaHref: content.ctaHref || charter.website_url,
    showFormLink: content.showFormLink,
    formLinkLabel: content.formLinkLabel,
  }
  return buildLastChanceStepBody(def, charter)
}

export function resolveStepContent(
  stepIndex: number,
  contentJson: ProgramStepContent | null | undefined,
  brandSlug: string | undefined,
): ProgramStepContent {
  if (contentJson?.version === 1 && Array.isArray(contentJson.paragraphs)) {
    return contentJson
  }
  const fromSeed = contentFromLastChanceIndex(stepIndex)
  if (fromSeed) return fromSeed
  const charter = brandSlug ? { website_url: 'https://example.com' } as BrandCharter : null
  return defaultStepContent(
    charter || {
      slug: 'diploma',
      name: 'Diploma',
      website_url: 'https://diploma-sante.fr',
      primary_color: '#12314d',
      secondary_color: '#12314d',
      accent_color: '#0038f0',
      background_color: '#f6f8fc',
      text_color: '#0e1e35',
      muted_color: '#4a6070',
      font_family: 'Inter, Arial, sans-serif',
      logo_url: null,
      logo_text: null,
      cta_style: 'rounded',
      tone: '',
    },
  )
}
