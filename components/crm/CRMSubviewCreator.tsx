'use client'

/**
 * Popover « Nouvelle sous-vue » : on coche des critères (télépro, zone,
 * classe, statut… et pour une vue Lab : app / ville / action dans l'app),
 * le nom et le nombre de contacts se mettent à jour tout seuls.
 * « 1 sous-vue par valeur » crée d'un clic une sous-vue pour chaque choix
 * d'une rangée (ex. une par ville Medibox).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { fmtCount } from '@/components/crm/CRMUIBits'
import type { CRMSavedView } from '@/lib/crm-views'
import { viewToCountParams } from '@/lib/crm-views'
import {
  buildSubview,
  subviewSectionsFor,
  suggestSubviewName,
  type SubviewSelection,
} from '@/lib/crm-subviews'

type Props = {
  parent: CRMSavedView
  onCreate: (views: CRMSavedView[]) => void
  onClose: () => void
}

const chipStyle = (active: boolean): CSSProperties => ({
  height: 28,
  boxSizing: 'border-box',
  padding: '0 11px',
  borderRadius: crmV2.radiusPill,
  border: `1px solid ${active ? crmV2.gold : crmV2.borderStrong}`,
  background: active ? crmV2.goldSoft : crmV2.bg,
  color: active ? crmV2.text : crmV2.textMuted,
  fontWeight: active ? 700 : 500,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
})

const linkBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: crmV2.link,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export function CRMSubviewCreator({ parent, onCreate, onClose }: Props) {
  const sections = useMemo(() => subviewSectionsFor(parent), [parent])
  const [selection, setSelection] = useState<SubviewSelection>({})
  const [name, setName] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const hasSelection = Object.values(selection).some(v => v.length > 0)
  const suggested = suggestSubviewName(sections, selection)

  // Compteur en direct (débouncé) : même calcul que les badges des vues.
  useEffect(() => {
    if (!hasSelection) return
    const draft = buildSubview(parent, sections, selection, 'aperçu')
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setCount(null)
      setCounting(true)
      fetch(`/api/crm/contacts?${viewToCountParams(draft).toString()}`, { signal: ctrl.signal, cache: 'no-store' })
        .then(r => r.json())
        .then((d: { total?: number }) => setCount(Number(d.total ?? 0)))
        .catch(() => {})
        .finally(() => { if (!ctrl.signal.aborted) setCounting(false) })
    }, 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [parent, sections, selection, hasSelection])

  const toggle = (sectionKey: string, choiceKey: string, single?: boolean) => {
    setSelection(prev => {
      const cur = prev[sectionKey] ?? []
      const next = cur.includes(choiceKey)
        ? cur.filter(k => k !== choiceKey)
        : single ? [choiceKey] : [...cur, choiceKey]
      return { ...prev, [sectionKey]: next }
    })
  }

  const createOne = () => {
    if (!hasSelection) return
    onCreate([buildSubview(parent, sections, selection, name)])
  }

  /** Une sous-vue par valeur de la rangée, en gardant les autres critères cochés. */
  const createOnePerValue = (sectionKey: string) => {
    const section = sections.find(s => s.key === sectionKey)
    if (!section) return
    const views = section.choices.map(c => {
      const sel = { ...selection, [sectionKey]: [c.key] }
      return buildSubview(parent, sections, sel, suggestSubviewName(sections, sel))
    })
    onCreate(views)
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Nouvelle sous-vue"
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
        width: 'min(560px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto',
        background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius,
        boxShadow: crmV2.shadowPanel, padding: 16, fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>Nouvelle sous-vue</div>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ ...linkBtn, color: crmV2.textFaint, display: 'flex' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ fontSize: 12, color: crmV2.textFaint, marginBottom: 12 }}>
        {`Dans « ${parent.name} » · plusieurs choix dans une rangée = l'un ou l'autre ; entre rangées = et.`}
      </div>

      {sections.map(section => (
        <div key={section.key} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: crmV2.textFaint }}>
              {section.label}
            </span>
            {section.choices.length > 1 && (
              <button type="button" style={linkBtn} onClick={() => createOnePerValue(section.key)}
                title={`Crée ${section.choices.length} sous-vues : ${section.choices.map(c => c.label).join(', ')}`}>
                + 1 sous-vue par valeur
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {section.choices.map(c => {
              const active = (selection[section.key] ?? []).includes(c.key)
              return (
                <button key={c.key} type="button" style={chipStyle(active)} onClick={() => toggle(section.key, c.key, section.single)}>
                  {active && <Check size={12} />}
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') createOne() }}
          placeholder={suggested || 'Nom de la sous-vue'}
          style={{
            flex: '1 1 220px', height: 32, boxSizing: 'border-box', padding: '0 10px',
            border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusSm,
            fontSize: 13, fontFamily: 'inherit', color: crmV2.text, outline: 'none',
          }}
        />
        <span style={{ fontSize: 12, color: crmV2.textMuted, minWidth: 90, fontVariantNumeric: 'tabular-nums' }}>
          {!hasSelection ? '' : counting && count === null ? 'Calcul…' : count !== null ? `${fmtCount(count)} contacts` : ''}
        </span>
        <button
          type="button"
          onClick={createOne}
          disabled={!hasSelection}
          style={{
            height: 32, padding: '0 14px', borderRadius: crmV2.radiusPill, border: 'none',
            background: hasSelection ? crmV2.primary : crmV2.borderStrong, color: '#fff',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            cursor: hasSelection ? 'pointer' : 'not-allowed',
          }}
        >
          Créer la sous-vue
        </button>
      </div>
    </div>
  )
}
