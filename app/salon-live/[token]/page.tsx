'use client'

import { use, useCallback, useEffect, useState } from 'react'

type LiveData = {
  title: string
  location: string
  days: string[]
  today: string
  total: number
  byDay: Record<string, number>
  byHour: Record<string, Record<string, number>>
  byClasse: Record<string, number>
  updatedAt: string
}

const REFRESH_MS = 30_000
const HOURS = Array.from({ length: 11 }, (_, i) => String(i + 9).padStart(2, '0')) // 09h → 19h

function dayLabel(day: string) {
  const s = new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function SalonLivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<LiveData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/salon-live/${token}`, { cache: 'no-store' })
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'Erreur')
        setData(json)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    document.title = data ? `${data.total} leads — ${data.title}` : 'Leads salon en direct'
  }, [data])

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 p-4">
        {error || 'Chargement…'}
      </main>
    )
  }

  const day = selectedDay || (data.days.includes(data.today) ? data.today : data.days[0])
  const hours = data.byHour[day] || {}
  const maxHour = Math.max(1, ...Object.values(hours))
  const classes = Object.entries(data.byClasse).sort((a, b) => b[1] - a[1])
  const maxClasse = Math.max(1, ...classes.map(([, n]) => n))

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            En direct
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">{data.title}</h1>
          <p className="text-sm text-slate-500">{data.location}</p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-900 text-white p-5">
            <div className="text-sm opacity-70">Total leads</div>
            <div className="text-5xl font-bold tabular-nums mt-1">{data.total}</div>
          </div>
          {data.days.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`rounded-2xl p-5 text-left border transition ${
                d === day ? 'bg-white border-slate-900' : 'bg-white border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-sm text-slate-500">
                {dayLabel(d)}
                {d === data.today ? ' · aujourd’hui' : ''}
              </div>
              <div className="text-4xl font-bold tabular-nums mt-1">{data.byDay[d] ?? 0}</div>
            </button>
          ))}
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-4">Leads par heure — {dayLabel(day)}</h2>
          <div className="flex items-end gap-1.5 h-40">
            {HOURS.map((h) => {
              const n = hours[h] || 0
              return (
                <div key={h} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-xs tabular-nums text-slate-600 mb-1">{n || ''}</div>
                  <div
                    className="w-full rounded-t-md bg-sky-500"
                    style={{ height: `${(n / maxHour) * 100}%`, minHeight: n ? 4 : 1, opacity: n ? 1 : 0.15 }}
                  />
                  <div className="text-[11px] text-slate-400 mt-1">{h}h</div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Par classe (2 jours)</h2>
          {classes.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun lead pour l’instant.</p>
          ) : (
            <ul className="space-y-2">
              {classes.map(([c, n]) => (
                <li key={c} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate">{c}</span>
                  <span className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <span className="block h-full bg-sky-500 rounded-full" style={{ width: `${(n / maxClasse) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums font-medium">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-400 text-center">
          Mis à jour à{' '}
          {new Date(data.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {' · '}actualisation automatique toutes les 30 s{error ? ' · connexion perdue, nouvelle tentative…' : ''}
        </p>
      </div>
    </main>
  )
}
