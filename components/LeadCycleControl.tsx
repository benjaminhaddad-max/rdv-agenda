'use client'

/**
 * Statut du lead + cycles de vente (migration v80).
 *
 * - « Cycle en cours » : ce qu'on essaie de vendre maintenant (produit + saison),
 *   le parcours des statuts et les RDV de ce cycle.
 * - « On lâche : passer à un nouveau cycle » : on dit comment se termine le
 *   cycle (perdu / reporté / gagné), on choisit le produit suivant (suggestions
 *   selon la classe) et le lead repart en « Recyclé ».
 * - « Historique du lead » : saison par saison — cycles, formations visées
 *   (anciennes transactions), RDV et statuts successifs (depuis 2023).
 * Sans la migration v80, on retombe sur un simple sélecteur de statut.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, Flag, History, Pencil, RefreshCcw, Settings2, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { LEAD_STATUS_OPTIONS_FALLBACK } from '@/lib/crm-constants'
import {
  CYCLE_ETAT_COLORS, CYCLE_ETAT_LABELS, RECYCLE_STATUS,
  cycleProductLabel, currentSeason, leadStatusColor, seasonChoices, seasonOf, shortSeason, suggestProducts,
  type CycleEtat, type CycleHistoryRdv, type CycleProduct, type SalesCycle,
} from '@/lib/sales-cycles'
import CycleProductsManager from './CycleProductsManager'

type StatusPoint = { value: string; at: string; source?: string | null }
type OldDeal = { id: string; saison: string | null; formation: string | null; stage: string | null; at: string | null }
type CyclesPayload = {
  available: boolean
  contact: { hubspot_contact_id: string; firstname?: string | null; lastname?: string | null; hs_lead_status: string | null; classe_actuelle: string | null; createdate: string | null }
  current?: SalesCycle | null
  history?: SalesCycle[]
  products?: CycleProduct[]
  rdvs?: CycleHistoryRdv[]
  status_history?: StatusPoint[]
  deals?: OldDeal[]
}

export type CyclePanel = null | 'new' | 'close' | 'edit' | 'products'

const RDV_STATUS_LABELS: Record<string, string> = {
  confirme: 'Confirmé', confirme_prospect: 'Confirmé', non_assigne: 'Non assigné', annule: 'Annulé',
  no_show: 'No-show', a_travailler: 'À travailler', pre_positif: 'Pré-positif', positif: 'Positif', negatif: 'Négatif',
}

function tint(hex: string, a: number) {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const fmtDay = (iso: string) => format(new Date(iso), 'd MMM yyyy', { locale: fr })
/** 1er août de l'année de début de la saison */
const seasonStart = (season: string) => `${season.slice(0, 4)}-08-01T00:00:00.000Z`

const pill = (color: string, active = true): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: active ? tint(color, 0.10) : crmV2.bg,
  border: `1px solid ${active ? tint(color, 0.40) : crmV2.borderStrong}`,
  borderRadius: 999, padding: '3px 10px',
  color: active ? color : crmV2.textMuted,
  fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
})

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999,
  padding: '5px 12px', color: crmV2.text, fontSize: 12, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const primaryBtn: React.CSSProperties = {
  ...ghostBtn, background: '#6d28d9', borderColor: '#6d28d9', color: '#fff',
}

const inputStyle: React.CSSProperties = {
  background: '#fff', border: `1px solid ${crmV2.borderStrong}`, borderRadius: 10,
  padding: '6px 10px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', minWidth: 0,
}

const cardStyle: React.CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
  padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
}

const panelStyle: React.CSSProperties = {
  background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12,
  padding: '12px', display: 'flex', flexDirection: 'column', gap: 12,
}

const miniLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
}

const stepLabel: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: crmV2.text }

/** Supprime les répétitions consécutives et garde l'ordre chronologique. */
function trail(points: StatusPoint[]): StatusPoint[] {
  const chrono = [...points].sort((a, b) => a.at.localeCompare(b.at))
  const out: StatusPoint[] = []
  for (const p of chrono) if (!out.length || out[out.length - 1].value !== p.value) out.push(p)
  return out
}

