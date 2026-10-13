'use client'

/**
 * Ads Dashboard · Overview — saisonnalité : investissement, leads et CPL mois par
 * mois (Meta + Google), sur les 12 derniers mois ou une année civile.
 *
 * Leads CRM suivis depuis avril 2026 : avant, on affiche les leads déclarés par
 * Meta / Google (marqués *), seuls disponibles.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalendarRange } from 'lucide-react'
import { CrmV2Card, CrmV2Spinner } from '@/components/crm-v2/primitives'
import { AdsPillSelect } from '@/components/crm-v2/marketing2/ads/ui'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Premier mois où les leads CRM sont suivis */
const CRM_LEADS_SINCE = '2026-04'

type Part = { spend: number; leads: number; platform_leads: number } | null
type MonthRow = { key: string; since: string; until: string; partial: boolean; meta?: Part; google?: Part }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function monthsFor(period: string, now = new Date()): MonthRow[] {
  const today = ymd(now)
  const starts: Date[] = []
  if (period === 'rolling') {
    for (let i = 11; i >= 0; i--) starts.push(new Date(now.getFullYear(), now.getMonth() - i, 1, 12))
  } else {
    const y = Number(period)
    for (let m = 0; m < 12; m++) starts.push(new Date(y, m, 1, 12))
  }
  return starts
    .filter((s) => ymd(s) <= today)
    .map((s) => {
      const end = ymd(new Date(s.getFullYear(), s.getMonth() + 1, 0, 12))
      return { key: ymd(s).slice(0, 7), since: ymd(s), until: end < today ? end : today, partial: end >= today }
    })
}

async function fetchPart(url: string): Promise<Part> {
  try {
    const res = await fetch(url)
    const j = await res.json()
    if (!res.ok || !j.totals) return null
    return { spend: j.totals.spend || 0, leads: j.totals.leads || 0, platform_leads: j.totals.platform_leads || 0 }
  } catch {
    return null
  }
}

/** Exécute les tâches avec au plus `n` requêtes en parallèle. */
async function pool(tasks: Array<() => Promise<void>>, n: number) {
  const queue = [...tasks]
  await Promise.all(Array.from({ length: n }, async () => { for (let t = queue.shift(); t; t = queue.shift()) await t() }))
}

