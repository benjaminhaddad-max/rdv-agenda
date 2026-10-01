#!/usr/bin/env bun
/**
 * Génère docs/medibox-rdv.html : page de prise de RDV Medibox en un seul fichier
 * (logo, favicon et polices intégrés en base64), à héberger sur un domaine Medibox.
 * Usage : bun run scripts/medibox-standalone/build.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = join(import.meta.dir, '..', '..')
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(join(root, p)).toString('base64')}`

const fonts = [400, 600, 700, 800].map(w =>
  `@font-face{font-family:"Proxima Nova";src:url("${b64(`public/fonts/medibox/proxima-nova-${w}.otf`, 'font/otf')}") format("opentype");font-weight:${w};font-display:swap}`,
).join('\n')

const html = readFileSync(join(import.meta.dir, 'template.html'), 'utf8')
  .replace('__FONTS__', fonts)
  .replace('__LOGO__', b64('public/logo-medibox-blanc.png', 'image/png'))
  .replace('__ICON__', b64('public/icon-medibox.png', 'image/png'))

const out = join(root, 'docs', 'medibox-rdv.html')
writeFileSync(out, html)
console.log(`✅ ${out} (${Math.round(html.length / 1024)} Ko)`)
