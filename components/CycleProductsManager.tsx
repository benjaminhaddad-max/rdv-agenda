'use client'

/**
 * Catalogue des produits de cycle de vente (admin) : nom, marque, actif, et
 * règles de suggestion « classe actuelle → cette saison / saison suivante ».
 */
import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CLASSE_OPTIONS } from '@/lib/crm-constants'
import { CYCLE_BRAND_LABELS, type CycleProduct } from '@/lib/sales-cycles'

const CLASSES = CLASSE_OPTIONS.filter(o => o.id)

const inputStyle: React.CSSProperties = {
  background: '#fff', border: `1px solid ${crmV2.borderStrong}`, borderRadius: 8,
  padding: '4px 8px', color: crmV2.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', minWidth: 0,
}
const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, background: crmV2.bg,
  border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999, padding: '3px 9px',
  color: crmV2.text, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

export default function CycleProductsManager({ onClose }: { onClose: () => void }) {
  const [products, setProducts] = useState<CycleProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newBrand, setNewBrand] = useState('diploma')

  async function load() {
    const res = await fetch('/api/crm/cycle-products', { cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    setProducts(j.products ?? [])
  }
  useEffect(() => { load() }, [])

  async function patch(code: string, body: Partial<CycleProduct>) {
    setError(null)
    setProducts(ps => ps && ps.map(p => (p.code === code ? { ...p, ...body } : p)))
    const res = await fetch('/api/crm/cycle-products', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...body }),
    })
    if (!res.ok) { setError('Échec de l’enregistrement'); load() }
  }

  async function create() {
    if (!newLabel.trim()) return
    setError(null)
    const res = await fetch('/api/crm/cycle-products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: newLabel, brand: newBrand, suggest: [] }),
    })
    if (!res.ok) { setError('Échec de la création'); return }
    setNewLabel('')
    load()
  }

  return (
    <div style={{ background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Produits des cycles de vente</div>
        <button type="button" onClick={onClose} style={smallBtn}><X size={11} /> Fermer</button>
      </div>
      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
        « Proposé à » : le produit est suggéré pour les élèves de cette classe, pour la saison en cours ou la suivante.
      </div>
      {error && <div style={{ fontSize: 12, color: '#d13a41', fontWeight: 600 }}>{error}</div>}
      {!products && <div style={{ fontSize: 12, color: crmV2.textMuted }}>Chargement…</div>}
      {products?.map(p => (
        <div key={p.code} style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, opacity: p.active ? 1 : 0.55 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              defaultValue={p.label}
              onBlur={e => e.target.value.trim() && e.target.value.trim() !== p.label && patch(p.code, { label: e.target.value.trim() })}
              style={{ ...inputStyle, flex: 1, fontWeight: 700 }}
            />
            <select value={p.brand} onChange={e => patch(p.code, { brand: e.target.value })} style={inputStyle}>
              {Object.entries(CYCLE_BRAND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: crmV2.textMuted }}>
              <input type="checkbox" checked={p.active} onChange={e => patch(p.code, { active: e.target.checked })} /> Actif
            </label>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: crmV2.textMuted }}>
            Proposé à :
            {(p.suggest ?? []).map((s, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '1px 4px 1px 8px', color: crmV2.text }}>
                {s.classe} · {s.offset === 1 ? 'saison suivante' : 'cette saison'}
                <button type="button" aria-label="Retirer" onClick={() => patch(p.code, { suggest: p.suggest.filter((_, j) => j !== i) })} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', color: crmV2.textFaint }}>
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            <AddSuggestion onAdd={(classe, offset) => patch(p.code, { suggest: [...(p.suggest ?? []), { classe, offset }] })} />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Nouveau produit (ex. Stage de Noël PASS)" style={{ ...inputStyle, flex: 1 }} />
        <select value={newBrand} onChange={e => setNewBrand(e.target.value)} style={inputStyle}>
          {Object.entries(CYCLE_BRAND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="button" onClick={create} disabled={!newLabel.trim()} style={{ ...smallBtn, opacity: newLabel.trim() ? 1 : 0.5 }}><Plus size={11} /> Ajouter</button>
      </div>
    </div>
  )
}

function AddSuggestion({ onAdd }: { onAdd: (classe: string, offset: number) => void }) {
  const [classe, setClasse] = useState('')
  const [offset, setOffset] = useState(0)
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <select value={classe} onChange={e => setClasse(e.target.value)} style={{ ...inputStyle, padding: '1px 6px', fontSize: 11 }}>
        <option value="">+ classe…</option>
        {CLASSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      {classe && (
        <>
          <select value={offset} onChange={e => setOffset(Number(e.target.value))} style={{ ...inputStyle, padding: '1px 6px', fontSize: 11 }}>
            <option value={0}>cette saison</option>
            <option value={1}>saison suivante</option>
          </select>
          <button type="button" onClick={() => { onAdd(classe, offset); setClasse(''); setOffset(0) }} style={{ ...smallBtn, padding: '1px 8px' }}>OK</button>
        </>
      )}
    </span>
  )
}
