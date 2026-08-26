#!/usr/bin/env node
/**
 * Restaure les vues CRM admin supprimées (voir supabase-migration-crm-v45-restore-views.sql).
 *
 * Usage: bun run scripts/restore-crm-views.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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

const RESTORE_VIEWS = [
  {
    id: 'v_1777284151000',
    name: 'Vue Pascal',
    position: 0,
    preset_flags: null,
    filter_groups: [{
      id: 'g_1777284151001',
      rules: [
        { id: 'r_1777284151002', field: 'classe', operator: 'is', value: 'Terminale' },
        { id: 'r_1777284151003', field: 'lead_status', operator: 'is', value: 'Nouveau' },
        { id: 'r_1777284151004', field: 'zone', operator: 'is', value: 'IDF' },
        { id: 'r_1777284151005', field: 'contact_owner', operator: 'is_not', value: '1754457656' },
      ],
    }],
  },
  {
    id: 'v_resoumissions_1777390808',
    name: 'Re-soumissions',
    position: 1,
    preset_flags: { recentFormDays: 30, createdBeforeDays: 30 },
    filter_groups: [],
  },
  {
    id: 'v_pascal_prio',
    name: 'Vue Pascal Prio',
    position: 2,
    preset_flags: null,
    filter_groups: [{
      id: 'group_pascal_prio',
      rules: [
        { id: 'rule_classe_terminale', field: 'classe', operator: 'is', value: 'Terminale' },
        { id: 'rule_zone_idf', field: 'zone', operator: 'is', value: 'IDF' },
        { id: 'rule_status_nouveau', field: 'lead_status', operator: 'is', value: 'Nouveau' },
        { id: 'rule_telepro_not_benjamin', field: 'telepro', operator: 'is_not', value: '1754457656' },
      ],
    }],
  },
  {
    id: 'v_meta_ads_all',
    name: 'Leads Meta ADS',
    position: 3,
    preset_flags: null,
    filter_groups: [{
      id: 'g_meta_ads_all',
      rules: [{ id: 'r_meta_ads_all', field: 'custom:meta_lead_ads', operator: 'is', value: '1' }],
    }],
  },
  {
    id: 'v_edumove_1779818006',
    name: 'Edumove',
    position: 4,
    preset_flags: null,
    filter_groups: [{
      id: 'g_edumove_all_forms',
      rules: [{ id: 'r_edumove_form_event', field: 'form_event', operator: 'contains', value: 'edumove' }],
    }],
  },
  {
    id: 'v_1783176681622',
    name: 'KIT PASS / LAS',
    position: 5,
    preset_flags: null,
    filter_groups: [{
      id: 'g_1783176681622',
      rules: [{
        id: 'r_1783176681622',
        field: 'form_event',
        operator: 'is_any',
        value: 'NS - Formulaire KIT PASS / LAS',
      }],
    }],
  },
  {
    id: 'v_a_attribuer',
    name: 'À attribuer',
    position: 5,
    preset_flags: { noTelepro: true },
    filter_groups: [],
  },
  {
    id: 'v_recents_forms',
    name: 'Formulaires récents',
    position: 6,
    preset_flags: { recentFormMonths: 3 },
    filter_groups: [],
  },
]

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env missing')

  const db = createClient(url, key, { auth: { persistSession: false } })

  for (const view of RESTORE_VIEWS) {
    const row = {
      id: view.id,
      name: view.name,
      filter_groups: view.filter_groups,
      preset_flags: view.preset_flags,
      position: view.position,
      scope: 'contacts',
      owner_id: null,
    }
    const { error } = await db.from('crm_saved_views').upsert(row, { onConflict: 'id' })
    if (error) throw new Error(`${view.id}: ${error.message}`)
    console.log(`✓ ${view.name} (${view.id})`)
  }

  const { data: all, error: listErr } = await db
    .from('crm_saved_views')
    .select('id,name,position')
    .is('owner_id', null)
    .eq('scope', 'contacts')
    .order('position')
  if (listErr) throw listErr

  console.log('\nVues globales contacts:', all?.length ?? 0)
  for (const v of all ?? []) {
    console.log(`  [${v.position}] ${v.name}`)
  }
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
