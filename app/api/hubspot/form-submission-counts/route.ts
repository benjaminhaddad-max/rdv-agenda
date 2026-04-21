import { NextResponse } from 'next/server'
import { hubspotFetch } from '@/lib/hubspot'

export const maxDuration = 60

// Cache en mémoire (invalide au redémarrage) — évite de hammer l'API HubSpot
let cache: { at: number; data: Array<{ id: string; name: string; count: number }> } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * GET /api/hubspot/form-submission-counts?prefix=NS
 *
 * Retourne tous les formulaires HubSpot avec leur VRAI nombre de soumissions
 * (depuis l'API /form-integrations/v1), pas seulement le recent_conversion_event.
 *
 * Filtre optionnel par préfixe de nom (ex: prefix=NS pour "NS - ...").
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const prefix = url.searchParams.get('prefix')?.trim() || ''
  const limit = parseInt(url.searchParams.get('limit') || '50', 10)

  try {
    // ── 1. Liste tous les forms (cache 10 min) ──────────────────────────
    const now = Date.now()
    let allCounts: Array<{ id: string; name: string; count: number }>

    if (cache && now - cache.at < CACHE_TTL_MS) {
      allCounts = cache.data
    } else {
      // Récupère tous les forms
      const forms: Array<{ id: string; name: string }> = []
      let after: string | undefined
      let page = 0
      do {
        const qs = new URLSearchParams({ limit: '100', archived: 'false' })
        if (after) qs.set('after', after)
        const data = await hubspotFetch(`/marketing/v3/forms?${qs.toString()}`)
        for (const f of (data.results || []) as Array<{ id: string; name: string }>) {
          forms.push({ id: f.id, name: f.name })
        }
        after = data.paging?.next?.after
        page++
      } while (after && page < 10)

      // Pour chaque form, récupère le total de soumissions (paginé)
      // On parallélise par lots de 5 pour rester raisonnable sur les rate limits
      allCounts = []
      const BATCH = 5
      for (let i = 0; i < forms.length; i += BATCH) {
        const batch = forms.slice(i, i + BATCH)
        const results = await Promise.all(batch.map(async (f) => {
          try {
            let count = 0
            let after: string | undefined
            let iters = 0
            do {
              const path = `/form-integrations/v1/submissions/forms/${f.id}?limit=50${after ? `&after=${after}` : ''}`
              const d = await hubspotFetch(path)
              count += (d.results?.length || 0)
              after = d.paging?.next?.after
              iters++
              // max 100 pages = 5000 submissions par form (safety)
            } while (after && iters < 100)
            return { id: f.id, name: f.name, count }
          } catch {
            return { id: f.id, name: f.name, count: 0 }
          }
        }))
        allCounts.push(...results)
      }

      cache = { at: now, data: allCounts }
    }

    // ── 2. Filtre + tri ─────────────────────────────────────────────────
    let filtered = allCounts
    if (prefix) {
      const pre = prefix.toLowerCase()
      filtered = filtered.filter(f => f.name.toLowerCase().startsWith(pre))
    }

    filtered = filtered
      .filter(f => f.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    const total = filtered.reduce((s, f) => s + f.count, 0)

    return NextResponse.json({
      total,
      breakdown: filtered.map(f => ({ key: f.id, label: f.name, value: f.count })),
      cached: cache ? (now - cache.at < CACHE_TTL_MS) : false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
