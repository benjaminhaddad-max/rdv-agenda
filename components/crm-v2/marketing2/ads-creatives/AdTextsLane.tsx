'use client'

/**
 * Texte publicitaire d'une campagne (pour la personne qui met en ligne dans
 * l'Ads Manager) : texte principal, titre, description. Rédigé automatiquement
 * par Claude à la première ouverture de la fiche, puis modifiable / régénérable
 * (CRM et lien partagé). Chaque champ se copie d'un clic.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Copy, RefreshCw, Sparkles } from 'lucide-react'
import { CrmV2Button, CrmV2Input, CrmV2Textarea } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { frDay, parisDay, type AdTexts, type AdsEventRow } from '@/lib/ads-creatives'

const EMPTY: AdTexts = { primary_text: '', headline: '', description: '', edited_by: null, edited_at: null }

/** Limites d'affichage conseillées par Meta (au-delà le texte est tronqué). */
const LIMITS = { primary_text: 250, headline: 40, description: 30 } as const

export default function AdTextsLane({
  ev, token, author, onSaved, flash,
}: {
  ev: AdsEventRow
  token?: string
  author: string
  onSaved: (texts: AdTexts, at?: string | null) => void
  flash: (m: string) => void
}) {
  const saved = ev.ad_texts
  const [draft, setDraft] = useState<AdTexts>(saved || EMPTY)
  const [busy, setBusy] = useState<'gen' | 'save' | null>(null)
  const [askInstr, setAskInstr] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [genError, setGenError] = useState<string | null>(null)
  const autoTried = useRef<string | null>(null)

  const generate = async (auto = false) => {
    if (!auto && saved && !confirm('Régénérer le texte publicitaire ? Le texte actuel (et ses modifications) sera remplacé.')) return
    setBusy('gen')
    setGenError(null)
    try {
      const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}/ad-texts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, instructions: auto ? null : instructions, auto }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error || 'Génération impossible')
      onSaved(json.ad_texts, json.ad_texts_at)
      setDraft(json.ad_texts)
      setAskInstr(false)
      if (!auto) flash('Texte publicitaire généré')
    } catch (e) {
      setGenError((e as Error).message)
      if (!auto) flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Autre campagne ouverte ; génération automatique si pas encore de texte
  useEffect(() => {
    setDraft(ev.ad_texts || EMPTY)
    setGenError(null)
    if (!ev.ad_texts && !ev.no_campaign && autoTried.current !== ev.id) {
      autoTried.current = ev.id
      generate(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id])

  const dirty = !!saved && JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (k: 'primary_text' | 'headline' | 'description', v: string) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async () => {
    setBusy('save')
    try {
      const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}/ad-texts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ad_texts: { ...draft, edited_by: author.trim() || 'Équipe', edited_at: new Date().toISOString() } }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error || 'Enregistrement impossible')
      onSaved(json.ad_texts)
      setDraft(json.ad_texts)
      flash('Texte enregistré')
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); flash(`${what} copié`) } catch { flash('Copie impossible') }
  }

  const instrBox = (
    <CrmV2Textarea
      value={instructions}
      onChange={(e) => setInstructions(e.target.value)}
      placeholder="Consignes pour Claude (facultatif) : ex. plus court, insister sur la gratuité, parler surtout aux parents…"
      style={{ minHeight: 60, fontSize: 13, marginTop: 8 }}
    />
  )

  if (!saved) {
    return (
      <div style={emptyBox}>
        {busy === 'gen' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.textMuted }}>
            <Sparkles size={14} /> Claude rédige le texte publicitaire… (≈ 20 s)
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: genError ? crmV2.danger : crmV2.textMuted, lineHeight: 1.5 }}>
              {genError || 'Texte principal, titre et description rédigés par Claude à partir du brief, prêts à coller dans l’Ads Manager.'}
            </div>
            {askInstr && instrBox}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <CrmV2Button size="sm" variant="primary" icon={<Sparkles size={14} />} onClick={() => generate()}>Générer le texte</CrmV2Button>
              {!askInstr && <CrmV2Button size="sm" variant="ghost" onClick={() => setAskInstr(true)}>Ajouter des consignes</CrmV2Button>}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Field label="Texte principal" value={draft.primary_text} limit={LIMITS.primary_text} onCopy={() => copy(draft.primary_text, 'Texte principal')}>
        <CrmV2Textarea value={draft.primary_text} onChange={(e) => set('primary_text', e.target.value)} style={{ minHeight: 100, fontSize: 13.5, lineHeight: 1.5 }} />
      </Field>
      <Field label="Titre" value={draft.headline} limit={LIMITS.headline} onCopy={() => copy(draft.headline, 'Titre')}>
        <CrmV2Input value={draft.headline} onChange={(e) => set('headline', e.target.value)} style={{ fontWeight: 700 }} />
      </Field>
      <Field label="Description" value={draft.description} limit={LIMITS.description} onCopy={() => copy(draft.description, 'Description')}>
        <CrmV2Input value={draft.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div style={{ fontSize: 12, color: crmV2.textFaint }}>
        {saved.edited_by === 'Claude'
          ? `Rédigé par Claude${ev.ad_texts_at ? ` le ${frDay(parisDay(ev.ad_texts_at))}` : ''}`
          : saved.edited_by
            ? `Modifié par ${saved.edited_by}${saved.edited_at ? ` le ${frDay(parisDay(saved.edited_at))}` : ''}`
            : null}
      </div>

      {askInstr && instrBox}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {askInstr ? (
          <CrmV2Button size="sm" icon={<RefreshCw size={14} />} disabled={busy === 'gen'} onClick={() => generate()}>
            {busy === 'gen' ? 'Rédaction… (≈ 20 s)' : 'Régénérer avec ces consignes'}
          </CrmV2Button>
        ) : (
          <CrmV2Button size="sm" icon={<RefreshCw size={14} />} disabled={busy === 'gen'} onClick={() => setAskInstr(true)}>Régénérer</CrmV2Button>
        )}
        <div style={{ flex: 1 }} />
        {dirty && (
          <>
            <CrmV2Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>Annuler</CrmV2Button>
            <CrmV2Button size="sm" variant="primary" disabled={busy === 'save'} onClick={save}>
              {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
            </CrmV2Button>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, limit, onCopy, children }: {
  label: string
  value: string
  limit: number
  onCopy: () => void
  children: React.ReactNode
}) {
  const over = value.length > limit
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={fieldLabel}>{label}</span>
        <span style={{ fontSize: 11, color: over ? crmV2.danger : crmV2.textFaint }} title={`Conseillé : ${limit} caractères max`}>
          {value.length}/{limit}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCopy} style={copyBtn} title={`Copier le ${label.toLowerCase()}`}>
          <Copy size={12} /> Copier
        </button>
      </div>
      {children}
    </div>
  )
}

const fieldLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.textFaint,
}
const emptyBox: CSSProperties = {
  padding: '12px 14px', borderRadius: crmV2.radius, border: `1px dashed ${crmV2.borderStrong}`, background: crmV2.bgHover,
}
const copyBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer',
  color: crmV2.link, fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit',
}
