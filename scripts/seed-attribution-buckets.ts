#!/usr/bin/env bun
/**
 * Matérialise les buckets d'attribution enabled (voir lib/crm-attribution-buckets.ts).
 *
 * Usage : bun run scripts/seed-attribution-buckets.ts
 *
 * Pour ajouter un bucket demain : enabled: true dans le catalogue, relancer ce script.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  buildBucketFamily,
  enabledAttributionBuckets,
} from '../lib/crm-attribution-buckets'

function loadEnv() {
  for (const file of ['.env.local', '.env.production.local', '.env']) {
    try {
      for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const i = line.indexOf('=')
        if (i < 0) continue
        let k = line.slice(0, i).trim()
        let v = line.slice(i + 1).trim()
        if (k.startsWith('export ')) k = k.slice(7).trim()
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) v = v.slice(1, -1)
        if (process.env[k] === undefined) process.env[k] = v
      }
    } catch {
      // optional
    }
  }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env missing')

  const db = createClient(url, key, { auth: { persistSession: false } })
  const buckets = enabledAttributionBuckets()
  if (buckets.length === 0) {
    console.log('Aucun bucket enabled.')
    return
  }

  const { data: existing } = await db
    .from('crm_saved_views')
    .select('id, position')
    .is('owner_id', null)
    .eq('scope', 'contacts')
    .order('position', { ascending: false })
    .limit(1)

  let nextPos = Math.max(900, Number(existing?.[0]?.position ?? 0) + 1)

  for (const bucket of buckets) {
    const family = buildBucketFamily(bucket)
    for (const [i, view] of family.entries()) {
      const row = {
        id: view.id,
        name: view.name,
        filter_groups: view.groups,
        preset_flags: view.presetFlags ?? null,
        position: nextPos + i,
        scope: 'contacts',
        owner_id: null,
        parent_id: view.parentId ?? null,
        kind: view.kind ?? 'view',
      }
      let { error } = await db.from('crm_saved_views').upsert(row, { onConflict: 'id' })
      if (error && /parent_id|kind/i.test(error.message)) {
        const fallback = {
          id: row.id,
          name: row.name,
          filter_groups: row.filter_groups,
          preset_flags: row.preset_flags,
          position: row.position,
          scope: row.scope,
          owner_id: row.owner_id,
        }
        const retry = await db.from('crm_saved_views').upsert(fallback, { onConflict: 'id' })
        error = retry.error
        if (!error) {
          console.log(`⚠ ${view.name} (${view.id}) — sans parent_id/kind (lancer supabase-migration-crm-v48-view-buckets.sql)`)
        }
      }
      if (error) throw new Error(`${view.id}: ${error.message}`)
      else console.log(`✓ ${view.kind === 'subview' ? '  ↳ ' : ''}${view.name} (${view.id})`)
    }
    nextPos += family.length + 1
  }

  const { data: all, error: listErr } = await db
    .from('crm_saved_views')
    .select('id,name,position')
    .is('owner_id', null)
    .eq('scope', 'contacts')
    .like('id', 'b_%')
    .order('position')
  if (listErr) throw listErr
  console.log('\nBuckets matérialisés:', all?.length ?? 0)
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
