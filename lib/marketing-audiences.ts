import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketingMember {
  id: string
  audience_id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

export interface MarketingRecipient {
  contact_id: string
  email: string
  first_name: string | null
  last_name: string | null
  recipient_source: 'marketing'
  marketing_member_id: string
}

/** Charge les membres actifs d'une ou plusieurs listes marketing (hors CRM). */
export async function resolveMarketingRecipients(
  db: SupabaseClient,
  audienceIds: string[],
): Promise<MarketingRecipient[]> {
  const ids = audienceIds.filter(Boolean)
  if (ids.length === 0) return []

  const seen = new Map<string, MarketingRecipient>()
  const PAGE = 1000
  let from = 0

  while (true) {
    const { data, error } = await db
      .from('marketing_audience_members')
      .select('id, audience_id, email, first_name, last_name')
      .in('audience_id', ids)
      .is('unsubscribed_at', null)
      .not('email', 'is', null)
      .neq('email', '')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`marketing members: ${error.message}`)
    if (!data?.length) break

    for (const row of data) {
      const email = String(row.email).trim()
      if (!email) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.set(key, {
        contact_id: `mkt:${row.id}`,
        email,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        recipient_source: 'marketing',
        marketing_member_id: row.id,
      })
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // Exclure désabonnés globaux
  if (seen.size > 0) {
    const emails = Array.from(seen.keys())
    const unsub = new Set<string>()
    for (let i = 0; i < emails.length; i += 200) {
      const chunk = emails.slice(i, i + 200)
      const { data } = await db.from('email_unsubscribes').select('email').in('email', chunk)
      for (const u of data ?? []) {
        if (u.email) unsub.add(String(u.email).toLowerCase())
      }
    }
    for (const e of unsub) seen.delete(e)
  }

  return Array.from(seen.values())
}

export async function refreshAudienceMemberCount(
  db: SupabaseClient,
  audienceId: string,
): Promise<number> {
  const { count, error } = await db
    .from('marketing_audience_members')
    .select('id', { count: 'exact', head: true })
    .eq('audience_id', audienceId)
    .is('unsubscribed_at', null)

  if (error) throw new Error(error.message)
  const n = count ?? 0
  await db.from('marketing_audiences').update({ member_count: n }).eq('id', audienceId)
  return n
}

export type CsvImportRow = {
  email: string
  first_name?: string
  last_name?: string
  phone?: string
}

/** Parse CSV simple (email, prénom, nom, téléphone). */
export function parseMarketingCsv(text: string): CsvImportRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const sep = lines[0].includes(';') ? ';' : ','
  const header = lines[0].toLowerCase().split(sep).map(h => h.trim().replace(/^"|"$/g, ''))

  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }

  const iEmail = col(['email', 'e-mail', 'mail', 'adresse email'])
  const iFirst = col(['firstname', 'first_name', 'prenom', 'prénom', 'first name'])
  const iLast = col(['lastname', 'last_name', 'nom', 'last name'])
  const iPhone = col(['phone', 'telephone', 'téléphone', 'mobile', 'tel'])

  const start = iEmail >= 0 ? 1 : 0
  const out: CsvImportRow[] = []

  for (let li = start; li < lines.length; li++) {
    const parts = lines[li].split(sep).map(p => p.trim().replace(/^"|"$/g, ''))
    const email = (iEmail >= 0 ? parts[iEmail] : parts[0])?.trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    out.push({
      email,
      first_name: iFirst >= 0 ? parts[iFirst]?.trim() : undefined,
      last_name: iLast >= 0 ? parts[iLast]?.trim() : undefined,
      phone: iPhone >= 0 ? parts[iPhone]?.trim() : undefined,
    })
  }
  return out
}

export async function importMarketingCsv(
  db: SupabaseClient,
  audienceId: string,
  rows: CsvImportRow[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0
  const CHUNK = 100

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(r => ({
      audience_id: audienceId,
      email: r.email,
      first_name: r.first_name || null,
      last_name: r.last_name || null,
      phone: r.phone || null,
    }))

    const { error } = await db
      .from('marketing_audience_members')
      .upsert(chunk, { onConflict: 'audience_id,email', ignoreDuplicates: true })

    if (error) {
      skipped += chunk.length
    } else {
      inserted += chunk.length
    }
  }

  await refreshAudienceMemberCount(db, audienceId)
  return { inserted, skipped }
}
