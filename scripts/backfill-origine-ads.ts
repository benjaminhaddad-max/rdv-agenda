/**
 * Rattrapage de l'origine des leads web venus d'une campagne Google / Meta.
 *
 * Parcourt les soumissions de formulaires, détecte gclid / fbclid / UTM
 * (payload + URL de la page) et passe l'origine du contact sur
 * "Campagne ADS Google" / "Campagne ADS META" quand son origine actuelle est
 * vide ou générique (même règle que /api/forms/[id]/submit).
 *
 * Usage :
 *   bun scripts/backfill-origine-ads.ts --days=90          # dry-run
 *   bun scripts/backfill-origine-ads.ts --days=90 --apply  # écrit + backup JSON
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { canOverrideOrigine, collectAdAttribution, detectAdOrigine } from '../lib/ad-attribution'

const env: Record<string, string> = {}
for (const line of readFileSync(new URL('../.env.production.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
  if (m) env[m[1]] = m[2].replace(/\\n$/, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const apply = process.argv.includes('--apply')
const days = Number(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || 90)
const since = new Date(Date.now() - days * 86400e3).toISOString()

type Sub = {
  submitted_at: string
  source_url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  data: Record<string, unknown> | null
}

const subs: Sub[] = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('form_submissions')
    .select('submitted_at, source_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, data')
    .gte('submitted_at', since)
    .neq('status', 'spam')
    .order('submitted_at', { ascending: true })
    .range(from, from + 999)
  if (error) throw error
  subs.push(...(data as Sub[]))
  if (data.length < 1000) break
}

// 1re soumission avec signal publicitaire par contact
const targetByContact = new Map<string, { origine: string; at: string }>()
for (const s of subs) {
  const cid = typeof s.data?._contact_id === 'string' ? s.data._contact_id : null
  if (!cid || targetByContact.has(cid)) continue
  const origine = detectAdOrigine(collectAdAttribution({
    clickIds: (s.data?._tracking ?? {}) as Record<string, unknown>,
    utm: s as unknown as Record<string, unknown>,
    urls: [s.source_url],
  }))
  if (origine) targetByContact.set(cid, { origine, at: s.submitted_at })
}

const ids = [...targetByContact.keys()]
const contacts: Array<{ hubspot_contact_id: string; origine: string | null }> = []
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, origine')
    .in('hubspot_contact_id', ids.slice(i, i + 200))
  if (error) throw error
  contacts.push(...(data as typeof contacts))
}

const changes = contacts
  .filter(c => canOverrideOrigine(c.origine) && c.origine !== targetByContact.get(c.hubspot_contact_id)!.origine)
  .map(c => ({ id: c.hubspot_contact_id, from: c.origine, to: targetByContact.get(c.hubspot_contact_id)!.origine }))

const kept: Record<string, number> = {}
for (const c of contacts) {
  if (!canOverrideOrigine(c.origine)) kept[c.origine ?? '∅'] = (kept[c.origine ?? '∅'] || 0) + 1
}
const summary: Record<string, number> = {}
for (const c of changes) summary[`${c.from ?? '∅'} → ${c.to}`] = (summary[`${c.from ?? '∅'} → ${c.to}`] || 0) + 1

console.log(`Soumissions analysées (${days}j) : ${subs.length}`)
console.log(`Contacts avec signal pub : ${ids.length}`)
console.log(`À corriger : ${changes.length}`, summary)
console.log('Conservés (origine partenaire/autre) :', kept)

if (!apply) {
  console.log('\nDry-run — relancer avec --apply pour écrire.')
  process.exit(0)
}

const backupPath = `scripts/_backup-origine-ads-${Date.now()}.json`
writeFileSync(backupPath, JSON.stringify(changes, null, 2))
console.log('Backup :', backupPath)

let ok = 0
for (const c of changes) {
  // hubspot_raw volontairement non touché : le trigger télépro se déclenche sur son écriture.
  const { error } = await db.from('crm_contacts').update({ origine: c.to }).eq('hubspot_contact_id', c.id)
  if (error) console.log('ERREUR', c.id, error.message)
  else ok++
}
console.log(`Mis à jour : ${ok}/${changes.length}`)
