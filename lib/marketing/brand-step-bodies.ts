import type { BrandCharter } from '@/lib/brand-charter'
import type { LastChanceStepDef } from '@/lib/marketing/last-chance-medecine-steps'

import { FORM_CTA_PLACEHOLDER } from '@/lib/marketing/last-chance-cta-landings'

const FORM_CTA = FORM_CTA_PLACEHOLDER

/** AFEM — bulletin à puces, CTA pleine largeur */
function buildAfemBody(def: LastChanceStepDef, charter: BrandCharter): string {
  const paras = def.paragraphs.filter(p => p.trim())
  const [intro, ...bullets] = paras

  let html = `<p style="margin:0 0 20px;font-size:17px;color:${charter.text_color}">Bonjour <strong>{{prenom}}</strong>,</p>`

  if (intro) {
    html += `<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:${charter.text_color}">${intro}</p>`
  }

  if (bullets.length) {
    html += `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">`
    for (const p of bullets) {
      html += `<tr><td style="padding:0 0 14px 0;vertical-align:top;width:28px;font-size:16px;color:${charter.primary_color}">✓</td>
<td style="padding:0 0 14px 0;font-size:14px;line-height:1.65;color:${charter.text_color}">${p}</td></tr>`
    }
    html += `</table>`
  }

  html += `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr>
<td style="background:${charter.primary_color};border-radius:8px;padding:16px 20px;text-align:center">
<a href="${FORM_CTA}" style="color:#fff;font-size:15px;font-weight:700;text-decoration:none;display:block">${def.ctaLabel.replace(/ →$/, '')}</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:${charter.muted_color}">— Les conseillers AFEM</p>`

  return html
}

/** Numerus — lettre de club, citation centrale, encadré pointillé */
function buildNumerusBody(def: LastChanceStepDef, charter: BrandCharter): string {
  const paras = def.paragraphs.filter(p => p.trim())
  const [hook, ...rest] = paras
  const last = rest.pop()

  let html = `<p style="margin:0 0 28px;font-size:17px;color:${charter.text_color}">Salut <strong>{{prenom}}</strong>,</p>`

  if (hook) {
    html += `<table width="100%" style="margin:0 0 28px"><tr><td style="text-align:center;padding:20px 12px;border-top:1px solid ${charter.primary_color};border-bottom:1px solid ${charter.primary_color}">
<p style="margin:0;font-size:19px;line-height:1.55;font-style:italic;color:${charter.text_color}">${hook}</p>
</td></tr></table>`
  }

  for (const p of rest) {
    html += `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:${charter.text_color}">${p}</p>`
  }

  html += `<table width="100%" style="margin:28px 0;border:2px dashed ${charter.accent_color};background:rgba(255,255,255,0.35)"><tr><td style="padding:22px 20px">
<p style="margin:0 0 14px;font-size:13px;font-weight:700;color:${charter.primary_color}">Du côté du club →</p>
<a href="${FORM_CTA}" style="display:inline-block;background:${charter.primary_color};color:#fff;padding:12px 22px;text-decoration:none;font-size:14px;font-weight:600;border-radius:4px">${def.ctaLabel.replace(/ →$/, '')}</a>
</td></tr></table>`

  if (last) {
    html += `<p style="margin:24px 0 0;font-size:14px;line-height:1.65;color:${charter.muted_color}"><strong>P.S.</strong> ${last}</p>`
  }

  html += `<p style="margin:20px 0 0;font-size:14px;color:${charter.text_color}">À plus,<br><em>Numerus Club</em></p>`

  return html
}

/** Hermione — étapes numérotées, carte coaching, CTA doré */
function buildHermioneBody(def: LastChanceStepDef, charter: BrandCharter): string {
  const paras = def.paragraphs.filter(p => p.trim())

  let html = `<p style="margin:0 0 22px;font-size:22px;font-weight:800;line-height:1.25;color:${charter.text_color}">{{prenom}}, on prépare ta rentrée.</p>`

  html += `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #d8d4cc;margin-bottom:24px"><tr><td style="padding:22px 20px">`

  paras.forEach((p, i) => {
    html += `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${i < paras.length - 1 ? '16px' : '0'}"><tr>
<td style="width:36px;vertical-align:top"><div style="width:28px;height:28px;background:${charter.primary_color};color:#fff;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700">${i + 1}</div></td>
<td style="vertical-align:top;font-size:14px;line-height:1.65;color:${charter.text_color}">${p}</td>
</tr></table>`
  })

  html += `</td></tr></table>`

  html += `<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="background:${charter.accent_color};border-radius:999px;padding:15px 24px;text-align:center">
<a href="${FORM_CTA}" style="color:#1C0328;font-size:15px;font-weight:800;text-decoration:none;display:block">${def.ctaLabel.replace(/ →$/, '')}</a>
</td></tr></table>
<p style="margin:18px 0 0;font-size:13px;color:${charter.muted_color};text-align:center">Club Hermione · méthode &amp; performance</p>`

  return html
}

/** PrépaMédecine — lignes fiche conseil, une idée par bloc */
function buildPrepamedecineBody(def: LastChanceStepDef, charter: BrandCharter): string {
  const paras = def.paragraphs.filter(p => p.trim())

  let html = `<p style="margin:0 0 18px;font-size:15px;color:${charter.text_color}">Bonjour <strong>{{prenom}}</strong>,</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;margin-bottom:22px">`

  paras.forEach((p, i) => {
    const border = i < paras.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''
    html += `<tr><td style="padding:14px 16px;${border}font-size:13px;line-height:1.6;color:${charter.text_color}">${p}</td></tr>`
  })

  html += `</table>
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:16px 18px;text-align:right">
<a href="${FORM_CTA}" style="display:inline-block;background:${charter.primary_color};color:#fff;padding:11px 20px;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px">${def.ctaLabel.replace(/ →$/, '')}</a>
<p style="margin:10px 0 0;font-size:11px;color:${charter.muted_color}">Sans engagement · réponse sous 24 h</p>
</td></tr></table>`

  return html
}

export function buildBrandStepBody(def: LastChanceStepDef, charter: BrandCharter): string {
  switch (def.brand) {
    case 'afem':
      return buildAfemBody(def, charter)
    case 'numerus':
      return buildNumerusBody(def, charter)
    case 'hermione':
      return buildHermioneBody(def, charter)
    case 'prepamedecine':
      return buildPrepamedecineBody(def, charter)
    default:
      return buildAfemBody(def, charter)
  }
}
