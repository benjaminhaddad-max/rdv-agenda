// Run with: bun run scripts/_create-restreint-maelle.ts '<mot de passe>'
// Compte « accès restreint » (migration v78) : Dashboard Ads, Créas Ads, Événements, Meta Lead Ads.
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
if (!process.argv[2]) { console.error('Usage: bun run scripts/_create-restreint-maelle.ts <mot de passe>'); process.exit(1) }
const email = 'maellecohen.consulting@gmail.com'
const { data: created, error } = await supabase.auth.admin.createUser({ email, password: process.argv[2], email_confirm: true })
if (error || !created?.user) { console.error('FAIL auth', error?.message); process.exit(1) }
const { data, error: insErr } = await supabase.from('rdv_users').insert({
  email, name: 'Maëlle Cohen', role: 'restreint', slug: 'restreint-maellecohen', avatar_color: '#ec4899', auth_id: created.user.id,
  allowed_pages: ['ads-dashboard', 'creas-ads', 'events', 'forms', 'meta-ads'],
}).select('id,email,name,role,slug,auth_id,allowed_pages').single()
if (insErr) { await supabase.auth.admin.deleteUser(created.user.id); console.error('FAIL rdv_users (auth annulé)', insErr.message); process.exit(1) }
console.log('OK', data)
