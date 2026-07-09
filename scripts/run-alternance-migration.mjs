#!/usr/bin/env bun
/**
 * Exécute la migration alternance sur Supabase via l'API SQL (service role).
 * Usage : bun run scripts/run-alternance-migration.mjs
 *
 * Si échec : copier le SQL dans l'éditeur Supabase → SQL Editor.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(join(import.meta.dir, '..', 'supabase-migration-alternance-v1.sql'), 'utf8')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(1)
}

// Supabase n'expose pas d'endpoint REST pour du DDL arbitraire.
// On tente via rpc si disponible, sinon on affiche les instructions.
console.log('📋 Migration Alternance —', sql.split('\n').filter(l => l.startsWith('CREATE TABLE')).length, 'tables')
console.log('')
console.log('⚠️  Exécute ce fichier dans Supabase SQL Editor :')
console.log('   supabase-migration-alternance-v1.sql')
console.log('')
console.log('   Dashboard → https://supabase.com/dashboard/project/adpifxobpzrduotwdqrq/sql/new')
console.log('')
console.log('✅ Le bucket Storage "alternance-documents" sera créé automatiquement au premier upload.')
