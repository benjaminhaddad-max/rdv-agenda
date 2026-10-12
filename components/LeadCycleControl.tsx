'use client'

/**
 * Statut du lead + cycles de vente (migration v80).
 *
 * Le statut du lead est celui du cycle courant (ex. « Terminale Santé 26-27 ·
 * NRP2 »). On peut clore le cycle (gagné / perdu / reporté) ou en ouvrir un
 * nouveau sur un autre produit / une autre saison — le lead repart alors en
 * « Recyclé », pas en « Nouveau », avec tout son historique visible.
 * Sans la migration v80, on retombe sur un simple sélecteur de statut.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Flag, History, Plus, RotateCcw, Settings2, X, Check, CalendarDays } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { LEAD_STATUS_OPTIONS_FALLBACK } from '@/lib/crm-constants'
import {
  CYCLE_ETAT_COLORS, CYCLE_ETAT_LABELS, RECYCLE_STATUS,
  cycleProductLabel, currentSeason, leadStatusColor, seasonChoices, shortSeason, suggestProducts,
  type CycleEtat, type CycleProduct, type SalesCycle,
} from '@/lib/sales-cycles'
import CycleProductsManager from './CycleProductsManager'

type LooseRdv = NonNullable<SalesCycle['rdvs']>[number]
type CyclesPayload = {
  available: boolean
  contact: { hubspot_contact_id: string; hs_lead_status: string | null; classe_actuelle: string | null; createdate: string | null }
  current?: SalesCycle | null
  history?: SalesCycle[]
  products?: CycleProduct[]
  loose_rdvs?: LooseRdv[]
}

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

const pill = (color: string, active = true): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: active ? tint(color, 0.10) : crmV2.bg,
  border: `1px solid ${active ? tint(color, 0.40) : crmV2.borderStrong}`,
  borderRadius: 999, padding: '4px 10px',
  color: active ? color : crmV2.textMuted,
  fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
})

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999,
  padding: '4px 10px', color: crmV2.text, fontSize: 12, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const inputStyle: React.CSSProperties = {
  background: '#fff', border: `1px solid ${crmV2.borderStrong}`, borderRadius: 10,
  padding: '6px 10px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', minWidth: 0,
}

const panelStyle: React.CSSProperties = {
  background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12,
  padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10,
}

const miniLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
}

export default function LeadCycleControl({
  contactId,
  canManageProducts = false,
  onStatusChange,
}: {
  contactId: string
  /** Admin : peut modifier le catalogue de produits */
  canManageProducts?: boolean
  onStatusChange?: (status: string | null) => void
}) {
  const [data, setData] = useState<CyclesPayload | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<null | 'new' | 'close' | 'edit' | 'products'>(null)
  const [showHistory, setShowHistory] = useState(false)

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
  const current = data?.current ?? null
  const history = data?.history ?? []
  // Statut actuel ≠ cycle courant enregistré → le contact a un cycle « implicite » pas encore suivi
  const currentTracked = !!current && (current.status ?? '').trim() === (status ?? '').trim()

  async function changeStatus(next: string) {
    if (!data) return
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
    const base = [{ id: RECYCLE_STATUS, label: RECYCLE_STATUS }, ...LEAD_STATUS_OPTIONS_FALLBACK.filter(o => o.id !== RECYCLE_STATUS)]
    return status && !base.some(o => o.id === status) ? [{ id: status, label: status }, ...base] : base
  }, [status])

  const color = leadStatusColor(status)
  const loaded = !!data

  const statusSelect = (
    <select
      value={status ?? ''}
      disabled={!loaded || busy}
      onChange={e => changeStatus(e.target.value)}
      aria-label="Statut du lead"
      style={{
        ...pill(color, !!status),
        cursor: busy ? 'wait' : 'pointer', outline: 'none', maxWidth: '100%',
        opacity: loaded ? 1 : 0.6,
      }}
    >
      {!loaded && <option value={status ?? ''}>{loadError ? 'Indisponible' : 'Chargement…'}</option>}
      {loaded && <option value="">— Aucun statut —</option>}
      {loaded && statusOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )

  // ── Repli sans migration v80 : simple sélecteur ────────────────────────────
  if (!data?.available) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
        <Flag size={14} style={{ color: crmV2.gold, flexShrink: 0 }} />
        <span>Statut du lead :</span>
        {statusSelect}
        {busy && <span style={{ fontSize: 11 }}>Enregistrement…</span>}
        {error && <span style={{ fontSize: 11, color: '#d13a41', fontWeight: 600 }}>{error}</span>}
      </div>
    )
  }

  const curProduct = current && currentTracked ? cycleProductLabel(current, products) : null
  const curSaison = current && currentTracked ? current.saison : null
  const curEtat: CycleEtat = current && currentTracked ? current.etat : 'ouvert'
  const pastCount = history.length + (current && !currentTracked ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Ligne 1 : statut */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
        <Flag size={14} style={{ color: crmV2.gold, flexShrink: 0 }} />
        <span>Statut du lead :</span>
        {statusSelect}
        {busy && <span style={{ fontSize: 11 }}>Enregistrement…</span>}
      </div>

      {/* Ligne 2 : cycle courant */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 24, fontSize: 12, color: crmV2.textMuted }}>
        <span>Cycle :</span>
        <button
          type="button"
          onClick={() => setPanel(panel === 'edit' ? null : 'edit')}
          disabled={!currentTracked}
          title={currentTracked ? 'Changer le produit ou la saison' : undefined}
          style={{ ...pill(crmV2.primary), cursor: currentTracked ? 'pointer' : 'default', background: crmV2.chipBg, borderColor: crmV2.chipBorder }}
        >
          {curProduct ?? 'Produit à définir'} · {shortSeason(curSaison ?? currentSeason())}
          {currentTracked && <ChevronDown size={11} />}
        </button>
        <span style={pill(CYCLE_ETAT_COLORS[curEtat])}>{CYCLE_ETAT_LABELS[curEtat]}</span>
        {current && currentTracked && (
          <span style={{ fontSize: 11, color: crmV2.textFaint }}>depuis le {fmtDay(current.opened_at)}</span>
        )}
        <span style={{ flex: 1 }} />
        {currentTracked && curEtat === 'ouvert' && (
          <button type="button" style={ghostBtn} onClick={() => setPanel(panel === 'close' ? null : 'close')} disabled={busy}>
            <Check size={11} /> Clore
          </button>
        )}
        {currentTracked && curEtat !== 'ouvert' && (
          <button type="button" style={ghostBtn} onClick={() => current && call(`/api/crm/cycles/${current.id}`, 'PATCH', { etat: 'ouvert' })} disabled={busy}>
            <RotateCcw size={11} /> Rouvrir
          </button>
        )}
        <button
          type="button"
          onClick={() => setPanel(panel === 'new' ? null : 'new')}
          disabled={busy}
          style={{ ...ghostBtn, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.35)', color: '#6d28d9' }}
        >
          <Plus size={11} /> Nouveau cycle
        </button>
      </div>

      {error && <div style={{ paddingLeft: 24, fontSize: 12, color: '#d13a41', fontWeight: 600 }}>{error}</div>}

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
          busy={busy}
          onCancel={() => setPanel(null)}
          onSave={async (etat, motif) => { if (await call(`/api/crm/cycles/${current.id}`, 'PATCH', { etat, motif })) setPanel(null) }}
        />
      )}

      {panel === 'new' && (
        <NewCyclePanel
          classe={data.contact.classe_actuelle}
          products={products}
          currentOpen={!currentTracked || curEtat === 'ouvert'}
          currentLabel={curProduct ? `${curProduct} ${shortSeason(curSaison!)}` : status ? `« ${status} »` : null}
          busy={busy}
          canManageProducts={canManageProducts}
          onManageProducts={() => setPanel('products')}
          onCancel={() => setPanel(null)}
          onSave={async payload => {
            if (await call(`/api/crm/contacts/${contactId}/cycles`, 'POST', payload)) {
              setPanel(null)
              onStatusChange?.(payload.status)
            }
          }}
        />
      )}

      {panel === 'products' && (
        <CycleProductsManager onClose={() => { setPanel('new'); load() }} />
      )}

      {/* Historique des cycles */}
      {(pastCount > 0 || (data.loose_rdvs?.length ?? 0) > 0 || (current?.events?.length ?? 0) > 1) && (
        <div style={{ paddingLeft: 24 }}>
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: crmV2.link, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <History size={12} />
            {pastCount > 0 ? `Historique (${pastCount} cycle${pastCount > 1 ? 's' : ''} précédent${pastCount > 1 ? 's' : ''})` : 'Historique du cycle'}
          </button>
          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {current && currentTracked && (current.events?.length ?? 0) > 0 && (
                <CycleCard cycle={current} products={products} isCurrent />
              )}
              {current && !currentTracked && <CycleCard cycle={current} products={products} />}
              {history.map(c => <CycleCard key={c.id} cycle={c} products={products} />)}
              {(data.loose_rdvs?.length ?? 0) > 0 && (
                <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                  {data.loose_rdvs!.map(r => <RdvLine key={r.id} rdv={r} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RdvLine({ rdv }: { rdv: LooseRdv }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: crmV2.textMuted }}>
      <CalendarDays size={11} color={crmV2.gold} />
      RDV du {format(new Date(rdv.start_at), 'd MMM yyyy', { locale: fr })}
      {rdv.closer && <> avec {rdv.closer}</>}
      {' · '}<strong style={{ color: crmV2.text, fontWeight: 600 }}>{RDV_STATUS_LABELS[rdv.status] ?? rdv.status}</strong>
    </div>
  )
}

function CycleCard({ cycle, products, isCurrent = false }: { cycle: SalesCycle; products: CycleProduct[]; isCurrent?: boolean }) {
  const [open, setOpen] = useState(false)
  const label = cycleProductLabel(cycle, products) ?? 'Produit non précisé'
  const etatColor = CYCLE_ETAT_COLORS[cycle.etat]
  const statusEvents = (cycle.events ?? []).filter(e => e.kind === 'status' || e.kind === 'open').slice(0, 12)
  return (
    <div style={{ border: `1px solid ${crmV2.border}`, borderLeft: `3px solid ${etatColor}`, borderRadius: 10, padding: '7px 10px', background: crmV2.bg }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', width: '100%', fontSize: 12 }}
      >
        <strong style={{ color: crmV2.text }}>{label}</strong>
        <span style={{ color: crmV2.textMuted }}>{cycle.saison}</span>
        <span style={{ ...pill(etatColor), padding: '1px 8px', fontSize: 11 }}>{isCurrent ? 'Cycle en cours' : CYCLE_ETAT_LABELS[cycle.etat]}</span>
        {cycle.status && <span style={{ ...pill(leadStatusColor(cycle.status)), padding: '1px 8px', fontSize: 11 }}>{cycle.status}</span>}
        <span style={{ marginLeft: 'auto', color: crmV2.textFaint, fontSize: 11 }}>
          {fmtDay(cycle.opened_at)}{cycle.closed_at && !isCurrent ? ` → ${fmtDay(cycle.closed_at)}` : ''}
        </span>
      </button>
      {cycle.motif && <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 3 }}>Motif : {cycle.motif}</div>}
      {(cycle.rdvs ?? []).map(r => <RdvLine key={r.id} rdv={r} />)}
      {open && statusEvents.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {statusEvents.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: crmV2.textMuted }}>
              {format(new Date(e.at), "d MMM yyyy 'à' HH:mm", { locale: fr })} — {e.kind === 'open' ? 'Ouverture' : 'Statut'} : <strong style={{ color: crmV2.text, fontWeight: 600 }}>{e.new_value}</strong>
              {e.by && e.by !== 'auto' && <> · {e.by}</>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductSelect({ products, value, onChange }: { products: CycleProduct[]; value: string; onChange: (v: string) => void }) {
  const active = products.filter(p => p.active)
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
      <option value="">Produit à définir</option>
      {active.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
      <option value="__autre">Autre (texte libre)…</option>
    </select>
  )
}

function SeasonSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const choices = seasonChoices()
  const list = choices.includes(value) ? choices : [value, ...choices]
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {list.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
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
      <div style={miniLabel}>Produit et saison du cycle</div>
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

function EtatButtons({ value, onChange }: { value: CycleEtat | null; onChange: (e: CycleEtat) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {(['perdu', 'reporte', 'gagne'] as CycleEtat[]).map(e => (
        <button key={e} type="button" onClick={() => onChange(e)} style={{ ...pill(CYCLE_ETAT_COLORS[e], value === e), cursor: 'pointer', padding: '5px 12px' }}>
          {value === e && <Check size={11} />}
          {CYCLE_ETAT_LABELS[e]}
        </button>
      ))}
    </div>
  )
}

function CloseCyclePanel({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: (etat: CycleEtat, motif: string) => void }) {
  const [etat, setEtat] = useState<CycleEtat | null>(null)
  const [motif, setMotif] = useState('')
  return (
    <div style={panelStyle}>
      <div style={miniLabel}>Clore le cycle en cours</div>
      <EtatButtons value={etat} onChange={setEtat} />
      <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif (ex. trop cher, autre prépa, veut attendre l’an prochain…)" style={inputStyle} />
      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
        Le statut du lead ne change pas. Pour relancer sur autre chose, utilisez « Nouveau cycle ».
      </div>
      <PanelActions busy={busy} onCancel={onCancel} label="Clore le cycle" disabled={!etat} onConfirm={() => etat && onSave(etat, motif)} />
    </div>
  )
}

function NewCyclePanel({ classe, products, currentOpen, currentLabel, busy, canManageProducts, onManageProducts, onCancel, onSave }: {
  classe: string | null
  products: CycleProduct[]
  currentOpen: boolean
  currentLabel: string | null
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
    { title: `Cette saison (${shortSeason(cur)})`, items: suggestions.filter(s => s.thisSeason) },
    { title: 'Saison suivante', items: suggestions.filter(s => !s.thisSeason) },
  ].filter(g => g.items.length)

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={miniLabel}>Nouveau cycle de vente</div>
        {canManageProducts && (
          <button type="button" onClick={onManageProducts} style={{ ...ghostBtn, padding: '2px 8px', fontSize: 11 }}>
            <Settings2 size={11} /> Gérer les produits
          </button>
        )}
      </div>

      {groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Suggestions pour un élève de <strong style={{ color: crmV2.text }}>{classe}</strong> :</div>
          {groups.map(g => (
            <div key={g.title} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: crmV2.textFaint, minWidth: 104 }}>{g.title}</span>
              {g.items.map(s => {
                const sel = code === s.product.code && saison === s.saison
                return (
                  <button
                    key={`${s.product.code}-${s.saison}`}
                    type="button"
                    onClick={() => { setCode(s.product.code); setSaison(s.saison) }}
                    style={{ ...pill('#6d28d9', sel), cursor: 'pointer' }}
                  >
                    {sel && <Check size={11} />}
                    {s.product.label} {shortSeason(s.saison)}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ProductSelect products={products} value={code} onChange={setCode} />
        <SeasonSelect value={saison} onChange={setSaison} />
      </div>
      {code === '__autre' && <input value={free} onChange={e => setFree(e.target.value)} placeholder="Nom du produit" style={inputStyle} />}

      {currentOpen && currentLabel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Le cycle actuel ({currentLabel}) se termine en :</div>
          <EtatButtons value={closeEtat} onChange={setCloseEtat} />
          <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif (facultatif)" style={inputStyle} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: crmV2.textMuted }}>
        Statut de départ :
        <select value={startStatus} onChange={e => setStartStatus(e.target.value)} style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}>
          {[RECYCLE_STATUS, 'A relancer', 'Nouveau', 'Nouveau - Chaud', 'En cours', 'RDV pris', 'A replanifier'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <PanelActions
        busy={busy}
        onCancel={onCancel}
        label="Ouvrir le cycle"
        disabled={(currentOpen && !!currentLabel && !closeEtat) || (code === '__autre' && !free.trim())}
        onConfirm={() => onSave({
          saison,
          product_code: code && code !== '__autre' ? code : null,
          product_label: code === '__autre' ? free.trim() : null,
          status: startStatus,
          close_etat: closeEtat,
          close_motif: motif,
        })}
      />
    </div>
  )
}

function PanelActions({ busy, disabled = false, label, onCancel, onConfirm }: {
  busy: boolean; disabled?: boolean; label: string; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" onClick={onCancel} style={ghostBtn}><X size={11} /> Annuler</button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || disabled}
        style={{
          ...ghostBtn, background: crmV2.primary, borderColor: crmV2.primary, color: '#fff',
          opacity: busy || disabled ? 0.5 : 1, cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Enregistrement…' : label}
      </button>
    </div>
  )
}
