/**
 * Aperçu (aucun envoi) des rappels du jour J personnalisés par créneau, sur de
 * vrais inscrits du salon : un avec créneau choisi, un sans.
 *
 *   bun scripts/_preview-jour-j-creneau.mjs
 *   bun scripts/_preview-jour-j-creneau.mjs --install   # écrit les templates
 */

import { readFileSync } from 'node:fs'

for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const EVENT_ID = '76d9911f-00ba-4a68-a598-bd537ae86dd8'

const SMS_JOUR_J =
  "{prenom}, c'est AUJOURD'HUI ! {creneau_phrase} Salon des études de médecine, 100 quai de la Rapée, 75012 Paris. À tout de suite !"

const EMAIL_SUBJECT = "C'est aujourd'hui — Salon des études de médecine !"
const EMAIL_BODY =
  "Bonjour {prenom}, c'est le grand jour ! {creneau_phrase} Rendez-vous au 100 quai de la Rapée, 75012 Paris. Présentez simplement votre QR code à l'entrée. Toute l'équipe Diploma Santé vous attend !"

const { createEventsClient } = await import('../lib/events-studio/client.ts')
const { timeslotMergeFieldsForRegistrations } = await import('../lib/event-timeslot-survey.ts')
const { renderCommsText } = await import('../lib/events-studio/send-confirmations.ts')

const db = createEventsClient()

if (process.argv.includes('--install')) {
  const { data: ev } = await db.from('events').select('custom_sms, custom_emails').eq('id', EVENT_ID).single()
  const customSms = { ...(ev.custom_sms || {}), 'j-0-matin': SMS_JOUR_J }
  const customEmails = {
    ...(ev.custom_emails || {}),
    'j-0-matin': { subject: EMAIL_SUBJECT, body: EMAIL_BODY },
  }
  const { error } = await db
    .from('events')
    .update({ custom_sms: customSms, custom_emails: customEmails })
    .eq('id', EVENT_ID)
  console.log(error ? `ECHEC : ${error.message}` : 'Templates jour J installés sur l’événement.')
  console.log('')
}

const regs = []
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from('registrations')
    .select('id, email, phone, first_name, last_name, hubspot_contact_id')
    .eq('event_id', EVENT_ID)
    .range(from, from + 999)
  regs.push(...(data || []))
  if (!data || data.length < 1000) break
}

const merge = await timeslotMergeFieldsForRegistrations(EVENT_ID, regs)

const avec = regs.filter((r) => merge.get(r.id)?.creneau)
const sans = regs.filter((r) => merge.has(r.id) && !merge.get(r.id).creneau)

console.log(`inscrits : ${regs.length} | avec créneau : ${avec.length} | sans créneau : ${sans.length}`)
const parCreneau = new Map()
for (const r of avec) {
  const c = merge.get(r.id).creneau
  parCreneau.set(c, (parCreneau.get(c) || 0) + 1)
}
console.log('répartition :', [...parCreneau].sort().map(([k, v]) => `${k} = ${v}`).join('  |  '))

function bloc(titre, reg) {
  if (!reg) {
    console.log(`\n=== ${titre} : aucun exemple ===`)
    return
  }
  const fields = merge.get(reg.id)
  const raw = (reg.first_name || '').trim()
  const prenom = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Bonjour'
  const sms = renderCommsText(SMS_JOUR_J, prenom, fields, 'sms')
  const mail = renderCommsText(EMAIL_BODY, prenom, fields, 'email')
  const chars = [...sms].length
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67)
  console.log(`\n=== ${titre} (${reg.first_name} ${reg.last_name || ''}) ===`)
  console.log(`SMS   [${chars} car. / ${segments} segment${segments > 1 ? 's' : ''}]`)
  console.log(`  ${sms}`)
  console.log(`EMAIL objet : ${EMAIL_SUBJECT}`)
  console.log(`  ${mail}`)
}

for (const slot of ['10h – 12h', '12h – 14h', '14h – 16h', '16h – 18h']) {
  bloc(`AVEC créneau ${slot}`, avec.find((r) => merge.get(r.id).creneau === slot))
}
bloc('SANS créneau', sans[0])
