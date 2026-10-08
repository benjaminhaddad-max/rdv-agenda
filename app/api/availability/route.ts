import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { addParisDays, parisMidnightUtc } from '@/lib/date-paris'
import { isUserUnavailable, loadUnavailability, openSlotsForDay } from '@/lib/unavailability'
import { weekStartISO } from '@/lib/week'

/**
 * /api/availability — disponibilites des closers PAR SEMAINE.
 *
 * Modes :
 *  - GET ?commercial_id=X&date=YYYY-MM-DD
 *      Slots (tranches 30min) de 9h a 21h pour ce closer ce jour-la, moins ses
 *      indisponibilites (lib/unavailability.ts). Les regles hebdo ne servent plus.
 *  - GET ?mode=rules&user_id=X&week_start=YYYY-MM-DD
 *      Regles brutes du closer pour la semaine indiquee. Si pas de
 *      week_start, on prend la semaine courante.
 *  - PUT { user_id, week_start, rules }
 *      Reecrit les regles d'un closer pour une semaine.
 *  - POST ?action=copy { user_id, from_week_start, to_week_start }
 *      Copie les regles d'une semaine source vers une cible.
 *  - DELETE ?user_id=X&week_start=YYYY-MM-DD
 *      Supprime toutes les regles d'un closer pour une semaine.
 *
 * Si la migration v26 n'est pas appliquee (table manquante), on retourne
 * 503 avec missing_migration='v26'. Le front affiche alors une banniere.
 */

const TABLE_NOT_EXIST_HINT = 'Migration v26 (rdv_availability_weekly) non appliquee. Va dans Disponibilites et clique sur "Activer le mode hebdomadaire".'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMissingTable(err: any): boolean {
  if (!err) return false
  const rawText = typeof err === 'string' ? err : ''
  const code = (err.code || '').toString().toUpperCase()
  const fullText = [
    rawText,
    err.message,
    err.details,
    err.hint,
    (() => {
      try { return JSON.stringify(err) } catch { return '' }
    })(),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    code === 'PGRST205' ||
    fullText.includes('could not find the table') ||
    fullText.includes('schema cache') ||
    fullText.includes('does not exist') ||
    (fullText.includes('relation') && fullText.includes('weekly'))
  )
}

type RuleInput = { day_of_week: number; start_time: string; end_time: string; is_active: boolean }

function toHHmm(value: string): string {
  if (!value) return value
  return value.slice(0, 5)
}

async function loadLegacyRules(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  return db
    .from('rdv_availability')
    .select('user_id, day_of_week, start_time, end_time, is_active')
    .eq('user_id', userId)
    .order('day_of_week', { ascending: true })
}

