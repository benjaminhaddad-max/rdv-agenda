import { NextRequest, NextResponse } from 'next/server'
import {
  buildListItems, fetchAllRows, isMissingTable, missingMigrationResponse, parisToday, requireLyceeAccess,
} from '@/lib/lycees-server'
import { LYCEE_MODES, LYCEE_PRIORITIES, LYCEE_STATUSES, lookup, oneOf, type LyceeContactRow, type LyceeEventRow, type LyceeRow } from '@/lib/lycees'

/**
 * GET /api/crm/lycees — liste des lycées (+ score, contacts, forums).
 *   Admin / manager : tous ; autres rôles : uniquement les lycées attribués.
 *   ?mine=count → { count } des lycées attribués à l'utilisateur.
 *
 * PATCH /api/crm/lycees — modification groupée (admin / manager) :
 *   { uais: string[], patch: { assigned_to?, status?, priority?, mode? } }
 */
export async function GET(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db, ctx, isManager } = a.access

  // ?mine=count : nombre de lycées attribués (bouton « Mes lycées » de l'espace télépro)
  if (req.nextUrl.searchParams.get('mine') === 'count') {
    const { count, error } = await db.from('lycees').select('uai', { count: 'exact', head: true }).eq('assigned_to', ctx.appUserId)
    return NextResponse.json({ count: error ? 0 : count ?? 0 })
  }

  const lyc = await fetchAllRows<LyceeRow>((from, to) => {
    let q = db.from('lycees').select('*').order('uai').range(from, to)
    if (!isManager) q = q.eq('assigned_to', ctx.appUserId)
    return q
  })
  if (isMissingTable(lyc.error)) return missingMigrationResponse()
  if (lyc.error) return NextResponse.json({ error: lyc.error.message }, { status: 500 })

  const uais = new Set(lyc.data.map(l => l.uai))
  const [contacts, events] = await Promise.all([
    fetchAllRows<Pick<LyceeContactRow, 'uai' | 'is_key' | 'source'>>((from, to) =>
      db.from('lycee_contacts').select('uai, is_key, source').order('id').range(from, to)),
    fetchAllRows<Pick<LyceeEventRow, 'id' | 'uai' | 'season' | 'kind' | 'status' | 'date' | 'leads_count' | 'date_confirmed' | 'hidden'>>((from, to) =>
      db.from('lycee_events').select('id, uai, season, kind, status, date, leads_count, date_confirmed, hidden').order('id').range(from, to)),
  ])
  if (contacts.error || events.error) {
    return NextResponse.json({ error: (contacts.error || events.error)!.message }, { status: 500 })
  }

  const items = buildListItems(
    lyc.data,
    contacts.data.filter(c => uais.has(c.uai)),
    events.data.filter(e => e.uai && uais.has(e.uai)),
    parisToday(),
  )
  // Élèves 2026-27 par ancien lycée (v61 — ignoré si la table n'existe pas encore)
  const ambs = await fetchAllRows<{ uai: string | null; label: string | null }>((from, to) =>
    db.from('lycee_ambassadeurs').select('uai, label').order('id').range(from, to))
  if (!ambs.error) {
    const by = new Map<string, { n: number; good: number }>()
    for (const x of ambs.data) {
      if (!x.uai) continue
      const v = by.get(x.uai) || { n: 0, good: 0 }
      v.n++
      if (x.label === 'top' || x.label === 'bon') v.good++
      by.set(x.uai, v)
    }
    for (const it of items) {
      const v = by.get(it.uai)
      if (v) { it.eleves_2627 = v.n; it.ambassadeurs_bons = v.good }
    }
  }
  return NextResponse.json({ lycees: items, is_manager: isManager, me: ctx.appUserId })
}

export async function PATCH(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const access = a.access
  if (!access.isManager) return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const uais: string[] = Array.isArray(body.uais) ? body.uais.filter((u: unknown) => typeof u === 'string').slice(0, 2000) : []
  const raw = (body.patch || {}) as Record<string, unknown>
  if (!uais.length) return NextResponse.json({ error: 'Aucun lycée sélectionné' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  const logs: { kind: 'assign' | 'status'; text: string }[] = []
  if ('assigned_to' in raw) {
    patch.assigned_to = typeof raw.assigned_to === 'string' && raw.assigned_to ? raw.assigned_to : null
    let who = 'personne'
    if (patch.assigned_to) {
      const { data: u } = await access.db.from('rdv_users').select('name').eq('id', patch.assigned_to as string).maybeSingle()
      if (!u) return NextResponse.json({ error: 'Utilisateur inconnu' }, { status: 400 })
      who = u.name as string
    }
    logs.push({ kind: 'assign', text: patch.assigned_to ? `Attribué à ${who}` : 'Attribution retirée' })
  }
  if ('status' in raw) {
    const s = oneOf(LYCEE_STATUSES, raw.status)
    if (!s) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    patch.status = s
    logs.push({ kind: 'status', text: `Statut → ${lookup(LYCEE_STATUSES, s)?.label}` })
  }
  if ('priority' in raw) patch.priority = oneOf(LYCEE_PRIORITIES, raw.priority)
  if ('mode' in raw) {
    patch.mode = oneOf(LYCEE_MODES, raw.mode)
    logs.push({ kind: 'status', text: `Mode → ${lookup(LYCEE_MODES, patch.mode as string)?.label ?? 'à définir'}` })
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  patch.updated_at = new Date().toISOString()

  const { error } = await access.db.from('lycees').update(patch).in('uai', uais)
  if (isMissingTable(error)) return missingMigrationResponse()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (logs.length) {
    const { data: me } = await access.db.from('rdv_users').select('name').eq('id', access.ctx.appUserId).maybeSingle()
    const rows = uais.flatMap(uai => logs.map(l => ({
      uai, kind: l.kind, content: l.text, author_id: access.ctx.appUserId, author_name: (me?.name as string) ?? null,
    })))
    for (let i = 0; i < rows.length; i += 500) {
      await access.db.from('lycee_activities').insert(rows.slice(i, i + 500))
    }
  }
  return NextResponse.json({ ok: true, updated: uais.length })
}
