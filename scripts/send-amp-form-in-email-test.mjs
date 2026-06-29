#!/usr/bin/env bun
/**
 * E-mail test avec formulaire DANS le message (AMP Gmail).
 * Les clics ne quittent Gmail que si AMP n'est pas activé (repli sans liens).
 *
 * Usage:
 *   bun run scripts/send-amp-form-in-email-test.mjs --email aaron@diploma-sante.fr
 *   bun run scripts/send-amp-form-in-email-test.mjs --email aaron@diploma-sante.fr --register-google
 *
 * Prérequis :
 *   1. BREVO_SMTP_KEY dans .env.local (Brevo → SMTP & API → clé SMTP, pas API key)
 *   2. Routes /api/email-survey/* déployées sur hub.diploma-sante.fr
 *   3. Enregistrement Google AMP pour l'adresse From (contact@diploma-sante.fr)
 */

import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  buildAmpSurveyHtml,
  buildAmpSurveyHtmlFallback,
  buildAmpSurveyPlainText,
} from '../lib/amp-survey-email.ts'
import {
  resolveBrevoSmtpCredentialsAsync,
  sendAmpMultipartEmail,
} from '../lib/brevo-smtp-send.ts'

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
      )
        value = value.slice(1, -1)
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    /* ignore */
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

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signOneClickToken(payload, secret) {
  const clean = { ...payload, exp: Date.now() + 90 * 24 * 60 * 60 * 1000 }
  const p = b64url(Buffer.from(JSON.stringify(clean), 'utf8'))
  const sig = b64url(createHmac('sha256', secret).update(p).digest())
  return `${p}.${sig}`
}

async function sendViaBrevoApi({ to, subject, html, text, senderEmail, senderName, tags }) {
  const brevoKey = process.env.BREVO_API_KEY?.trim()
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      tags,
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body}`)
  return body
}

async function main() {
  const toEmail = arg('email') || 'aaron@diploma-sante.fr'
  const registerGoogle = hasFlag('register-google')
  const brevoKey = process.env.BREVO_API_KEY?.trim()
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'admissions@diploma-sante.fr').trim()
  const senderName = (process.env.BREVO_SENDER_NAME || 'Diploma Santé').trim()
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.diploma-sante.fr'
  ).replace(/\/+$/, '')
  const secret =
    process.env.FORM_CONTACT_LINK_SECRET?.trim() ||
    process.env.HERMIONE_LINK_SECRET?.trim()

  if (!brevoKey) {
    console.error('❌ BREVO_API_KEY manquant')
    process.exit(1)
  }

  const smtpCreds = await resolveBrevoSmtpCredentialsAsync(brevoKey)
  if (!smtpCreds) {
    console.error('❌ BREVO_SMTP_KEY manquant — obligatoire pour le formulaire DANS le mail.')
    console.error('')
    console.error('   Brevo → Paramètres → SMTP & API → onglet SMTP → créer une clé SMTP')
    console.error('   Ajoutez dans .env.local :')
    console.error('   BREVO_SMTP_KEY=votre_cle_smtp_64_caracteres')
    console.error('')
    console.error('   (La clé API REST ne fonctionne pas pour SMTP — c’est pour ça que Gmail')
    console.error('   affiche des boutons qui ouvrent le navigateur au lieu du formulaire AMP.)')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email')
    .eq('email', toEmail.toLowerCase().trim())
    .maybeSingle()

  const prenom = contact?.firstname?.trim() || 'Aaron'
  const cid = contact?.hubspot_contact_id || 'test'

  const contactToken = secret
    ? signOneClickToken({ cid, email: toEmail, prenom, firstname: prenom }, secret)
    : 'demo'

  const submitUrl = `${baseUrl}/api/email-survey/amp-submit`
  const ampHtml = buildAmpSurveyHtml({ prenom, submitUrl, contactToken })
  const htmlFallback = buildAmpSurveyHtmlFallback({ prenom, senderName })
  const text = buildAmpSurveyPlainText(prenom)

  const subject = registerGoogle
    ? 'Votre orientation PASS/LAS — 2 questions rapides'
    : 'Formulaire dans votre e-mail — répondez sans quitter Gmail'

  const recipient = registerGoogle ? 'ampforemail.whitelisting@gmail.com' : toEmail

  console.log('📤 Envoi AMP multipart via SMTP…')
  console.log('   Login SMTP:', smtpCreds.login)
  console.log('   From:', senderEmail)
  console.log('   To:', recipient)

  const messageId = await sendAmpMultipartEmail(smtpCreds, {
    fromEmail: senderEmail,
    fromName: senderName,
    to: recipient,
    subject,
    text,
    html: htmlFallback,
    amp: ampHtml,
  })

  console.log('✅ E-mail AMP envoyé')
  console.log('📨 messageId:', messageId)
  console.log('⚡ action-xhr:', submitUrl)
  console.log('👤 Prénom:', prenom)

  if (registerGoogle) {
    console.log('')
    console.log('📋 Ensuite : formulaire Google → https://amp.gmail.dev/register/')
    console.log('   (e-mail production envoyé à ampforemail.whitelisting@gmail.com)')
  } else {
    console.log('')
    console.log('💡 Dans Gmail mobile :')
    console.log('   • Ouvrez le mail dans l’APP Gmail (pas le web)')
    console.log('   • Vous devez voir le badge ⚡ et des listes déroulantes')
    console.log('   • Si vous ne voyez que du texte gris → domaine pas encore whitelisté Google')
    console.log('')
    console.log('   Enregistrement Google : bun run scripts/send-amp-form-in-email-test.mjs --register-google')
    console.log('   Test local rendu AMP : https://amp.gmail.dev/playground/')
  }

  // Vérifie que l'API prod est déployée
  try {
    const probe = await fetch(submitUrl, { method: 'OPTIONS' })
    if (probe.status === 404) {
      console.warn('')
      console.warn('⚠️  /api/email-survey/amp-submit → 404 en prod')
      console.warn('   Déployez hub.diploma-sante.fr avant de tester la soumission du formulaire.')
    }
  } catch {
    /* ignore */
  }
}

main().catch(e => {
  console.error('❌', e.message || e)
  process.exit(1)
})
