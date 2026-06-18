import { htmlToText, sendBrevoEmail } from '@/lib/brevo'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function parseNotifyEmails(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))]
  }
  if (typeof raw === 'string') {
    return [...new Set(raw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean))]
  }
  return []
}

function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  ).replace(/\/$/, '')
}

export async function notifyFormSubmissionRecipients(params: {
  form: { id: string; name?: string | null; slug?: string | null; notify_emails?: unknown }
  submissionId: string
  contactId?: string | null
  data: Record<string, unknown>
  fields: Array<{ field_key?: string; label?: string | null }>
  sourceUrl?: string | null
  utm?: {
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
  }
}): Promise<void> {
  const recipients = parseNotifyEmails(params.form.notify_emails)
  if (recipients.length === 0) return

  const labelsByKey = new Map<string, string>()
  for (const field of params.fields) {
    const key = String(field.field_key || '').trim()
    if (!key) continue
    labelsByKey.set(key, String(field.label || key))
  }

  const rows: Array<{ label: string; value: string }> = []
  for (const [key, value] of Object.entries(params.data)) {
    if (key.startsWith('_')) continue
    if (value === null || value === undefined || String(value).trim() === '') continue
    rows.push({
      label: labelsByKey.get(key) || key,
      value: Array.isArray(value) ? value.join(', ') : String(value),
    })
  }

  const baseUrl = siteBaseUrl()
  const formName = params.form.name || 'Formulaire web'
  const submittedAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  const contactLink = params.contactId && baseUrl
    ? `${baseUrl}/admin/crm?contact=${encodeURIComponent(params.contactId)}`
    : null
  const submissionsLink = baseUrl
    ? `${baseUrl}/admin/crm/forms/${params.form.id}?tab=submissions`
    : null

  const metaRows = [
    params.sourceUrl ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Source</td><td>${escapeHtml(params.sourceUrl)}</td></tr>` : '',
    params.utm?.utm_source ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">UTM source</td><td>${escapeHtml(params.utm.utm_source)}</td></tr>` : '',
    params.utm?.utm_medium ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">UTM medium</td><td>${escapeHtml(params.utm.utm_medium)}</td></tr>` : '',
    params.utm?.utm_campaign ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">UTM campaign</td><td>${escapeHtml(params.utm.utm_campaign)}</td></tr>` : '',
  ].filter(Boolean).join('')

  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#1e293b;line-height:1.5">
      <h2 style="margin:0 0 12px">Nouvelle soumission — ${escapeHtml(formName)}</h2>
      <p style="margin:0 0 12px">Reçue le ${escapeHtml(submittedAt)}.</p>
      <table style="border-collapse:collapse;margin:14px 0">
        ${rows.map((row) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${escapeHtml(row.label)}</td><td><strong>${escapeHtml(row.value)}</strong></td></tr>`).join('')}
        ${metaRows}
      </table>
      <p style="margin:14px 0">
        ${contactLink ? `<a href="${contactLink}" style="display:inline-block;padding:10px 18px;background:#0038f0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-right:8px">Voir le contact</a>` : ''}
        ${submissionsLink ? `<a href="${submissionsLink}" style="display:inline-block;padding:10px 18px;background:#e2e8f0;color:#0f172a;text-decoration:none;border-radius:8px;font-weight:600">Voir les soumissions</a>` : ''}
      </p>
      <p style="font-size:12px;color:#94a3b8">Notification automatique — formulaire ${escapeHtml(params.form.slug || params.form.id)}.</p>
    </div>
  `

  await sendBrevoEmail({
    to: recipients.map((email) => ({ email })),
    subject: `Nouvelle soumission — ${formName}`,
    htmlContent: html,
    textContent: htmlToText(html),
    tags: ['form-submission', `form:${params.form.id}`],
  })
}
