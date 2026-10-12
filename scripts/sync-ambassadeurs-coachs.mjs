/**
 * Ambassadeurs lycées (onglet CRM Lycées → Ambassadeurs) : rattache chaque élève
 * à son coach Diploma Lab (coach individuel `profiles.coach_id`, sinon le coach
 * de sa classe s'il est seul — même règle que resolveStudentCoachId du Lab).
 * Remplit lycee_ambassadeurs.coach_lab_id / coach_name (migration v71).
 *
 *   node scripts/sync-ambassadeurs-coachs.mjs          → aperçu par coach
 *   node scripts/sync-ambassadeurs-coachs.mjs --write  → écrit dans le CRM
 *
 * Clés : rdv-agenda/.env.local (CRM) et ../EXOTEACHBIS-main/.env.local (Lab).
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const base = fileURLToPath(new URL('../../', import.meta.url))
const env = f => Object.fromEntries(fs.readFileSync(base + f, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const crm = env('rdv-agenda/.env.local'), lab = env('EXOTEACHBIS-main/.env.local')
const mk = (url, key) => async (path, opts = {}) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  if (!r.ok) throw new Error(`${r.status} ${path.slice(0, 80)} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}
const C = mk(crm.NEXT_PUBLIC_SUPABASE_URL, crm.SUPABASE_SERVICE_ROLE_KEY)
const L = mk(lab.NEXT_PUBLIC_SUPABASE_URL, lab.SUPABASE_SERVICE_ROLE_KEY)
const chunk = (a, n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

let ambs = []
for (let off = 0; ; off += 1000) { const r = await C(`lycee_ambassadeurs?select=id,lab_profile_id,label,first_name,last_name&season=eq.2026-2027&order=id&offset=${off}&limit=1000`); ambs.push(...r); if (r.length < 1000) break }
const pids = [...new Set(ambs.map(a => a.lab_profile_id).filter(Boolean))]
const profs = new Map()
for (const c of chunk(pids)) for (const p of await L(`profiles?select=id,coach_id,groupe_id&id=in.(${c.join(',')})`)) profs.set(p.id, p)
const gids = [...new Set([...profs.values()].map(p => p.groupe_id).filter(Boolean))]
const byGroup = new Map()
for (const c of chunk(gids)) for (const g of await L(`coach_groupe_assignments?select=coach_id,groupe_id&groupe_id=in.(${c.join(',')})`)) byGroup.set(g.groupe_id, [...(byGroup.get(g.groupe_id) || []), g.coach_id])
const coachOf = p => p?.coach_id || ((byGroup.get(p?.groupe_id) || []).length === 1 ? byGroup.get(p.groupe_id)[0] : null)
const cids = [...new Set([...profs.values()].map(coachOf).filter(Boolean))]
const names = new Map()
for (const c of chunk(cids)) for (const p of await L(`profiles?select=id,first_name,last_name&id=in.(${c.join(',')})`)) names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' '))
const rows = ambs.map(a => { const cid = coachOf(profs.get(a.lab_profile_id)); return { id: a.id, label: a.label, coach_lab_id: cid, coach_name: cid ? names.get(cid) || null : null, multi: !cid && (byGroup.get(profs.get(a.lab_profile_id)?.groupe_id) || []).length > 1 } })
const stat = {}
for (const r of rows) { const k = r.coach_name || (r.multi ? '(groupe multi-coachs, pas attribué)' : '(aucun coach)'); stat[k] ??= { tous: 0, top: 0 }; stat[k].tous++; if (r.label === 'top') stat[k].top++ }
console.log('ambassadeurs', ambs.length, 'avec profil lab', pids.length)
console.table(stat)
if (process.argv[2] === '--write') {
  const groups = new Map()
  for (const r of rows) { const k = `${r.coach_lab_id}|${r.coach_name}`; groups.set(k, [...(groups.get(k) || []), r.id]) }
  for (const [k, ids] of groups) { const [cid, cn] = k.split('|'); for (const c of chunk(ids)) await C(`lycee_ambassadeurs?id=in.(${c.join(',')})`, { method: 'PATCH', body: JSON.stringify({ coach_lab_id: cid === 'null' ? null : cid, coach_name: cn === 'null' ? null : cn }), headers: { Prefer: 'return=minimal' } }) }
  console.log('écrit')
}
