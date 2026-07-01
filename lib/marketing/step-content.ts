import type { BrandCharter } from '@/lib/brand-charter'
import { buildLastChanceStepBody } from '@/lib/marketing/last-chance-medecine-steps'
import type { LastChanceStepDef, LastChanceBrand } from '@/lib/marketing/last-chance-medecine-steps'
import { LAST_CHANCE_MEDECINE_STEPS, BRAND_FORM_CTA_LABEL } from '@/lib/marketing/last-chance-medecine-steps'

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
    ctaLabel: BRAND_FORM_CTA_LABEL.afem,
    ctaHref: '{{lien_formulaire}}',
    showFormLink: false,
    formLinkLabel: '',
  }
}

export function contentFromStepDef(def: LastChanceStepDef): ProgramStepContent {
  return {
    version: 1,
    paragraphs: [...def.paragraphs],
    ctaLabel: BRAND_FORM_CTA_LABEL[def.brand],
    ctaHref: '{{lien_formulaire}}',
    showFormLink: false,
    formLinkLabel: '',
  }
}

export function contentFromLastChanceIndex(stepIndex: number): ProgramStepContent | null {
  const def = LAST_CHANCE_MEDECINE_STEPS[stepIndex]
  return def ? contentFromStepDef(def) : null
}

export function normalizeStepContent(
  content: ProgramStepContent,
  brandSlug?: string,
): ProgramStepContent {
  const brand = brandSlug as LastChanceBrand | undefined
  return {
    ...content,
    version: 1,
    ctaHref: '{{lien_formulaire}}',
    showFormLink: false,
    formLinkLabel: '',
    ctaLabel:
      brand && BRAND_FORM_CTA_LABEL[brand]
        ? BRAND_FORM_CTA_LABEL[brand]
        : content.ctaLabel,
  }
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
  }
  return buildLastChanceStepBody(def, charter)
}

export function tryParseContentFromHtml(html: string): Partial<ProgramStepContent> | null {
  if (!html?.trim()) return null

  const paragraphs: string[] = []
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = pRe.exec(html)) !== null) {
    const raw = m[1]
    if (raw.includes('{{prenom}}')) continue
    if (raw.includes('text-align:center') || m[0].includes('text-align:center')) continue
    if (raw.includes('{{lien_formulaire}}')) continue
    if (/À très vite|À bientôt|On reste dispo|On te lit|Cordialement|Les conseillers|Comparateur indépendant/i.test(raw)) continue
    if (/Association étudiante|Réponse personnalisée|Le club des/i.test(raw)) continue
    const text = raw.trim()
    if (!text || text === '<br>' || text === '<br/>') continue
    paragraphs.push(text)
  }

  if (!paragraphs.length) {
    const divRe = /<div[^>]*>([\s\S]*?)<\/div>/gi
    let d: RegExpExecArray | null
    while ((d = divRe.exec(html)) !== null) {
      const text = d[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (text.length > 40) paragraphs.push(text)
    }
  }

  if (!paragraphs.length) return null

  const ctaMatch = html.match(
    /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  )

  return {
    version: 1,
    paragraphs,
    ctaLabel: ctaMatch?.[2]?.replace(/<[^>]+>/g, '').trim() || 'En savoir plus →',
    ctaHref: '{{lien_formulaire}}',
    showFormLink: false,
    formLinkLabel: '',
  }
}

export function resolveStepContent(
  stepIndex: number,
  contentJson: ProgramStepContent | null | undefined,
  brandSlug: string | undefined,
  htmlBody?: string | null,
): ProgramStepContent {
  if (contentJson?.version === 1 && Array.isArray(contentJson.paragraphs)) {
    return normalizeStepContent(contentJson, brandSlug)
  }

  if (htmlBody) {
    const parsed = tryParseContentFromHtml(htmlBody)
    if (parsed?.paragraphs?.length) {
      const seed = contentFromLastChanceIndex(stepIndex)
      return normalizeStepContent(
        {
          version: 1,
          paragraphs: parsed.paragraphs,
          ctaLabel: parsed.ctaLabel || seed?.ctaLabel || BRAND_FORM_CTA_LABEL[(brandSlug as LastChanceBrand) || 'afem'],
          ctaHref: '{{lien_formulaire}}',
          showFormLink: false,
          formLinkLabel: '',
        },
        brandSlug,
      )
    }
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
      logo_header_url: null,
      logo_text: null,
      header_style: 'dark',
      cta_style: 'rounded',
      tone: '',
    },
  )
}
