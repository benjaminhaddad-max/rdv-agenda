'use client'

/** Panneau d'édition du brief d'une campagne (CRM). */

import { useState } from 'react'
import {
  CrmV2Button, CrmV2Drawer, CrmV2Field, CrmV2Input, CrmV2Select, CrmV2Textarea, CrmV2Toggle,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CAMPAIGN_STATUSES, frDay, type AdsEventRow } from '@/lib/ads-creatives'

type Draft = Record<string, string | boolean>

const toStr = (v: unknown) => (v == null ? '' : String(v))

export default function CampaignEditDrawer({
  ev, onClose, onSaved, flash,
}: {
  ev: AdsEventRow
  onClose: () => void
  onSaved: () => void
  flash: (m: string) => void
}) {
  const [d, setD] = useState<Draft>(() => ({
    title: ev.name,
    event_date: ev.day,
    event_time: toStr(ev.event_time),
    status: toStr(ev.status),
    pilier: toStr(ev.pilier),
    funnel: toStr(ev.funnel),
    cible: toStr(ev.cible),
    geo: toStr(ev.geo),
    accroche: toStr(ev.accroche),
    intervenant: toStr(ev.intervenant),
    cta: toStr(ev.cta),
    budget_target: toStr(ev.budget_target),
    cpl_target: toStr(ev.cpl_target),
    cpl_ref: toStr(ev.cpl_ref),
    leads_expected: toStr(ev.leads_expected),
    ref_diploma: toStr(ev.ref_diploma),
    budget_logic: toStr(ev.budget_logic),
    why: toStr(ev.why),
    to_check: toStr(ev.to_check),
    format_contenu: toStr(ev.format_contenu),
    direction_crea: toStr(ev.direction_crea),
    linked_webinars: toStr(ev.linked_webinars),
    launch_date: toStr(ev.launch_date),
    creas_date: toStr(ev.creas_date),
    end_date: toStr(ev.end_date),
    no_campaign: ev.no_campaign,
  }))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string | boolean) => setD((p) => ({ ...p, [k]: v }))
  const linked = !!ev.event_id
  const isGuide = ev.kind === 'guide'

  const save = async () => {
    setSaving(true)
    const payload: Record<string, unknown> = { ...d }
    // Nom et date viennent de l'onglet Événements une fois rattaché
    if (linked && !isGuide) { delete payload.title; delete payload.event_date }
    const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return flash(json.error || 'Erreur')
    flash('Brief enregistré')
    onSaved()
    onClose()
  }

  const remove = async () => {
    if (!confirm(`Supprimer la campagne « ${ev.name} » et ses dépôts ?`)) return
    const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return flash(json.error || 'Suppression impossible')
    flash('Campagne supprimée')
    onSaved()
    onClose()
  }

  const text = (k: string, label: string, placeholder?: string) => (
    <CrmV2Field label={label}>
      <CrmV2Input value={d[k] as string} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
    </CrmV2Field>
  )
  const area = (k: string, label: string) => (
    <CrmV2Field label={label}>
      <CrmV2Textarea value={d[k] as string} onChange={(e) => set(k, e.target.value)} style={{ minHeight: 70 }} />
    </CrmV2Field>
  )
  const section = (title: string) => (
    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: crmV2.textFaint, margin: '8px 0 -2px' }}>{title}</div>
  )
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } as const

  return (
    <CrmV2Drawer
      open
      onClose={onClose}
      width={560}
      header={<div style={{ fontSize: 16, fontWeight: 700 }}>Brief de la campagne</div>}
      footer={
        <>
          {!linked && <CrmV2Button variant="ghost" onClick={remove} style={{ color: crmV2.danger }}>Supprimer</CrmV2Button>}
          <div style={{ flex: 1 }} />
          <CrmV2Button onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
        </>
      }
    >
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {section(isGuide ? 'Guide' : 'Événement')}
        {isGuide ? (
          <>
            {text('title', 'Titre')}
            <div style={grid2}>
              <CrmV2Field label="Début de diffusion">
                <CrmV2Input type="date" value={d.event_date as string} onChange={(e) => set('event_date', e.target.value)} />
              </CrmV2Field>
              <CrmV2Field label="Fin de diffusion">
                <CrmV2Input type="date" value={d.end_date as string} onChange={(e) => set('end_date', e.target.value)} />
              </CrmV2Field>
            </div>
          </>
        ) : linked ? (
          <div style={{ fontSize: 13, color: crmV2.textMuted, background: crmV2.bgHover, padding: '10px 12px', borderRadius: crmV2.radius }}>
            <b style={{ color: crmV2.text }}>{ev.name}</b> — {frDay(ev.day)}<br />
            Nom et date viennent de l’onglet Événements.
          </div>
        ) : (
          <>
            {text('title', 'Titre')}
            <div style={grid2}>
              <CrmV2Field label="Date">
                <CrmV2Input type="date" value={d.event_date as string} onChange={(e) => set('event_date', e.target.value)} />
              </CrmV2Field>
              {text('event_time', 'Horaire', 'Mer. 19h00')}
            </div>
          </>
        )}
        {linked && !isGuide && text('event_time', 'Horaire', 'Mer. 19h00')}
        <div style={grid2}>
          <CrmV2Field label="Statut">
            <CrmV2Select value={d.status as string} onChange={(e) => set('status', e.target.value)}>
              <option value="">—</option>
              {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field label="Funnel">
            <CrmV2Select value={d.funnel as string} onChange={(e) => set('funnel', e.target.value)}>
              <option value="">—</option>
              {['Découverte', 'Considération', 'Conversion'].map((s) => <option key={s} value={s}>{s}</option>)}
            </CrmV2Select>
          </CrmV2Field>
        </div>

        {section('Ciblage et message')}
        {text('pilier', 'Pilier', 'Réforme PASS/LAS')}
        <div style={grid2}>
          {text('cible', 'Cible', 'Terminale + Parents')}
          {text('geo', 'Géo', 'France entière')}
        </div>
        {area('accroche', isGuide ? 'Accroche pub' : 'Accroche / angle')}
        {area('direction_crea', 'Direction créa (consignes pour les créatifs)')}
        {isGuide && area('format_contenu', 'Format et contenu')}
        <div style={grid2}>
          {isGuide ? text('linked_webinars', 'Webinaires liés') : text('intervenant', 'Intervenant')}
          {text('cta', isGuide ? 'Après le téléchargement' : 'CTA post-événement')}
        </div>

        {section('Budget')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {text('budget_target', 'Budget (€)')}
          {text('cpl_target', 'CPL cible (€)')}
          {text('cpl_ref', 'CPL réf. (€)')}
          {text('leads_expected', 'Leads attendus')}
        </div>
        {text('ref_diploma', 'Référence')}
        {area('budget_logic', 'Logique budget')}
        {area('why', 'Pourquoi / comment')}
        {area('to_check', 'Points à vérifier')}

        {!isGuide && section('Dates de campagne')}
        {isGuide ? (
          <CrmV2Field label="Livraison guide + créas (vide = calculée)">
            <CrmV2Input type="date" value={d.creas_date as string} onChange={(e) => set('creas_date', e.target.value)} />
          </CrmV2Field>
        ) : <>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: -4 }}>
          Vide = date calculée avec les délais de la marque (actuellement : créas {frDay(ev.creas_deadline)}, allumage {frDay(ev.campaign_start)}, extinction {frDay(ev.campaign_end)}).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <CrmV2Field label="Livraison créas">
            <CrmV2Input type="date" value={d.creas_date as string} onChange={(e) => set('creas_date', e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="Allumage">
            <CrmV2Input type="date" value={d.launch_date as string} onChange={(e) => set('launch_date', e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="Extinction">
            <CrmV2Input type="date" value={d.end_date as string} onChange={(e) => set('end_date', e.target.value)} />
          </CrmV2Field>
        </div>
        </>}
        <CrmV2Toggle checked={d.no_campaign as boolean} onChange={(v: boolean) => set('no_campaign', v)} label="Pas de campagne Ads pour cet événement (aucune relance)" />
      </div>
    </CrmV2Drawer>
  )
}
