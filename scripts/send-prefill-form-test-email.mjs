#!/usr/bin/env node
/**
 * Envoie un e-mail test avec lien formulaire pré-rempli (token signé).
 *
 * Usage:
 *   bun run scripts/send-prefill-form-test-email.mjs --email=vous@exemple.fr
 *   bun run scripts/send-prefill-form-test-email.mjs --email=vous@exemple.fr --slug=mon-formulaire
 *   bun run scripts/send-prefill-form-test-email.mjs --contact-id=12345 --email=vous@exemple.fr
 */

import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    const src = readFileSync('.env.local', 'utf8')
    for (const raw of src.split(/\r?\n/)) {
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
  } catch {
  }
}

loadEnv()

function arg(name) {
  const eq = `--${name}=`
  for (const a of process.argv) {
    if (a.startsWith(eq)) return a.slice(eq.length)
  }
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : null
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signToken(data, secret) {
  const clean = {
    cid: String(data.cid).trim(),
    slug: data.slug?.trim() || undefined,
    exp: data.exp ?? Date.now() + 90 * 24 * 60 * 60 * 1000,
    firstname: data.firstname?.trim() || undefined,
    lastname: data.lastname?.trim() || undefined,
    email: data.email?.trim() || undefined,
    phone: data.phone?.trim() || undefined,
  }
  const payload = b64url(Buffer.from(JSON.stringify(clean), 'utf8'))
  const sig = b64url(createHmac('sha256', secret).update(payload).digest())
  return `${payload}.${sig}`
}

async function main() {
  const toEmail = arg('email')
  const slug = (arg('slug') || process.env.FORM_PREFILL_TEST_SLUG || 'prefill-campagne').trim().toLowerCase()
  const contactIdArg = arg('contact-id')

  const secret =
    process.env.FORM_CONTACT_LINK_SECRET?.trim() ||
    process.env.HERMIONE_LINK_SECRET?.trim()
  const brevoKey = process.env.BREVO_API_KEY?.trim()
  const baseUrl = (
    process.env.NEXT_PUBLIC_FORM_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://hub.diploma-sante.fr'
  ).replace(/\/+$/, '')

  if (!secret) {
    console.error('❌ Définir FORM_CONTACT_LINK_SECRET ou HERMIONE_LINK_SECRET dans .env.local')
    process.exit(1)
  }
  if (!brevoKey) {
    console.error('❌ BREVO_API_KEY manquant')
    process.exit(1)
  }
  if (!toEmail) {
    console.error('❌ Usage: --email=votre@email.fr')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  let contact
  if (contactIdArg) {
    const { data } = await supabase
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone')
      .eq('hubspot_contact_id', contactIdArg)
      .maybeSingle()
    contact = data
  } else {
    const { data } = await supabase
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone')
      .eq('email', toEmail.toLowerCase().trim())
      .maybeSingle()
    contact = data
    if (!contact) {
      const { data: one } = await supabase
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone')
        .not('email', 'is', null)
        .limit(1)
        .maybeSingle()
      contact = one
      if (contact) {
        console.log('ℹ️  Contact test (pas trouvé par email):', contact.email)
      }
    }
  }

  if (!contact?.hubspot_contact_id) {
    console.error('❌ Aucun contact CRM trouvé')
    process.exit(1)
  }

  const token = signToken({
    cid: contact.hubspot_contact_id,
    slug,
    firstname: contact.firstname,
    lastname: contact.lastname,
    email: contact.email,
    phone: contact.phone,
  }, secret)

  const formUrl = `${baseUrl}/forms/${encodeURIComponent(slug)}?t=${token}`

  const prenom = contact.firstname || 'there'
  const html = `
<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,Arial,sans-serif;color:#12314d;line-height:1.6;padding:24px;">
  <p>Bonjour ${prenom},</p>
  <p><strong>Test lien formulaire pré-rempli</strong> — nom, e-mail et prénom sont déjà connus : ils ne doivent <strong>pas</strong> réapparaître sur la page.</p>
  <p>Il ne reste que <strong>1 ou 2 questions</strong>, liées à votre fiche CRM (<code>${contact.hubspot_contact_id}</code>).</p>
  <p style="margin:28px 0;">
    <a href="${formUrl}" style="display:inline-block;background:#12314d;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;">
      Répondre (2 questions)
    </a>
  </p>
  <p style="font-size:12px;color:#666;">Lien direct :<br><a href="${formUrl}">${formUrl}</a></p>
</body></html>`

  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'admissions@diploma-sante.fr').trim()
  const senderName = (process.env.BREVO_SENDER_NAME || 'Diploma Santé').trim()

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: toEmail, name: prenom }],
      subject: `[TEST] Formulaire pré-rempli — ${slug}`,
      htmlContent: html,
      textContent: `Bonjour ${prenom}, test formulaire: ${formUrl}`,
      tags: ['form-prefill-test'],
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error('❌ Brevo', res.status, text)
    process.exit(1)
  }

  console.log('✅ E-mail test envoyé à', toEmail)
  console.log('📋 Formulaire slug:', slug)
  console.log('🔗 URL:', formUrl)
  console.log('👤 Contact:', contact.hubspot_contact_id, contact.email)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
