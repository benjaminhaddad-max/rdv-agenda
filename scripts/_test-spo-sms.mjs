#!/usr/bin/env bun
/**
 * Test SMS SPO avec lien court SMS Factor.
 * Usage: bun run scripts/_test-spo-sms.mjs [phone]
 */

import { readFileSync } from 'node:fs'

function loadEnv() {
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnv()

const phone = process.argv[2] || '0635350313'
const URL = 'https://diploma-sante.fr/spo-16-04/'
const text = `Assistez à votre premier cours de PASS / LAS demain à Paris ! 

Diploma Santé vous ouvre les portes de la Prépa pour venir suivre gratuitement un premier cours de première année de médecine avec un professeur expert ! 

Inscrivez-vous vite, il reste quelques places : ${URL}`

const { sendSms, replaceUrlsWithShortPlaceholder } = await import('../lib/smsfactor.ts')

const preview = replaceUrlsWithShortPlaceholder(text)
console.log('Expéditeur: Diploma')
console.log('Texte SMS (lien → smsf.st via SMS Factor):')
console.log(preview.text)
console.log('URL originale:', preview.urls[0])

const res = await sendSms(phone, text, {
  sender: 'Diploma',
  pushtype: 'marketing',
  autoShorten: true,
})

console.log(JSON.stringify({ phone, ...res }, null, 2))
process.exit(res.ok ? 0 : 1)