export default function LeadCycleControl({
  contactId,
  canManageProducts = false,
  initialPanel = null,
  onStatusChange,
}: {
  contactId: string
  /** Admin : peut modifier le catalogue de produits */
  canManageProducts?: boolean
  /** Panneau ouvert d'entrée (ex. « new » depuis le tableau du CRM) */
  initialPanel?: CyclePanel
  onStatusChange?: (status: string | null) => void
}) {
  const [data, setData] = useState<CyclesPayload | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<CyclePanel>(initialPanel)
  const [showHistory, setShowHistory] = useState(initialPanel === null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/cycles`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setData(await res.json())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [contactId])

  useEffect(() => { load() }, [load])

  const status = data?.contact.hs_lead_status ?? null
  const products = useMemo(() => data?.products ?? [], [data])
  const recorded = data?.current ?? null
  // Le cycle enregistré correspond-il au statut actuel ? (sinon : cycle pas encore suivi)
  const current = recorded && (recorded.status ?? '').trim() === (status ?? '').trim() ? recorded : null

  async function changeStatus(next: string) {
    if (!data) return
    // « Recyclé » = lead relancé sur un nouveau cycle → on passe par le formulaire dédié
    if (next === RECYCLE_STATUS && data.available) { setPanel('new'); return }
    const prev = status
    setData({ ...data, contact: { ...data.contact, hs_lead_status: next || null } })
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hs_lead_status: next || null }),
      })
      if (!res.ok) throw new Error()
      onStatusChange?.(next || null)
      if (data.available) await load()
    } catch {
      setData(d => d && { ...d, contact: { ...d.contact, hs_lead_status: prev } })
      setError('Échec de l’enregistrement du statut')
    } finally {
      setBusy(false)
    }
  }

  async function call(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Échec de l’enregistrement')
        return false
      }
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  const statusOptions = useMemo(() => {
    const base = LEAD_STATUS_OPTIONS_FALLBACK.some(o => o.id === RECYCLE_STATUS)
      ? LEAD_STATUS_OPTIONS_FALLBACK
      : [{ id: RECYCLE_STATUS, label: RECYCLE_STATUS }, ...LEAD_STATUS_OPTIONS_FALLBACK]
    return status && !base.some(o => o.id === status) ? [{ id: status, label: status }, ...base] : base
  }, [status])

  const color = leadStatusColor(status)
  const loaded = !!data

  const statusRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
      <Flag size={14} style={{ color: crmV2.gold, flexShrink: 0 }} />
      <span>Statut du lead :</span>
      <select
        value={status ?? ''}
        disabled={!loaded || busy}
        onChange={e => changeStatus(e.target.value)}
        aria-label="Statut du lead"
        style={{ ...pill(color, !!status), cursor: busy ? 'wait' : 'pointer', outline: 'none', maxWidth: '100%', opacity: loaded ? 1 : 0.6 }}
      >
        {!loaded && <option value={status ?? ''}>{loadError ? 'Indisponible' : 'Chargement…'}</option>}
        {loaded && <option value="">— Aucun statut —</option>}
        {loaded && statusOptions.map(o => (
          <option key={o.id} value={o.id}>{o.id === RECYCLE_STATUS && data?.available ? 'Recyclé (relancer sur un nouveau cycle…)' : o.label}</option>
        ))}
      </select>
      {busy && <span style={{ fontSize: 11 }}>Enregistrement…</span>}
    </div>
  )

  if (!data?.available) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {statusRow}
        {error && <span style={{ fontSize: 11, color: '#d13a41', fontWeight: 600 }}>{error}</span>}
      </div>
    )
  }

  // ── Fenêtre du cycle en cours : depuis la fin du cycle précédent, sinon début de saison
  const history = data.history ?? []
  const curSaison = current?.saison ?? currentSeason()
  const lastClosed = history.map(c => c.closed_at).filter(Boolean).sort().pop() ?? null
  const windowStart = [lastClosed, seasonStart(curSaison)].filter(Boolean).sort().pop()!
  const inWindow = (iso: string) => iso >= windowStart

  const rdvs = data.rdvs ?? []
  const statusHistory = data.status_history ?? []
  const curRdvs = rdvs.filter(r => inWindow(r.start_at))
  const curEvents: StatusPoint[] = (current?.events ?? [])
    .filter(e => (e.kind === 'status' || e.kind === 'open') && e.new_value)
    .map(e => ({ value: e.new_value!, at: e.at }))
  const curTrail = trail([...statusHistory.filter(h => inWindow(h.at)), ...curEvents, ...(status ? [{ value: status, at: new Date().toISOString() }] : [])])

  const curProduct = current ? cycleProductLabel(current, products) : null
  const curEtat: CycleEtat = current?.etat ?? 'ouvert'
  const contactLabel = [data.contact.firstname, data.contact.lastname].filter(Boolean).join(' ') || 'ce lead'

  // ── Historique par saison (tout ce qui est avant la fenêtre du cycle en cours)
  const seasons = new Map<string, { cycles: SalesCycle[]; rdvs: CycleHistoryRdv[]; statuses: StatusPoint[]; deals: OldDeal[] }>()
  const bucket = (s: string) => {
    if (!seasons.has(s)) seasons.set(s, { cycles: [], rdvs: [], statuses: [], deals: [] })
    return seasons.get(s)!
  }
  for (const c of history) bucket(c.saison).cycles.push(c)
  if (recorded && !current) bucket(recorded.saison).cycles.push(recorded)
  for (const r of rdvs) if (!inWindow(r.start_at)) bucket(seasonOf(r.start_at)).rdvs.push(r)
  for (const h of statusHistory) if (!inWindow(h.at)) bucket(seasonOf(h.at)).statuses.push(h)
  for (const d of data.deals ?? []) if (d.saison && d.saison < curSaison) bucket(d.saison).deals.push(d)
  const seasonList = [...seasons.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {statusRow}

      {/* ── Cycle en cours ─────────────────────────────────────────── */}
      <div style={{ ...cardStyle, borderLeft: `3px solid ${CYCLE_ETAT_COLORS[curEtat]}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={miniLabel}>Cycle de vente en cours</span>
          <span style={{ ...pill(CYCLE_ETAT_COLORS[curEtat]), padding: '1px 8px', fontSize: 11 }}>{CYCLE_ETAT_LABELS[curEtat]}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: curProduct ? crmV2.text : crmV2.textMuted }}>
            {curProduct ?? 'Produit pas encore choisi'}
          </span>
          <span style={{ fontSize: 13, color: crmV2.textMuted }}>· saison {curSaison}</span>
          {current && (
            <button type="button" onClick={() => setPanel(panel === 'edit' ? null : 'edit')} style={{ ...ghostBtn, padding: '2px 8px', fontSize: 11 }}>
              <Pencil size={10} /> {curProduct ? 'Modifier' : 'Choisir le produit'}
            </button>
          )}
        </div>
        {current?.motif && <div style={{ fontSize: 12, color: crmV2.textMuted }}>Motif : {current.motif}</div>}

        {curTrail.length > 0 && <StatusTrail points={curTrail} label="Parcours" />}
        {curRdvs.map(r => <RdvLine key={r.id} rdv={r} />)}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <button type="button" onClick={() => setPanel(panel === 'new' ? null : 'new')} disabled={busy} style={primaryBtn}>
            <RefreshCcw size={12} /> On lâche : passer à un nouveau cycle
          </button>
          {current && curEtat === 'ouvert' && (
            <button type="button" onClick={() => setPanel(panel === 'close' ? null : 'close')} disabled={busy} style={ghostBtn}>
              <Check size={12} /> Clore sans relancer
            </button>
          )}
          {current && curEtat !== 'ouvert' && (
            <button type="button" onClick={() => call(`/api/crm/cycles/${current.id}`, 'PATCH', { etat: 'ouvert' })} disabled={busy} style={ghostBtn}>
              Rouvrir ce cycle
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: '#d13a41', fontWeight: 600 }}>{error}</div>}

      {panel === 'edit' && current && (
        <EditCyclePanel
          cycle={current}
          products={products}
          busy={busy}
          onCancel={() => setPanel(null)}
          onSave={async patch => { if (await call(`/api/crm/cycles/${current.id}`, 'PATCH', patch)) setPanel(null) }}
        />
      )}

      {panel === 'close' && current && (
        <CloseCyclePanel
          label={curProduct ? `${curProduct} ${shortSeason(curSaison)}` : `le cycle ${curSaison}`}
          busy={busy}
          onCancel={() => setPanel(null)}
          onSave={async (etat, motif) => { if (await call(`/api/crm/cycles/${current.id}`, 'PATCH', { etat, motif })) setPanel(null) }}
        />
      )}

      {panel === 'new' && (
        <NewCyclePanel
          contactLabel={contactLabel}
          classe={data.contact.classe_actuelle}
          products={products}
          mustClose={curEtat === 'ouvert' && (!!current || !!status)}
          currentLabel={curProduct ? `${curProduct} ${shortSeason(curSaison)}` : `le cycle ${curSaison}${status ? ` (statut « ${status} »)` : ''}`}
          busy={busy}
          canManageProducts={canManageProducts}
          onManageProducts={() => setPanel('products')}
          onCancel={() => setPanel(null)}
          onSave={async payload => {
            if (await call(`/api/crm/contacts/${contactId}/cycles`, 'POST', payload)) {
              setPanel(null)
              setShowHistory(true)
              onStatusChange?.(payload.status)
            }
          }}
        />
      )}

      {panel === 'products' && <CycleProductsManager onClose={() => { setPanel('new'); load() }} />}

      {/* ── Historique par saison ──────────────────────────────────── */}
      {seasonList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: crmV2.link, display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}
          >
            {showHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <History size={13} />
            Historique du lead ({seasonList.map(([s]) => shortSeason(s)).join(', ')})
          </button>
          {showHistory && seasonList.map(([s, b]) => <SeasonBlock key={s} season={s} block={b} products={products} />)}
        </div>
      )}
    </div>
  )
}

