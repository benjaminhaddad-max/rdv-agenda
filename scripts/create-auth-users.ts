// Run with: bun run scripts/create-auth-users.ts
// Creates Supabase Auth accounts and links them to rdv_users

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const USERS = [
  { email: 'pascaltawfikpro@gmail.com', password: 'DiplomaSante2026!' },
  { email: 'judith@diploma-sante.fr', password: 'JudithCloser2026!' },
  { email: 'tayebialyssa@gmail.com', password: 'AlyssaCloser2026!' },
  { email: 'lirone@diploma-sante.fr', password: 'LironeCloser2026!' },
]

async function main() {
  console.log('Creating Supabase Auth accounts...\n')

  for (const user of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    })

    if (error) {
      console.error(`FAIL ${user.email}: ${error.message}`)
      continue
    }

    console.log(`OK   ${user.email} → auth_id: ${data.user.id}`)

    // Link auth_id to rdv_users
    const { error: linkError } = await supabase
      .from('rdv_users')
      .update({ auth_id: data.user.id })
      .eq('email', user.email)

    if (linkError) {
      console.error(`     Link failed: ${linkError.message}`)
    } else {
      console.log(`     Linked to rdv_users`)
    }
  }

  console.log('\nDone! Passwords:')
  USERS.forEach(u => console.log(`  ${u.email} → ${u.password}`))
}

main()
