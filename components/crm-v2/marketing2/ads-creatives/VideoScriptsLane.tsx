'use client'

/**
 * Brief vidéo d'une campagne : 3 scripts de 20-30 s (hook et structure
 * différents) rédigés par Claude à partir du brief, puis modifiables à la main
 * par l'équipe (CRM) et les créatifs (lien partagé). Régénération CRM uniquement.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { Copy, RefreshCw, Sparkles } from 'lucide-react'
import { CrmV2Button, CrmV2Input, CrmV2Textarea } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { frDay, parisDay, type AdsEventRow, type VideoScript } from '@/lib/ads-creatives'

export default function VideoScriptsLane({
  ev, crm, token, author, onSaved, flash,
}: {
  ev: AdsEventRow
  crm: boolean
  token?: string
  author: string
  onSaved: (scripts: VideoScript[], at?: string | null) => void
  flash: (m: string) => void
}) {
  const saved = ev.video_scripts || []
  const [draft, setDraft] = useState<VideoScript[]>(saved)
  const [tab, setTab] = useState(0)
  const [busy, setBusy] = useState<'gen' | 'save' | null>(null)
  const [askInstr, setAskInstr] = useState(false)
  const [instructions, setInstructions] = useState('')

  // Autre campagne ouverte
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(ev.video_scripts || []); setTab(0) }, [ev.id])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const cur = draft[tab]

  const set = (k: keyof VideoScript, v: string | number | null) =>
    setDraft((prev) => prev.map((s, i) => (i === tab ? { ...s, [k]: v } : s)))

  const generate = async () => {
    if (saved.length && !confirm('Régénérer les 3 scripts ? Les scripts actuels (et leurs modifications) seront remplacés.')) return
    setBusy('gen')
    try {
      const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}/video-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, instructions }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error || 'Génération impossible')
      onSaved(json.scripts, json.video_scripts_at)
      setDraft(json.scripts)
      setTab(0)
      setAskInstr(false)
      flash('3 scripts générés')
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    const now = new Date().toISOString()
    // Signe uniquement les scripts réellement modifiés
    const scripts = draft.map((s, i) =>
      JSON.stringify(s) !== JSON.stringify(saved[i]) ? { ...s, edited_by: author.trim() || 'Équipe', edited_at: now } : s)
    try {
      const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}/video-scripts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, scripts }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error || 'Enregistrement impossible')
      onSaved(json.scripts)
      setDraft(json.scripts)
      flash('Scripts enregistrés')
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    if (!cur) return
    const text = [
      `${cur.angle}${cur.duration ? ` (${cur.duration} s)` : ''}`,
      `HOOK : ${cur.hook}`,
      `STRUCTURE : ${cur.structure}`,
      '',
      cur.script,
      '',
      'TEXTES À L’ÉCRAN :',
      cur.on_screen,
    ].join('\n')
    try { await navigator.clipboard.writeText(text); flash('Script copié') } catch { flash('Copie impossible') }
  }

  const instrBox = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <CrmV2Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Consignes pour Claude (facultatif) : ex. un script avec un étudiant en témoignage, insister sur la date limite Parcoursup…"
        style={{ minHeight: 64, fontSize: 13 }}
      />
    </div>
  )

  if (!draft.length) {
    return (
      <div style={emptyBox}>
        {crm ? (
          <>
            <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
              3 scripts de 20-30 s, chacun avec un hook et une structure différents, rédigés par Claude à partir du brief de la campagne. Modifiables ensuite.
            </div>
            {askInstr && instrBox}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <CrmV2Button size="sm" variant="primary" icon={<Sparkles size={14} />} disabled={busy === 'gen'} onClick={generate}>
                {busy === 'gen' ? 'Rédaction en cours… (≈ 1 min)' : 'Générer les 3 scripts'}
              </CrmV2Button>
              {!askInstr && busy !== 'gen' && (
                <CrmV2Button size="sm" variant="ghost" onClick={() => setAskInstr(true)}>Ajouter des consignes</CrmV2Button>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: crmV2.textMuted }}>Les scripts vidéo n’ont pas encore été rédigés.</div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {draft.map((s, i) => (
          <button key={i} type="button" onClick={() => setTab(i)} style={{ ...tabBtn, ...(i === tab ? tabBtnOn : {}) }} title={s.angle}>
            Script {i + 1}
            {s.angle && <span style={{ fontWeight: 500, opacity: 0.8 }}> · {s.angle.length > 28 ? `${s.angle.slice(0, 27)}…` : s.angle}</span>}
          </button>
        ))}
      </div>

      {cur && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
            <Labeled label="Angle">
              <CrmV2Input value={cur.angle} onChange={(e) => set('angle', e.target.value)} />
            </Labeled>
            <Labeled label="Durée (s)">
              <CrmV2Input type="number" min={5} max={120} value={cur.duration ?? ''} onChange={(e) => set('duration', e.target.value ? Number(e.target.value) : null)} />
            </Labeled>
          </div>
          <Labeled label="Hook (0-3 s)">
            <CrmV2Textarea value={cur.hook} onChange={(e) => set('hook', e.target.value)} style={{ ...hookStyle, minHeight: 52 }} />
          </Labeled>
          <Labeled label="Structure">
            <CrmV2Input value={cur.structure} onChange={(e) => set('structure', e.target.value)} />
          </Labeled>
          <Labeled label="Script (plans + voix)">
            <CrmV2Textarea value={cur.script} onChange={(e) => set('script', e.target.value)} style={{ minHeight: 220, fontSize: 13 }} />
          </Labeled>
          <Labeled label="Textes à l’écran">
            <CrmV2Textarea value={cur.on_screen} onChange={(e) => set('on_screen', e.target.value)} style={{ minHeight: 90, fontSize: 13 }} />
          </Labeled>
          <div style={{ fontSize: 12, color: crmV2.textFaint }}>
            {cur.edited_by === 'Claude'
              ? `Rédigé par Claude${ev.video_scripts_at ? ` le ${frDay(parisDay(ev.video_scripts_at))}` : ''}`
              : cur.edited_by
                ? `Modifié par ${cur.edited_by}${cur.edited_at ? ` le ${frDay(parisDay(cur.edited_at))}` : ''}`
                : null}
          </div>
        </div>
      )}

      {crm && askInstr && instrBox}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <CrmV2Button size="sm" icon={<Copy size={14} />} onClick={copy}>Copier</CrmV2Button>
        {crm && (
          askInstr ? (
            <CrmV2Button size="sm" icon={<RefreshCw size={14} />} disabled={busy === 'gen'} onClick={generate}>
              {busy === 'gen' ? 'Rédaction… (≈ 1 min)' : 'Régénérer avec ces consignes'}
            </CrmV2Button>
          ) : (
            <CrmV2Button size="sm" icon={<RefreshCw size={14} />} disabled={busy === 'gen'} onClick={() => setAskInstr(true)}>Régénérer</CrmV2Button>
          )
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={fieldLabel}>{label}</span>
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
const tabBtn: CSSProperties = {
  padding: '6px 10px', borderRadius: crmV2.radiusSm, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
  fontSize: 12, fontWeight: 700, color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
}
const tabBtnOn: CSSProperties = { borderColor: crmV2.gold, background: crmV2.goldSoft, color: crmV2.goldDark }
const hookStyle: CSSProperties = { fontWeight: 600, fontSize: 14 }
