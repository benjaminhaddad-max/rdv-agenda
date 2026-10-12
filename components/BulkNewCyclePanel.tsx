'use client'

/**
 * Action groupée « Nouveau cycle de vente » (CRM admin) — ex. à la rentrée :
 * tous les perdus de Terminale → Prépa PASS / LAS 2027-2028 · Recyclé.
 */
import { useEffect, useState } from 'react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CYCLE_ETAT_COLORS, CYCLE_ETAT_LABELS, RECYCLE_STATUS, currentSeason, seasonChoices,
  type CycleEtat, type CycleProduct,
} from '@/lib/sales-cycles'

const inputStyle: React.CSSProperties = {
  height: 32, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
  padding: '0 10px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit', minWidth: 0,
}

export default function BulkNewCyclePanel({ contactIds, onDone, onCancel }: {
  contactIds: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const [products, setProducts] = useState<CycleProduct[]>([])
  const [available, setAvailable] = useState(true)
  const [code, setCode] = useState('')
  const [saison, setSaison] = useState(currentSeason())
  const [closeEtat, setCloseEtat] = useState<CycleEtat>('reporte')
  const [motif, setMotif] = useState('')
  const [status, setStatus] = useState(RECYCLE_STATUS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/crm/cycle-products', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setAvailable(j.available !== false); setProducts((j.products ?? []).filter((p: CycleProduct) => p.active)) })
      .catch(() => setAvailable(false))
  }, [])

  async function submit() {
    const n = contactIds.length
    const product = products.find(p => p.code === code)
    const what = `${product?.label ?? 'produit à définir'} ${saison}`
    if (!confirm(`Ouvrir un cycle « ${what} » (statut « ${status} ») pour ${n.toLocaleString('fr-FR')} contact${n > 1 ? 's' : ''} ?\n\nLeur cycle actuel sera clos en « ${CYCLE_ETAT_LABELS[closeEtat]} ».`)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/crm/cycles/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: contactIds, saison, product_code: code || null, status, close_etat: closeEtat, close_motif: motif }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Échec')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec')
    } finally {
      setBusy(false)
    }
  }

  if (!available) {
    return (
      <div style={{ fontSize: 13, color: crmV2.textMuted, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px' }}>
        Les cycles de vente ne sont pas encore activés (migration v80 à lancer).
      </div>
    )
  }

  return (
    <div style={{
      background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12,
      padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap',
    }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: crmV2.textMuted, flex: '1 1 200px' }}>
        PRODUIT DU NOUVEAU CYCLE
        <select value={code} onChange={e => setCode(e.target.value)} style={inputStyle}>
          <option value="">Produit à définir</option>
          {products.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: crmV2.textMuted }}>
        SAISON
        <select value={saison} onChange={e => setSaison(e.target.value)} style={inputStyle}>
          {seasonChoices().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: crmV2.textMuted }}>
        STATUT DE DÉPART
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          {[RECYCLE_STATUS, 'A relancer', 'Nouveau'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: crmV2.textMuted }}>
        CYCLE ACTUEL CLOS EN
        <select value={closeEtat} onChange={e => setCloseEtat(e.target.value as CycleEtat)} style={{ ...inputStyle, color: CYCLE_ETAT_COLORS[closeEtat], fontWeight: 700 }}>
          {(['reporte', 'perdu', 'gagne'] as CycleEtat[]).map(e => <option key={e} value={e}>{CYCLE_ETAT_LABELS[e]}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: crmV2.textMuted, flex: '1 1 180px' }}>
        MOTIF (FACULTATIF)
        <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="ex. Relance rentrée 2027" style={inputStyle} />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onCancel} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || contactIds.length === 0}
          style={{ ...inputStyle, cursor: busy ? 'wait' : 'pointer', background: crmV2.primary, borderColor: crmV2.primary, color: '#fff', fontWeight: 700, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Ouverture…' : `Ouvrir pour ${contactIds.length.toLocaleString('fr-FR')}`}
        </button>
      </div>
      {error && <div style={{ width: '100%', fontSize: 12, color: '#d13a41', fontWeight: 600 }}>{error}</div>}
    </div>
  )
}
