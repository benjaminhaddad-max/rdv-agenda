/**
 * scripts/migrate-visio-to-google-meet.ts
 *
 * Convertit les RDV visio à venir qui ont encore un ancien lien interne
 * (/visio/rdv-xxx LiveKit) ou pas de lien du tout → vrai lien Google Meet.
 *
 * Usage :
 *   bun run scripts/migrate-visio-to-google-meet.ts              # dry-run (liste seulement)
 *   bun run scripts/migrate-visio-to-google-meet.ts --execute    # applique en base
 *
 * Alternative prod (variables Google sur Vercel) :
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://hub.diploma-sante.fr/api/admin/migrate-visio-meet?execute=1"
 */

import { createClient } from '@supabase/supabase-js'
import { isGoogleMeetConfigured } from '../lib/google-meet'
import { runMigrateVisioToMeet } from '../lib/migrate-visio-meet-run'

const EXECUTE = process.argv.includes('--execute')

const fmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Variables Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  if (EXECUTE && !isGoogleMeetConfigured()) {
    throw new Error(
      'Config Google Meet manquante pour --execute. Ajoute GOOGLE_* dans .env.local ou appelle l’API admin en prod.',
    )
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await runMigrateVisioToMeet(db, { execute: EXECUTE })

  console.log(`\n=== Migration visio → Google Meet ===`)
  console.log(`Mode : ${result.dryRun ? 'DRY-RUN' : 'EXECUTE'}`)
  console.log(`RDV visio à venir : ${result.totalUpcomingVisio}`)
  console.log(`À migrer : ${result.toMigrate}\n`)

  for (const item of result.items) {
    console.log(`— ${fmt.format(new Date(item.start_at))} | ${item.prospect_name || '—'}`)
    console.log(`  id: ${item.id}`)
    console.log(`  lien actuel: ${item.old_link || '(vide)'}`)
    if (item.new_link) console.log(`  → ${item.new_link}`)
    if (item.error) console.log(`  ✗ ${item.error}`)
  }

  if (result.dryRun) {
    console.log(`\nPour appliquer en local : bun run scripts/migrate-visio-to-google-meet.ts --execute`)
    console.log(`Ou en prod : curl -H "Authorization: Bearer $CRON_SECRET" "https://hub.diploma-sante.fr/api/admin/migrate-visio-meet?execute=1"`)
    return
  }

  console.log(`\nTerminé : ${result.migrated} migré(s), ${result.failed} échec(s).`)
}

main().catch((e) => {
  console.error('Erreur fatale :', e?.message || e)
  process.exit(1)
})
