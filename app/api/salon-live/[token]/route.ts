import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { SALON_LIVE } from '@/lib/salon-live'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'

type Params = { params: Promise<{ token: string }> }

const TZ = 'Europe/Paris'
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })

/**
 * GET /api/salon-live/[token] — compteurs publics des leads d'un salon.
 * Ne renvoie que des agrégats : aucune donnée personnelle.
 */
export async function GET(_req: Request, { params }: Params) {
  const { token } = await params
  const cfg = SALON_LIVE[token]
  if (!cfg) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })

  // Fenêtre UTC élargie autour des jours du salon, filtrée ensuite en heure de Paris.
  const from = new Date(`${cfg.days[0]}T00:00:00Z`)
  from.setUTCHours(from.getUTCHours() - 3)
  const to = new Date(`${cfg.days[cfg.days.length - 1]}T23:59:59Z`)
  to.setUTCHours(to.getUTCHours() + 3)

  const db = createServiceClient()
  const { data, error } = await db
    .from('form_submissions')
    .select('data, submitted_at')
    .in('form_id', cfg.formIds)
    .gte('submitted_at', from.toISOString())
    .lte('submitted_at', to.toISOString())
    .limit(5000)
  if (error) return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 })

  const byDay: Record<string, number> = Object.fromEntries(cfg.days.map((d) => [d, 0]))
  const byHour: Record<string, Record<string, number>> = Object.fromEntries(cfg.days.map((d) => [d, {}]))
  const byClasse: Record<string, number> = {}

  for (const s of data || []) {
    const at = new Date(s.submitted_at)
    const day = dayFmt.format(at)
    if (!(day in byDay)) continue
    byDay[day]++
    const h = hourFmt.format(at)
    byHour[day][h] = (byHour[day][h] || 0) + 1
    const raw = (s.data as Record<string, unknown> | null)?.classe_actuelle
    const classe = normalizeClasseActuelle(raw) || 'Non renseignée'
    byClasse[classe] = (byClasse[classe] || 0) + 1
  }

  return NextResponse.json(
    {
      title: cfg.title,
      location: cfg.location,
      days: cfg.days,
      today: dayFmt.format(new Date()),
      total: Object.values(byDay).reduce((a, b) => a + b, 0),
      byDay,
      byHour,
      byClasse,
      updatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
