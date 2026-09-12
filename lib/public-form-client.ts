/** Client public des formulaires CRM — même payload que FormRenderer / landing. */

export type PublicFormSubmitOk = {
  ok: true
  submission_id?: string
  redirect_url?: string | null
  download_url?: string | null
  download_filename?: string | null
  success_message?: string
}

export type PublicFormSubmitFail = {
  ok: false
  error: string
  status: number
}

export type PublicFormSubmitResult = PublicFormSubmitOk | PublicFormSubmitFail

export function collectFormAttribution(): {
  utm: Record<string, string>
  attribution: Record<string, string>
} {
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const v = params.get(k)
    if (v) utm[k] = v
  }
  const AD_PARAMS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'sccid']
  const readCookie = (name: string): string | null => {
    try {
      const prefix = `${name}=`
      for (const c of document.cookie.split(';')) {
        const t = c.trim()
        if (t.indexOf(prefix) === 0) return decodeURIComponent(t.substring(prefix.length))
      }
    } catch {
      /* ignore */
    }
    return null
  }
  const attribution: Record<string, string> = {}
  for (const k of AD_PARAMS) {
    const v = params.get(k) || readCookie(`_dpa_${k}`)
    if (v) attribution[k] = v
  }
  return { utm, attribution }
}

export function buildPublicFormValues(
  fields: Array<{ field_key: string; default_value?: string | null }>,
): Record<string, string> {
  const initial: Record<string, string> = {}
  for (const f of fields) {
    if (f.default_value) initial[f.field_key] = f.default_value
  }
  const params = new URLSearchParams(window.location.search)
  for (const f of fields) {
    const urlVal = params.get(f.field_key) || params.get('utm_' + f.field_key)
    if (urlVal) initial[f.field_key] = urlVal
  }
  return initial
}

/** POST /api/forms/{slug}/submit — crée la soumission + le contact CRM. */
export async function submitPublicForm(
  slug: string,
  values: Record<string, string>,
  opts: { hp?: string; contactToken?: string | null },
): Promise<PublicFormSubmitResult> {
  const { utm, attribution } = collectFormAttribution()
  const res = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      data: values,
      hp: opts.hp || '',
      contact_token: opts.contactToken || undefined,
      source_url: window.location.href,
      ...utm,
      attribution,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : 'Erreur inconnue',
      status: res.status,
    }
  }
  return {
    ok: true,
    submission_id: data.submission_id,
    redirect_url: data.redirect_url || null,
    download_url: data.download_url || null,
    download_filename: data.download_filename || null,
    success_message: data.success_message,
  }
}
