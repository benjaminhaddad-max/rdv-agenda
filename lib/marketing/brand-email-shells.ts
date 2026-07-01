import type { BrandCharter } from '@/lib/brand-charter'
import { buildEmailHeaderLogo } from '@/lib/brand-charter'

function footerLinks(charter: BrandCharter): string {
  return `<a href="${charter.website_url}" style="color:${charter.primary_color}">${charter.website_url.replace(/^https?:\/\//, '')}</a>
 · <a href="{{unsubscribe}}" style="color:${charter.muted_color}">Se désabonner</a>`
}

/** AFEM — bulletin associatif, bandeau vert, fond gris clair, pas de carte ombrée */
export function wrapAfemEmail(innerHtml: string, charter: BrandCharter): string {
  const logo = buildEmailHeaderLogo(charter)
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#e8ecef;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${charter.primary_color};padding:10px 20px;text-align:center">
<span style="color:#fff;font-size:12px;font-weight:600;letter-spacing:0.06em">AFEM · INFO PASS/LAS · PARIS &amp; IDF</span>
</td></tr>
<tr><td align="center" style="padding:28px 16px">
<table width="640" style="max-width:640px;width:100%;background:#fff;border:1px solid #d8dde3">
<tr><td align="center" style="padding:26px 28px;border-bottom:1px solid #eef1f4;text-align:center">${logo}</td></tr>
<tr><td style="padding:28px 32px;color:${charter.text_color};font-size:15px;line-height:1.65">${innerHtml}</td></tr>
<tr><td style="padding:18px 28px;background:#f5f7f9;font-size:11px;color:${charter.muted_color};text-align:center;line-height:1.6">
<strong style="color:${charter.text_color}">Association AFEM</strong> — aide aux futurs étudiants en médecine<br>${footerLinks(charter)}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

/** Numerus — lettre club, fond crème pleine largeur, serif, pas de carte blanche */
export function wrapNumerusEmail(innerHtml: string, charter: BrandCharter): string {
  const logo = buildEmailHeaderLogo(charter)
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
</head>
<body style="margin:0;padding:0;background:${charter.background_color};font-family:Georgia,'Times New Roman',serif;color:${charter.text_color}">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:36px 20px">
<table width="520" style="max-width:520px;width:100%">
<tr><td style="text-align:center;padding-bottom:24px;border-bottom:2px solid ${charter.primary_color}">${logo}</td></tr>
<tr><td style="padding:32px 8px 24px;font-size:15px;line-height:1.75">${innerHtml}</td></tr>
<tr><td style="padding-top:20px;border-top:1px solid #d4c4b4;font-size:12px;color:${charter.muted_color};text-align:left;line-height:1.6">
<strong style="color:${charter.text_color}">Numerus Club</strong> — Paris<br>${footerLinks(charter)}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

/** Hermione — header violet pleine largeur + corps sur fond sable */
export function wrapHermioneEmail(innerHtml: string, charter: BrandCharter): string {
  const logo = buildEmailHeaderLogo(charter)
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#1C0328;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0">
<table width="600" style="max-width:600px;width:100%">
<tr><td align="center" style="background:linear-gradient(135deg,${charter.primary_color} 0%,${charter.secondary_color} 100%);padding:32px 32px;color:#fff;text-align:center">${logo}
<p style="margin:14px 0 0;font-size:12px;opacity:0.85;letter-spacing:0.05em">COACHING PASS/LAS · ÎLE-DE-FRANCE</p>
</td></tr>
<tr><td style="background:${charter.background_color};padding:32px 28px;color:${charter.text_color};font-size:15px;line-height:1.65">${innerHtml}</td></tr>
<tr><td style="background:#2b0a3d;padding:16px 28px;font-size:11px;color:#c9b8d4;text-align:center;line-height:1.5">
<strong style="color:#F4AB34">Club Hermione</strong><br>${footerLinks(charter)}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

/** PrépaMédecine — fiche conseil, bordure bleue, style outil / comparateur */
export function wrapPrepamedecineEmail(innerHtml: string, charter: BrandCharter): string {
  const logo = buildEmailHeaderLogo(charter)
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Nunito:wght@800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="580" style="max-width:580px;width:100%;background:#fff;border:1px solid #cbd5e1;border-top:4px solid ${charter.primary_color}">
<tr><td align="center" style="padding:24px 24px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${logo}</td></tr>
<tr><td style="padding:8px 24px 0"><span style="display:inline-block;background:#eff6ff;color:${charter.primary_color};font-size:10px;font-weight:700;letter-spacing:0.08em;padding:4px 10px;border-radius:4px">FICHE CONSEIL · PARIS</span></td></tr>
<tr><td style="padding:20px 24px 28px;color:${charter.text_color};font-size:14px;line-height:1.6">${innerHtml}</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:${charter.muted_color};text-align:right;line-height:1.5">
<strong style="color:${charter.text_color}">PrépaMédecine.fr</strong> · comparateur indépendant<br>${footerLinks(charter)}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

export function wrapBrandEmailHtml(charter: BrandCharter, innerHtml: string): string {
  switch (charter.slug) {
    case 'afem':
      return wrapAfemEmail(innerHtml, charter)
    case 'numerus':
      return wrapNumerusEmail(innerHtml, charter)
    case 'hermione':
      return wrapHermioneEmail(innerHtml, charter)
    case 'prepamedecine':
      return wrapPrepamedecineEmail(innerHtml, charter)
    default:
      return wrapAfemEmail(innerHtml, charter)
  }
}
