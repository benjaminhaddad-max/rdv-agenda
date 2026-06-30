/**
 * Chartes graphiques email — extraites des sites officiels.
 * Sources :
 *   - AFEM : afem-edu.fr
 *   - Hermione : hermione.co
 *   - PrépaMédecine : prepamedecine.fr
 *   - Numerus : numerusclub.fr
 */

export interface BrandCharter {
  slug: string
  name: string
  website_url: string
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  text_color: string
  muted_color: string
  font_family: string
  logo_url: string | null
  /** Texte si pas de logo image (ex. Numerus) */
  logo_text: string | null
  cta_style: 'rounded' | 'pill' | 'square'
  tone: string
}

export const BRAND_CHARTERS: Record<string, BrandCharter> = {
  afem: {
    slug: 'afem',
    name: 'AFEM',
    website_url: 'https://afem-edu.fr',
    primary_color: '#479143',
    secondary_color: '#65bd7d',
    accent_color: '#3a8a52',
    background_color: '#f5f7f9',
    text_color: '#212326',
    muted_color: '#5a5d63',
    font_family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
    logo_url: 'https://www.afem-edu.fr/assets/logo.png',
    logo_text: null,
    cta_style: 'rounded',
    tone: 'Association, outils gratuits, bienveillant et orienté réussite PASS/LAS',
  },
  hermione: {
    slug: 'hermione',
    name: 'Club Hermione',
    website_url: 'https://hermione.co',
    primary_color: '#551077',
    secondary_color: '#2b0a3d',
    accent_color: '#F4AB34',
    background_color: '#E8E8DE',
    text_color: '#1C0328',
    muted_color: '#5c4a6a',
    font_family: "Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif",
    logo_url: 'https://hermione.co/wp-content/uploads/2022/03/cropped-favicon.png',
    logo_text: null,
    cta_style: 'pill',
    tone: 'Coaching méthode, performance, communauté étudiants médecine',
  },
  prepamedecine: {
    slug: 'prepamedecine',
    name: 'PrépaMédecine.fr',
    website_url: 'https://prepamedecine.fr',
    primary_color: '#046bd2',
    secondary_color: '#0353a4',
    accent_color: '#10b981',
    background_color: '#f8fafc',
    text_color: '#0f172a',
    muted_color: '#64748b',
    font_family: "Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif",
    logo_url: 'https://prepamedecine.fr/logo-prepamedecine.svg',
    logo_text: null,
    cta_style: 'rounded',
    tone: 'Comparateur indépendant, conseil gratuit, clair et rassurant',
  },
  numerus: {
    slug: 'numerus',
    name: 'Numerus Club',
    website_url: 'https://www.numerusclub.fr',
    primary_color: '#C45A3D',
    secondary_color: '#A8492F',
    accent_color: '#E8A48A',
    background_color: '#F4ECE0',
    text_color: '#2A1F1A',
    muted_color: '#8A7868',
    font_family: "Georgia, 'Times New Roman', serif",
    logo_url: null,
    logo_text: 'Numerus Club',
    cta_style: 'square',
    tone: 'Club étudiant, chaleureux, terre cuite & crème, mise en relation coachs',
  },
  diploma: {
    slug: 'diploma',
    name: 'Diploma Santé',
    website_url: 'https://diploma-sante.fr',
    primary_color: '#12314d',
    secondary_color: '#C9A84C',
    accent_color: '#0038f0',
    background_color: '#f6f8fc',
    text_color: '#0e1e35',
    muted_color: '#4a6070',
    font_family: "Inter, Arial, sans-serif",
    logo_url: null,
    logo_text: 'Diploma Santé',
    cta_style: 'rounded',
    tone: 'Prépa médecine premium, sérieux et accompagnement',
  },
  edumove: {
    slug: 'edumove',
    name: 'Edumove',
    website_url: 'https://edumove.fr',
    primary_color: '#e65100',
    secondary_color: '#bf360c',
    accent_color: '#ff9800',
    background_color: '#fff8f0',
    text_color: '#1a1a1a',
    muted_color: '#666666',
    font_family: "Inter, Arial, sans-serif",
    logo_url: null,
    logo_text: 'Edumove',
    cta_style: 'rounded',
    tone: 'Orientation études, dynamique',
  },
}

export function getBrandCharter(slug: string): BrandCharter | null {
  return BRAND_CHARTERS[slug.trim().toLowerCase()] || null
}

/** Bouton CTA inline pour les templates email */
export function brandCtaButton(
  charter: BrandCharter,
  label: string,
  href: string,
): string {
  const radius =
    charter.cta_style === 'pill' ? '999px' : charter.cta_style === 'square' ? '4px' : '8px'
  return `<a href="${href}" style="display:inline-block;background:${charter.primary_color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:${radius};font-weight:600;font-size:15px">${label}</a>`
}

/** Enveloppe HTML email avec charte complète */
export function wrapCharterEmailHtml(charter: BrandCharter, innerHtml: string): string {
  const logoBlock = charter.logo_url
    ? `<img src="${charter.logo_url}" alt="${charter.name}" height="36" style="display:block;max-height:36px;width:auto" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em">${charter.logo_text || charter.name}</span>`

  const headerTextColor = charter.slug === 'hermione' ? '#fff' : '#ffffff'
  const headerBg =
    charter.slug === 'afem'
      ? `linear-gradient(135deg, ${charter.secondary_color}, ${charter.primary_color})`
      : charter.slug === 'numerus'
        ? charter.primary_color
        : charter.primary_color

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${charter.background_color};font-family:${charter.font_family};color:${charter.text_color}">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:24px 16px">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
        <tr><td style="background:${headerBg};padding:20px 24px;color:${headerTextColor}">
          ${logoBlock}
        </td></tr>
        <tr><td style="padding:28px 24px;line-height:1.65;font-size:15px;color:${charter.text_color}">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background:${charter.background_color};font-size:12px;color:${charter.muted_color};text-align:center;line-height:1.5">
          <strong style="color:${charter.text_color}">${charter.name}</strong><br>
          <a href="${charter.website_url}" style="color:${charter.primary_color}">${charter.website_url.replace(/^https?:\/\//, '')}</a><br>
          <a href="{{unsubscribe}}" style="color:${charter.muted_color}">Se désabonner</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Corps par défaut pour une étape programme, avec ton de marque */
export function defaultBrandStepBody(charter: BrandCharter, label: string): string {
  const cta = brandCtaButton(charter, 'En savoir plus →', charter.website_url)
  return `<p>Bonjour <strong>{{prenom}}</strong>,</p>
<p>${label} — contenu à personnaliser.</p>
<p style="margin:24px 0">${cta}</p>
<p style="font-size:13px;color:${charter.muted_color}">${charter.tone}</p>`
}
