import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let totalUpdated = 0
let totalErrors = 0
let totalSkipped = 0

while (true) {
  // Lot de 500 contacts à refill
  const { data: batch } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, hubspot_raw')
    .is('firstname', null)
    .not('hubspot_raw', 'is', null)
    .limit(500)

  if (!batch || batch.length === 0) break

  for (const r of batch) {
    const p = r.hubspot_raw?.properties ?? {}
    if (!p.firstname && !p.lastname && !p.email) {
      // Vraiment vide côté HubSpot — on met une string vide pour sortir du filtre
      // mais on ne peut pas inventer un nom
      const { error } = await db.from('crm_contacts')
        .update({ firstname: '', synced_at: new Date().toISOString() })
        .eq('hubspot_contact_id', r.hubspot_contact_id)
      if (error) totalErrors++; else totalSkipped++
      continue
    }
    const patch = {
      firstname:       p.firstname ?? '',
      lastname:        p.lastname ?? null,
      email:           p.email ?? null,
      phone:           p.phone ?? null,
      departement:     p.departement ?? null,
      classe_actuelle: p.classe_actuelle ?? null,
      zone_localite:   p.zone___localite ?? null,
      origine:         p.origine ?? null,
      source:          p.source ?? null,
      hs_lead_status:  p.hs_lead_status ?? null,
      hubspot_owner_id:p.hubspot_owner_id ?? null,
      teleprospecteur: p.teleprospecteur ?? null,
      formation_demandee:  p.diploma_sante___formation_demandee ?? null,
      formation_souhaitee: p.formation_souhaitee ?? null,
      recent_conversion_date:  p.recent_conversion_date ?? null,
      recent_conversion_event: p.recent_conversion_event_name ?? null,
      contact_createdate: p.createdate ?? null,
      synced_at: new Date().toISOString(),
    }
    const { error } = await db.from('crm_contacts')
      .update(patch)
      .eq('hubspot_contact_id', r.hubspot_contact_id)
    if (error) totalErrors++; else totalUpdated++
  }
  process.stdout.write(`\r   updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors}`)
}
console.log(`\n✅ Terminé : ${totalUpdated} contacts re-remplis, ${totalSkipped} vides marqués, ${totalErrors} erreurs`)

// Compteur final
const { count: total } = await db.from('crm_contacts').select('*', { count: 'exact', head: true })
const { count: visible } = await db.from('crm_contacts').select('*', { count: 'exact', head: true })
  .not('firstname', 'is', null).neq('firstname', '')
console.log(`\nTotal contacts en base : ${total?.toLocaleString('fr-FR')}`)
console.log(`Contacts avec un nom non vide : ${visible?.toLocaleString('fr-FR')}`)
