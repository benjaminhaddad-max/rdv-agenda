/**
 * Envoi multipart (text + html + text/x-amp-html) via Brevo SMTP.
 * Requis pour les formulaires AMP dans Gmail — l'API REST Brevo ne supporte pas AMP.
 */

import nodemailer from 'nodemailer'

const BREVO_ACCOUNT_URL = 'https://api.brevo.com/v3/account'

export interface BrevoSmtpCredentials {
  login: string
  password: string
  host: string
  port: number
}

/** Login SMTP Brevo (ex. 93b5e6001@smtp-brevo.com) — pas l'adresse From. */
export async function fetchBrevoSmtpLogin(apiKey: string): Promise<string | null> {
  const res = await fetch(BREVO_ACCOUNT_URL, {
    headers: { 'api-key': apiKey.trim(), accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    relay?: { data?: { userName?: string; relay?: string; port?: number } }
  }
  return data.relay?.data?.userName?.trim() || null
}

export function resolveBrevoSmtpCredentials(apiKey: string): BrevoSmtpCredentials | null {
  const password =
    process.env.BREVO_SMTP_KEY?.trim() ||
    process.env.BREVO_SMTP_PASSWORD?.trim() ||
    ''
  if (!password) return null

  const login =
    process.env.BREVO_SMTP_LOGIN?.trim() ||
    process.env.BREVO_SMTP_USER?.trim() ||
    ''

  return {
    login,
    password,
    host: process.env.BREVO_SMTP_HOST?.trim() || 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT || 587),
  }
}

export async function resolveBrevoSmtpCredentialsAsync(
  apiKey: string,
): Promise<BrevoSmtpCredentials | null> {
  const base = resolveBrevoSmtpCredentials(apiKey)
  if (!base) return null
  if (base.login) return base

  const login = await fetchBrevoSmtpLogin(apiKey)
  if (!login) return null
  return { ...base, login }
}

export interface AmpMultipartEmail {
  fromEmail: string
  fromName: string
  to: string
  subject: string
  text: string
  html: string
  amp: string
}

export async function sendAmpMultipartEmail(
  creds: BrevoSmtpCredentials,
  mail: AmpMultipartEmail,
): Promise<string> {
  const transporter = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.port === 465,
    auth: { user: creds.login, pass: creds.password },
  })

  const info = await transporter.sendMail({
    from: `${mail.fromName} <${mail.fromEmail}>`,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    amp: mail.amp,
  })

  return info.messageId || ''
}