function StatusTrail({ points, label }: { points: StatusPoint[]; label: string }) {
  const [all, setAll] = useState(false)
  const shown = all || points.length <= 8 ? points : [...points.slice(0, 2), null, ...points.slice(-5)]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 11, color: crmV2.textMuted }}>
      <span style={{ fontWeight: 700, marginRight: 2 }}>{label} :</span>
      {shown.map((p, i) => p === null ? (
        <button key={`more-${i}`} type="button" onClick={() => setAll(true)} style={{ all: 'unset', cursor: 'pointer', color: crmV2.link, fontWeight: 700 }}>
          … {points.length - 7} autres
        </button>
      ) : (
        <span key={`${p.at}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <ArrowRight size={10} color={crmV2.textFaint} />}
          <span title={fmtDay(p.at)} style={{ ...pill(leadStatusColor(p.value)), padding: '0 7px', fontSize: 11 }}>{p.value}</span>
        </span>
      ))}
    </div>
  )
}

function RdvLine({ rdv }: { rdv: CycleHistoryRdv }) {
  const outcome = RDV_STATUS_LABELS[rdv.status] ?? rdv.status
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: crmV2.textMuted }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <CalendarDays size={12} color={crmV2.gold} />
        <span>RDV du {fmtDay(rdv.start_at)}</span>
        {rdv.closer && <span>avec {rdv.closer}</span>}
        {rdv.formation && <span>· {rdv.formation}</span>}
        <span>·</span>
        <strong style={{ color: rdv.status === 'negatif' ? '#dc2626' : rdv.status === 'positif' ? '#15803d' : crmV2.text }}>{outcome}</strong>
        {rdv.negatif && <span style={{ color: '#dc2626' }}>— {rdv.negatif}</span>}
      </div>
      {rdv.summary && (
        <div style={{ paddingLeft: 17, fontSize: 11, color: crmV2.textFaint, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          « {rdv.summary} »
        </div>
      )}
    </div>
  )
}

function SeasonBlock({ season, block, products }: {
  season: string
  block: { cycles: SalesCycle[]; rdvs: CycleHistoryRdv[]; statuses: StatusPoint[]; deals: OldDeal[] }
  products: CycleProduct[]
}) {
  const statuses = trail(block.statuses)
  return (
    <div style={{ ...cardStyle, background: crmV2.bgHover }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>Saison {season}</div>
      {block.cycles.map(c => {
        const label = cycleProductLabel(c, products) ?? 'Produit non précisé'
        return (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: CYCLE_ETAT_COLORS[c.etat], flexShrink: 0 }} />
            <strong style={{ color: crmV2.text }}>{label}</strong>
            <span style={{ ...pill(CYCLE_ETAT_COLORS[c.etat]), padding: '0 7px', fontSize: 11 }}>{CYCLE_ETAT_LABELS[c.etat]}</span>
            {c.motif && <span style={{ color: crmV2.textMuted }}>— {c.motif}</span>}
            <span style={{ color: crmV2.textFaint, fontSize: 11 }}>
              {fmtDay(c.opened_at)}{c.closed_at ? ` → ${fmtDay(c.closed_at)}` : ''}
            </span>
          </div>
        )
      })}
      {block.deals.map(d => (
        <div key={d.id} style={{ fontSize: 12, color: crmV2.textMuted }}>
          Formation visée : <strong style={{ color: crmV2.text }}>{d.formation ?? 'non précisée'}</strong>
          {d.stage && <> · étape « {d.stage} »</>}
        </div>
      ))}
      {block.rdvs.map(r => <RdvLine key={r.id} rdv={r} />)}
      {statuses.length > 0 && <StatusTrail points={statuses} label="Statuts" />}
    </div>
  )
}

function ProductSelect({ products, value, onChange }: { products: CycleProduct[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
      <option value="">Produit à définir plus tard</option>
      {products.filter(p => p.active).map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
      <option value="__autre">Autre (texte libre)…</option>
    </select>
  )
}

function SeasonSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const choices = seasonChoices()
  const list = choices.includes(value) ? choices : [value, ...choices]
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {list.map(s => <option key={s} value={s}>Saison {s}</option>)}
    </select>
  )
}

function PanelHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>{title}</div>
      <button type="button" onClick={onCancel} aria-label="Fermer" style={{ ...ghostBtn, padding: 4, borderRadius: 999 }}><X size={12} /></button>
    </div>
  )
}

function EditCyclePanel({ cycle, products, busy, onCancel, onSave }: {
  cycle: SalesCycle
  products: CycleProduct[]
  busy: boolean
  onCancel: () => void
  onSave: (patch: { product_code: string | null; product_label: string | null; saison: string }) => void
}) {
  const known = cycle.product_code && products.some(p => p.code === cycle.product_code)
  const [code, setCode] = useState(known ? cycle.product_code! : cycle.product_label ? '__autre' : '')
  const [free, setFree] = useState(known ? '' : cycle.product_label ?? '')
  const [saison, setSaison] = useState(cycle.saison)
  return (
    <div style={panelStyle}>
      <PanelHeader title="Qu’est-ce qu’on lui vend dans ce cycle ?" onCancel={onCancel} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ProductSelect products={products} value={code} onChange={setCode} />
        <SeasonSelect value={saison} onChange={setSaison} />
      </div>
      {code === '__autre' && <input value={free} onChange={e => setFree(e.target.value)} placeholder="Nom du produit" style={inputStyle} />}
      <PanelActions
        busy={busy}
        onCancel={onCancel}
        label="Enregistrer"
        onConfirm={() => onSave({
          product_code: code && code !== '__autre' ? code : null,
          product_label: code === '__autre' ? free.trim() || null : null,
          saison,
        })}
      />
    </div>
  )
}

const ETAT_CHOICES: { etat: CycleEtat; label: string; hint: string }[] = [
  { etat: 'perdu', label: 'Perdu', hint: 'il ne prendra pas ce produit' },
  { etat: 'reporte', label: 'Reporté', hint: 'pas maintenant, peut-être plus tard' },
  { etat: 'gagne', label: 'Gagné', hint: 'il a pris ce produit' },
]

function EtatButtons({ value, onChange }: { value: CycleEtat | null; onChange: (e: CycleEtat) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ETAT_CHOICES.map(c => (
        <button
          key={c.etat}
          type="button"
          onClick={() => onChange(c.etat)}
          style={{ ...pill(CYCLE_ETAT_COLORS[c.etat], value === c.etat), cursor: 'pointer', padding: '6px 12px', flexDirection: 'column', alignItems: 'flex-start', gap: 1, borderRadius: 10 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{value === c.etat && <Check size={11} />}{c.label}</span>
          <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>{c.hint}</span>
        </button>
      ))}
    </div>
  )
}

function CloseCyclePanel({ label, busy, onCancel, onSave }: { label: string; busy: boolean; onCancel: () => void; onSave: (etat: CycleEtat, motif: string) => void }) {
  const [etat, setEtat] = useState<CycleEtat | null>(null)
  const [motif, setMotif] = useState('')
  return (
    <div style={panelStyle}>
      <PanelHeader title={`Clore ${label} sans relancer`} onCancel={onCancel} />
      <EtatButtons value={etat} onChange={setEtat} />
      <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Pourquoi ? (trop cher, autre prépa, réorientation…)" style={inputStyle} />
      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
        Le statut du lead ne change pas. Pour le relancer sur autre chose, utilisez plutôt « On lâche : passer à un nouveau cycle ».
      </div>
      <PanelActions busy={busy} onCancel={onCancel} label="Clore le cycle" disabled={!etat} onConfirm={() => etat && onSave(etat, motif)} />
    </div>
  )
}

function NewCyclePanel({ contactLabel, classe, products, mustClose, currentLabel, busy, canManageProducts, onManageProducts, onCancel, onSave }: {
  contactLabel: string
  classe: string | null
  products: CycleProduct[]
  mustClose: boolean
  currentLabel: string
  busy: boolean
  canManageProducts: boolean
  onManageProducts: () => void
  onCancel: () => void
  onSave: (p: { saison: string; product_code: string | null; product_label: string | null; status: string; close_etat: CycleEtat | null; close_motif: string }) => void
}) {
  const suggestions = useMemo(() => suggestProducts(classe, products), [classe, products])
  const [code, setCode] = useState(suggestions[0]?.product.code ?? '')
  const [free, setFree] = useState('')
  const [saison, setSaison] = useState(suggestions[0]?.saison ?? currentSeason())
  const [closeEtat, setCloseEtat] = useState<CycleEtat | null>(null)
  const [motif, setMotif] = useState('')
  const [startStatus, setStartStatus] = useState(RECYCLE_STATUS)
  const cur = currentSeason()
  const groups = [
    { title: `À vendre cette saison (${shortSeason(cur)})`, items: suggestions.filter(s => s.thisSeason) },
    { title: 'Pour la saison suivante', items: suggestions.filter(s => !s.thisSeason) },
  ].filter(g => g.items.length)
  const chosenLabel = code === '__autre' ? free.trim() : products.find(p => p.code === code)?.label
  let step = 0
  const n = () => ++step

  return (
    <div style={{ ...panelStyle, border: '1px solid rgba(109,40,217,0.35)' }}>
      <PanelHeader title={`Passer ${contactLabel} sur un nouveau cycle`} onCancel={onCancel} />

      {mustClose && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={stepLabel}>{n()}. Comment se termine {currentLabel} ?</div>
          <EtatButtons value={closeEtat} onChange={setCloseEtat} />
          <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Pourquoi ? (facultatif : trop cher, autre prépa, veut attendre…)" style={inputStyle} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={stepLabel}>{n()}. Qu’est-ce qu’on lui vend maintenant ?</div>
          {canManageProducts && (
            <button type="button" onClick={onManageProducts} style={{ ...ghostBtn, padding: '2px 8px', fontSize: 11 }}>
              <Settings2 size={11} /> Gérer les produits
            </button>
          )}
        </div>
        {groups.length > 0 ? (
          <>
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>Suggestions pour un élève de <strong style={{ color: crmV2.text }}>{classe}</strong> :</div>
            {groups.map(g => (
              <div key={g.title} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: crmV2.textFaint, minWidth: 150 }}>{g.title}</span>
                {g.items.map(s => {
                  const sel = code === s.product.code && saison === s.saison
                  return (
                    <button key={`${s.product.code}-${s.saison}`} type="button" onClick={() => { setCode(s.product.code); setSaison(s.saison) }} style={{ ...pill('#6d28d9', sel), cursor: 'pointer' }}>
                      {sel && <Check size={11} />}
                      {s.product.label} {shortSeason(s.saison)}
                    </button>
                  )
                })}
              </div>
            ))}
            <div style={{ fontSize: 11, color: crmV2.textFaint }}>Ou n’importe quel produit :</div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>
            {classe ? `Pas de suggestion pour la classe « ${classe} » : choisissez le produit.` : 'Classe inconnue : choisissez le produit.'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ProductSelect products={products} value={code} onChange={setCode} />
          <SeasonSelect value={saison} onChange={setSaison} />
        </div>
        {code === '__autre' && <input value={free} onChange={e => setFree(e.target.value)} placeholder="Nom du produit" style={inputStyle} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={stepLabel}>{n()}. Statut de départ</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={startStatus} onChange={e => setStartStatus(e.target.value)} style={{ ...inputStyle, padding: '4px 8px' }}>
            {[RECYCLE_STATUS, 'A relancer', 'Nouveau', 'Nouveau - Chaud', 'En cours', 'RDV pris', 'A replanifier'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 11, color: crmV2.textFaint }}>
            {startStatus === RECYCLE_STATUS ? '« Recyclé » = lead déjà travaillé qu’on relance : il remonte dans les « Non traités » des télépros.' : ''}
          </span>
        </div>
      </div>

      <PanelActions
        busy={busy}
        onCancel={onCancel}
        primary
        label={`Valider : passer sur ${chosenLabel || 'un nouveau cycle'} ${shortSeason(saison)}`}
        disabled={(mustClose && !closeEtat) || (code === '__autre' && !free.trim())}
        onConfirm={() => onSave({
          saison,
          product_code: code && code !== '__autre' ? code : null,
          product_label: code === '__autre' ? free.trim() : null,
          status: startStatus,
          close_etat: closeEtat,
          close_motif: motif,
        })}
      />
      {mustClose && !closeEtat && <div style={{ fontSize: 11, color: crmV2.textFaint, textAlign: 'right' }}>Indiquez d’abord comment se termine le cycle actuel (étape 1).</div>}
    </div>
  )
}

function PanelActions({ busy, disabled = false, primary = false, label, onCancel, onConfirm }: {
  busy: boolean; disabled?: boolean; primary?: boolean; label: string; onCancel: () => void; onConfirm: () => void
}) {
  const base = primary ? primaryBtn : { ...ghostBtn, background: crmV2.primary, borderColor: crmV2.primary, color: '#fff' }
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={onCancel} style={ghostBtn}>Annuler</button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || disabled}
        style={{ ...base, opacity: busy || disabled ? 0.5 : 1, cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer', whiteSpace: 'normal', textAlign: 'left' }}
      >
        {busy ? 'Enregistrement…' : label}
      </button>
    </div>
  )
}
