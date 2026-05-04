import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/admin/errors — liste des logs d'erreurs (paginée, filtrable)
 *   ?level=error|warn|info
 *   ?label=...      filtre exact sur le label
 *   ?resolved=0|1
 *   ?limit=50       (max 200)
 *   ?offset=0
 *
 * PATCH /api/admin/errors  body { id, resolved } — marquer une erreur réglée
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const level = sp.get('level') || ''
  const label = sp.get('label') || ''
  const resolved = sp.get('resolved')
  const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200)
  const offset = parseInt(sp.get('offset') || '0', 10)

  const db = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.from('crm_error_logs')
    .select('id, level, label, message, stack, context, request_path, request_method, resolved, occurred_at, resolved_at, resolved_by', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (level) q = q.eq('level', level)
  if (label) q = q.eq('label', label)
  if (resolved === '1') q = q.eq('resolved', true)
  if (resolved === '0') q = q.eq('resolved', false)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stats par label sur les 7 derniers jours (top 10)
  const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data: byLabel } = await db.from('crm_error_logs')
    .select('label, level')
    .gte('occurred_at', sinceIso)
    .eq('resolved', false)
    .limit(5000)

  const stats: Record<string, { error: number; warn: number; info: number; total: number }> = {}
  for (const row of (byLabel ?? []) as Array<{ label: string; level: string }>) {
    const s = stats[row.label] || (stats[row.label] = { error: 0, warn: 0, info: 0, total: 0 })
    if (row.level === 'error') s.error++
    else if (row.level === 'warn') s.warn++
    else s.info++
    s.total++
  }
  const topLabels = Object.entries(stats)
    .map(([label, s]) => ({ label, ...s }))
    .sort((a, b) => b.error - a.error || b.total - a.total)
    .slice(0, 10)

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    limit,
    offset,
    stats: { topLabels, sinceIso },
  })
}

export async function PATCH(req: NextRequest) {
  let body: { id?: string; resolved?: boolean; resolved_by?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const db = createServiceClient()
  const update: Record<string, unknown> = {
    resolved: body.resolved !== false,
    resolved_at: body.resolved !== false ? new Date().toISOString() : null,
    resolved_by: body.resolved !== false ? (body.resolved_by || 'admin') : null,
  }
  const { error } = await db.from('crm_error_logs').update(update).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const olderThanDays = parseInt(sp.get('older_than_days') || '30', 10)
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString()

  const db = createServiceClient()
  const { error, count } = await db.from('crm_error_logs')
    .delete({ count: 'exact' })
    .lt('occurred_at', cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: count ?? 0 })
}
