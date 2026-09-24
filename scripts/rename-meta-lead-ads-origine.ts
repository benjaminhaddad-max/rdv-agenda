/**
 * Renomme l'origine "Meta Lead Ads" → "Campagne ADS META" (une seule origine Meta).
 *
 *   bun scripts/rename-meta-lead-ads-origine.ts          # dry-run
 *   bun scripts/rename-meta-lead-ads-origine.ts --apply  # écrit + backup JSON des IDs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ORIGINE_ADS_META } from '../lib/ad-attribution'

const env: Record<string, string> = {}
for (const line of readFileSync(new URL('../.env.production.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
  if (m) env[m[1]] = m[2].replace(/\\n$/, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const apply = process.argv.includes('--apply')

const rows: Array<{ hubspot_contact_id: string; origine: string }> = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, origine')
    .ilike('origine', 'meta lead ads')
    .order('hubspot_contact_id')
    .range(from, from + 999)
  if (error) throw error
  rows.push(...data)
  if (data.length < 1000) break
}
const variants: Record<string, number> = {}
for (const r of rows) variants[r.origine] = (variants[r.origine] || 0) + 1
console.log(`Contacts "Meta Lead Ads" : ${rows.length}`, variants)

if (!apply) {
  console.log('Dry-run — relancer avec --apply pour écrire.')
  process.exit(0)
}

const backupPath = `scripts/_backup-rename-meta-lead-ads-${Date.now()}.json`
writeFileSync(backupPath, JSON.stringify(rows, null, 2))
console.log('Backup :', backupPath)

let ok = 0
const ids = rows.map(r => r.hubspot_contact_id)
for (let i = 0; i < ids.length; i += 200) {
  // hubspot_raw volontairement non touché : le trigger télépro se déclenche sur son écriture.
  const { error, count } = await db
    .from('crm_contacts')
    .update({ origine: ORIGINE_ADS_META }, { count: 'exact' })
    .in('hubspot_contact_id', ids.slice(i, i + 200))
  if (error) console.log('ERREUR batch', i, error.message)
  else ok += count ?? 0
}
console.log(`Mis à jour : ${ok}/${rows.length}`)