async function overwriteLegacyRules(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  rules: RuleInput[],
) {
  const { error: clearErr } = await db
    .from('rdv_availability')
    .delete()
    .eq('user_id', userId)
  if (clearErr) return { data: null, error: clearErr }

  if (rules.length === 0) return { data: [], error: null }

  const rows = rules.map(r => ({
    user_id: userId,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time,
    is_active: !!r.is_active,
  }))
  return db
    .from('rdv_availability')
    .insert(rows)
    .select('user_id, day_of_week, start_time, end_time, is_active')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode')
  const db = createServiceClient()

  if (mode === 'rules') {
    const userId = searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
    const weekStart = searchParams.get('week_start') || weekStartISO(new Date())

    const { data, error } = await db
      .from('rdv_availability_weekly')
      .select('user_id, week_start, day_of_week, start_time, end_time, is_active')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .order('day_of_week', { ascending: true })

    if (error) {
      if (isMissingTable(error)) {
        const legacy = await loadLegacyRules(db, userId)
        if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
        const rules = (legacy.data ?? []).map(r => ({
          ...r,
          week_start: weekStart,
          start_time: toHHmm(r.start_time as string),
          end_time: toHHmm(r.end_time as string),
        }))
        return NextResponse.json({ rules, week_start: weekStart, fallback: 'legacy_recurrent' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      const legacy = await loadLegacyRules(db, userId)
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
      const rules = (legacy.data ?? []).map(r => ({
        ...r,
        week_start: weekStart,
        start_time: toHHmm(r.start_time as string),
        end_time: toHHmm(r.end_time as string),
      }))
      return NextResponse.json({ rules, week_start: weekStart, fallback: 'legacy_recurrent_empty_week' })
    }
    const normalized = (data ?? []).map(r => ({
      ...r,
      start_time: toHHmm(r.start_time as string),
      end_time: toHHmm(r.end_time as string),
    }))
    return NextResponse.json({ rules: normalized, week_start: weekStart })
  }

  const commercialId = searchParams.get('commercial_id')
  const date = searchParams.get('date')
  if (!commercialId || !date) {
    return NextResponse.json({ error: 'commercial_id et date requis' }, { status: 400 })
  }

  // Nouveau fonctionnement (v56) : 9h-21h ouverts, moins les indisponibilités
  // du closer (perso ou équipe). Les règles hebdomadaires ne servent plus.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date invalide' }, { status: 400 })
  }
  const dayStartIso = parisMidnightUtc(date).toISOString()
  const dayEndIso = parisMidnightUtc(addParisDays(date, 1)).toISOString()
  const [blocks, { data: booked }] = await Promise.all([
    loadUnavailability(db, dayStartIso, dayEndIso).catch(() => []),
    db.from('rdv_appointments')
      .select('start_at, end_at')
      .eq('commercial_id', commercialId)
      .neq('status', 'annule')
      .gte('start_at', dayStartIso)
      .lt('start_at', dayEndIso),
  ])

  const slots = openSlotsForDay(date)
    .filter(s => !isUserUnavailable(blocks, commercialId, s.start, s.end))
    .map(s => {
      const bookingCount = (booked ?? []).filter(b =>
        new Date(b.start_at as string) < s.end && new Date(b.end_at as string) > s.start,
      ).length
      return { start: s.start.toISOString(), end: s.end.toISOString(), available: bookingCount < 3 }
    })
  return NextResponse.json(slots)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { user_id, week_start, rules } = body as {
    user_id?: string
    week_start?: string
    rules?: RuleInput[]
  }
  if (!user_id || !week_start || !Array.isArray(rules)) {
    return NextResponse.json({ error: 'user_id, week_start et rules requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error: delErr } = await db
    .from('rdv_availability_weekly')
    .delete()
    .eq('user_id', user_id)
    .eq('week_start', week_start)
  if (delErr) {
    if (isMissingTable(delErr)) {
      const legacy = await overwriteLegacyRules(db, user_id, rules)
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
      const mapped = (legacy.data ?? []).map(r => ({ ...r, week_start }))
      return NextResponse.json({ ok: true, rules: mapped, fallback: 'legacy_recurrent' })
    }
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const rows = rules.map(r => ({
    user_id, week_start,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time,
    is_active: !!r.is_active,
  }))
  if (rows.length === 0) {
    const legacy = await overwriteLegacyRules(db, user_id, rules)
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, rules: [], fallback: 'legacy_synced_empty' })
  }
  const { data, error } = await db.from('rdv_availability_weekly').insert(rows).select()
  if (error) {
    if (isMissingTable(error)) {
      const legacy = await overwriteLegacyRules(db, user_id, rules)
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
      const mapped = (legacy.data ?? []).map(r => ({ ...r, week_start }))
      return NextResponse.json({ ok: true, rules: mapped, fallback: 'legacy_recurrent_insert' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Keep legacy table in sync as a safety net for routes still using recurrent rules.
  const legacySync = await overwriteLegacyRules(db, user_id, rules)
  if (legacySync.error) {
    return NextResponse.json({
      ok: true,
      rules: data,
      warning: `weekly_saved_legacy_sync_failed:${legacySync.error.message}`,
    })
  }
  return NextResponse.json({ ok: true, rules: data })
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  if (action !== 'copy') {
    return NextResponse.json({ error: 'action inconnue' }, { status: 400 })
  }
  const body = await req.json()
  const { user_id, from_week_start, to_week_start } = body as {
    user_id?: string; from_week_start?: string; to_week_start?: string
  }
  if (!user_id || !from_week_start || !to_week_start) {
    return NextResponse.json({ error: 'user_id, from_week_start et to_week_start requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: source, error: srcErr } = await db
    .from('rdv_availability_weekly')
    .select('day_of_week, start_time, end_time, is_active')
    .eq('user_id', user_id)
    .eq('week_start', from_week_start)
  if (srcErr) {
    if (isMissingTable(srcErr)) {
      const legacy = await loadLegacyRules(db, user_id)
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
      return NextResponse.json({ ok: true, copied: (legacy.data ?? []).length, fallback: 'legacy_recurrent' })
    }
    return NextResponse.json({ error: srcErr.message }, { status: 500 })
  }
  if (!source || source.length === 0) {
    return NextResponse.json({ ok: true, copied: 0 })
  }

  await db.from('rdv_availability_weekly').delete().eq('user_id', user_id).eq('week_start', to_week_start)
  const rows = source.map(r => ({
    user_id, week_start: to_week_start,
    day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time, is_active: r.is_active,
  }))
  const { error } = await db.from('rdv_availability_weekly').insert(rows)
  if (error) {
    if (isMissingTable(error)) {
      const legacy = await loadLegacyRules(db, user_id)
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
      return NextResponse.json({ ok: true, copied: (legacy.data ?? []).length, fallback: 'legacy_recurrent' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, copied: rows.length })
}

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const weekStart = req.nextUrl.searchParams.get('week_start')
  if (!userId || !weekStart) {
    return NextResponse.json({ error: 'user_id et week_start requis' }, { status: 400 })
  }
  const db = createServiceClient()
  const { error } = await db
    .from('rdv_availability_weekly')
    .delete()
    .eq('user_id', userId)
    .eq('week_start', weekStart)
  if (error) {
    if (isMissingTable(error)) {
      const { error: legacyErr } = await db
        .from('rdv_availability')
        .delete()
        .eq('user_id', userId)
      if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 })
      return NextResponse.json({ ok: true, fallback: 'legacy_recurrent' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