export default function AdsSeasonality({ accountId, hasMeta, refreshToken, currency, isMobile }: {
  accountId: string
  hasMeta: boolean
  refreshToken: number
  currency: string
  isMobile: boolean
}) {
  const thisYear = new Date().getFullYear()
  const [period, setPeriod] = useState('rolling')
  // Résultats par source et par mois (clé « meta|AAAA-MM-JJ|AAAA-MM-JJ ») ; absent = en chargement
  const [parts, setParts] = useState<Record<string, Part>>({})
  const months = useMemo(() => monthsFor(period), [period])
  const metaOn = hasMeta && !!accountId
  const rows: MonthRow[] = months.map((m) => ({
    ...m,
    meta: metaOn ? parts[`meta|${accountId}|${m.since}|${m.until}|${refreshToken}`] : null,
    google: parts[`google|${m.since}|${m.until}|${refreshToken}`],
  }))

  useEffect(() => {
    let cancelled = false
    const force = refreshToken > 0 ? '&force=1' : ''
    const tasks: Array<() => Promise<void>> = []
    const add = (key: string, url: string) => tasks.push(async () => {
      const v = await fetchPart(url)
      if (!cancelled) setParts((prev) => ({ ...prev, [key]: v }))
    })
    for (const m of months) {
      const range = `date_preset=custom&since=${m.since}&until=${m.until}${force}`
      if (metaOn) add(`meta|${accountId}|${m.since}|${m.until}|${refreshToken}`, `/api/meta/ads/insights?account_id=${encodeURIComponent(accountId)}&level=campaign&${range}`)
      add(`google|${m.since}|${m.until}|${refreshToken}`, `/api/google-ads/insights?${range}`)
    }
    pool(tasks, 4)
    return () => { cancelled = true }
  }, [months, accountId, metaOn, refreshToken])

  const computed = rows.map((r) => {
    const loading = r.meta === undefined || r.google === undefined
    const crm = r.key >= CRM_LEADS_SINCE
    const spend = (r.meta?.spend || 0) + (r.google?.spend || 0)
    const leads = crm
      ? (r.meta?.leads || 0) + (r.google?.leads || 0)
      : (r.meta?.platform_leads || 0) + (r.google?.platform_leads || 0)
    const failed = r.meta === null && r.google === null
    return { ...r, loading, failed, crm, spend, leads, cpl: leads > 0 ? spend / leads : null }
  })

  const done = computed.filter((r) => !r.loading && !r.failed)
  const total = done.reduce((a, r) => ({ spend: a.spend + r.spend, leads: a.leads + r.leads }), { spend: 0, leads: 0 })
  const avgCpl = total.leads > 0 ? total.spend / total.leads : null
  const maxSpend = Math.max(1, ...done.map((r) => r.spend))
  const maxLeads = Math.max(1, ...done.map((r) => r.leads))
  const anyPlatform = computed.some((r) => !r.crm)
  const allLoaded = computed.every((r) => !r.loading)

  const cur = (n: number) => {
    try { return n.toLocaleString('fr-FR', { style: 'currency', currency, maximumFractionDigits: n >= 1000 ? 0 : 2 }) } catch { return `${n.toFixed(2)} ${currency}` }
  }
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    const s = new Date(y, m - 1, 1, 12).toLocaleDateString('fr-FR', { month: isMobile ? 'short' : 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  // CPL : vert sous la moyenne de la période, rouge au-dessus de +25 %
  const cplColor = (v: number | null) => {
    if (v === null || avgCpl === null) return crmV2.text
    if (v <= avgCpl * 0.9) return crmV2.successStrong
    if (v >= avgCpl * 1.25) return '#dc2626'
    return crmV2.text
  }

  return (
    <CrmV2Card style={{ padding: isMobile ? 14 : 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', color: crmV2.textMuted }}><CalendarRange size={16} /></span>
        <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Saisonnalité · Meta + Google
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <AdsPillSelect value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Période de saisonnalité">
            <option value="rolling">12 derniers mois</option>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </AdsPillSelect>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isMobile ? 420 : undefined }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mois</th>
              <th style={th}>Investissement</th>
              <th style={th}>Leads</th>
              <th style={th}>CPL</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((r) => (
              <tr key={r.key}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  {monthLabel(r.key)}
                  {r.partial && <span style={{ fontWeight: 500, color: crmV2.textFaint, fontSize: 11 }}> · en cours</span>}
                </td>
                {r.loading ? (
                  <td style={td} colSpan={3}><span style={{ color: crmV2.textFaint, fontSize: 12 }}>Chargement…</span></td>
                ) : r.failed ? (
                  <td style={td} colSpan={3}><span style={{ color: crmV2.textFaint, fontSize: 12 }}>Données indisponibles</span></td>
                ) : (
                  <>
                    <td style={td}><Bar value={r.spend} max={maxSpend} color="#6366f1" label={cur(r.spend)} /></td>
                    <td style={td}><Bar value={r.leads} max={maxLeads} color={crmV2.success} label={`${r.leads.toLocaleString('fr-FR')}${r.crm ? '' : ' *'}`} /></td>
                    <td style={{ ...td, fontWeight: 700, color: cplColor(r.cpl) }}>{r.cpl !== null ? cur(r.cpl) : '—'}</td>
                  </>
                )}
              </tr>
            ))}
            {computed.length === 0 && (
              <tr><td style={{ ...td, textAlign: 'center', color: crmV2.textFaint }} colSpan={4}>Aucun mois sur cette période</td></tr>
            )}
          </tbody>
          {done.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ ...tf, textAlign: 'left' }}>Total{allLoaded ? '' : ' (en cours de chargement)'}</td>
                <td style={tf}>{cur(total.spend)}</td>
                <td style={tf}>{total.leads.toLocaleString('fr-FR')}</td>
                <td style={tf}>{avgCpl !== null ? cur(avgCpl) : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!allLoaded && done.length === 0 && <CrmV2Spinner />}
      <div style={{ fontSize: 11.5, color: crmV2.textFaint, marginTop: 10, lineHeight: 1.5 }}>
        CPL en vert : au moins 10 % sous la moyenne de la période · en rouge : 25 % au-dessus.
        {anyPlatform && ' * Avant avril 2026 : leads déclarés par Meta / Google (leads CRM suivis depuis avril 2026).'}
      </div>
    </CrmV2Card>
  )
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{ flex: 1, maxWidth: 140, height: 6, borderRadius: 3, background: crmV2.bgMuted, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ minWidth: 76, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: crmV2.text }}>{label}</span>
    </div>
  )
}

const th: CSSProperties = {
  textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  color: crmV2.textFaint, borderBottom: `1px solid ${crmV2.border}`, whiteSpace: 'nowrap',
}
const td: CSSProperties = {
  textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${crmV2.borderLight}`, whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums', color: crmV2.text,
}
const tf: CSSProperties = { ...td, fontWeight: 800, borderBottom: 'none', borderTop: `2px solid ${crmV2.border}` }
