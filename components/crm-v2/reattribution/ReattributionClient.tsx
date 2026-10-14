'use client'

/**
 * Réattribution des appels froids (admin, v86).
 *
 * Leads déjà attribués dont le premier appel (appel à froid, plus de 2 min de
 * conversation) n'a donné ni RDV ni inscription. On filtre par télépro et par
 * approche, on sélectionne, on donne à un ou plusieurs autres télépros
 * (jamais à quelqu'un qui a déjà eu le lead). Le télépro qui reçoit voit une
 * pastille « Transfert » avec le contexte de l'appel.
 *
 *  - Approche « Diploma Santé » ratée → à retenter tout de suite en approche étudiants / asso.
 *  - Approche « étudiants / asso » ratée → à replacer seulement quelques semaines après l'appel.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Forward, Headphones, RefreshCw } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Body, CrmV2Button, CrmV2Header, CrmV2Page, CrmV2Segmented, CrmV2Spinner } from '@/components/crm-v2/primitives'
import { AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import {
  APPROACH_LABELS, ETUDIANTS_RETRY_DAYS, formatCallWhen, formatTalk,
  type TransferCandidate, type TransferCandidatesPayload,
} from '@/lib/telepro-transfers-shared'

type ApproachTab = 'diploma' | 'etudiants' | 'inconnue' | 'tous'

const APPROACH_COLORS = { diploma: '#1d4ed8', etudiants: '#6d28d9' } as const

const selectStyle: React.CSSProperties = {
  height: 32, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
  padding: '0 10px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit',
}
const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
  color: crmV2.textMuted, background: crmV2.thBg, borderBottom: `2px solid ${crmV2.thBorder}`, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: `1px solid ${crmV2.border}`, verticalAlign: 'top', fontSize: 13 }

function chip(color: string, active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '4px 11px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    background: active ? color : crmV2.bg, color: active ? '#fff' : crmV2.text,
    border: `1px solid ${active ? color : crmV2.borderStrong}`,
  }
}

function approachOf(r: TransferCandidate): Exclude<ApproachTab, 'tous'> {
  return r.call.approach ?? 'inconnue'
}

function isReady(r: TransferCandidate): boolean {
  return !r.retry_after || Date.parse(r.retry_after) <= Date.now()
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

export default function ReattributionClient() {
  const [data, setData] = useState<TransferCandidatesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(60)
  const [tab, setTab] = useState<ApproachTab>('diploma')
  const [telepro, setTelepro] = useState<string>('') // rdv_users.id du télépro actuel
  const [cause, setCause] = useState('')
  const [showTransferred, setShowTransferred] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/crm/transfers/candidates?days=${days}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setData(j)
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [days])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const base = useMemo(() => rows.filter(r => (showTransferred || !r.transferred) && (!cause || r.call.cause === cause)), [rows, showTransferred, cause])
  const tabCounts = useMemo(() => {
    const c = { diploma: 0, etudiants: 0, inconnue: 0, tous: base.length, etudiantsReady: 0 }
    for (const r of base) {
      c[approachOf(r)]++
      if (approachOf(r) === 'etudiants' && isReady(r)) c.etudiantsReady++
    }
    return c
  }, [base])
  const inTab = useMemo(() => base.filter(r => tab === 'tous' || approachOf(r) === tab), [base, tab])
  const teleproCounts = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>()
    for (const r of inTab) {
      const k = r.telepro.id ?? r.telepro.hs_id
      const e = m.get(k) ?? { name: r.telepro.name, count: 0 }
      e.count++
      m.set(k, e)
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count)
  }, [inTab])
  const visible = useMemo(() => inTab.filter(r => !telepro || (r.telepro.id ?? r.telepro.hs_id) === telepro), [inTab, telepro])
  const selectable = (r: TransferCandidate) => isReady(r) && !r.transferred
  const selectableVisible = visible.filter(selectable)
  const selectedRows = rows.filter(r => selected.has(r.hubspot_contact_id))

  // Télépros proposés : tous sauf ceux qui ont déjà eu TOUS les leads sélectionnés
  const targetChoices = useMemo(() => (data?.telepros ?? []).map(t => {
    const blocked = selectedRows.filter(r => r.previous_holders.includes(t.id)).length
    return { ...t, blocked, allBlocked: selectedRows.length > 0 && blocked === selectedRows.length }
  }), [data, selectedRows])

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    const allOn = selectableVisible.length > 0 && selectableVisible.every(r => selected.has(r.hubspot_contact_id))
    setSelected(prev => {
      const n = new Set(prev)
      for (const r of selectableVisible) { if (allOn) n.delete(r.hubspot_contact_id); else n.add(r.hubspot_contact_id) }
      return n
    })
  }

  async function submit() {
    if (!selectedRows.length || !targets.size) return
    const names = (data?.telepros ?? []).filter(t => targets.has(t.id)).map(t => t.name).join(', ')
    if (!confirm(`Réattribuer ${selectedRows.length} lead${selectedRows.length > 1 ? 's' : ''} à ${names} ?${targets.size > 1 ? '\n\nRépartition équitable entre eux.' : ''}\n\nUn lead n'est jamais redonné à un télépro qui l'a déjà eu.`)) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/crm/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedRows.map(r => ({ contact_id: r.hubspot_contact_id, aircall_call_id: r.call.aircall_call_id })),
          to_rdv_user_ids: [...targets],
          note,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      const by = (j.by_telepro ?? []).map((x: { name: string; count: number }) => `${x.name} ${x.count}`).join(', ')
      setResult(`${j.done} lead${j.done > 1 ? 's' : ''} transféré${j.done > 1 ? 's' : ''}${by ? ` (${by})` : ''}${j.skipped?.length ? ` · ${j.skipped.length} ignoré${j.skipped.length > 1 ? 's' : ''} : déjà eus par le(s) télépro(s) choisi(s)` : ''}.`)
      setTargets(new Set()); setNote('')
      await load()
    } catch (e) {
      setResult(e instanceof Error ? `Échec : ${e.message}` : 'Échec')
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: ApproachTab; label: string }[] = [
    { id: 'diploma', label: `Approche Diploma → à retenter (${tabCounts.diploma})` },
    { id: 'etudiants', label: `Approche étudiants → plus tard (${tabCounts.etudiants}${tabCounts.etudiantsReady ? ` · ${tabCounts.etudiantsReady} prêts` : ''})` },
    { id: 'inconnue', label: `Approche non détectée (${tabCounts.inconnue})` },
    { id: 'tous', label: `Tous (${tabCounts.tous})` },
  ]
  const tabHelp: Record<ApproachTab, string> = {
    diploma: 'Le premier appel s’est fait en « Bonjour, c’est Diploma Santé » et n’a pas marché : on retente tout de suite avec l’approche étudiants / asso, par un autre télépro.',
    etudiants: `L’approche étudiants / asso a déjà été tentée et n’a pas marché : on ne replace le lead que ${ETUDIANTS_RETRY_DAYS / 7} semaines après l’appel. Ceux qui ne sont pas encore prêts sont grisés.`,
    inconnue: 'Appels pas encore analysés (ou approche pas reconnue) : écoutez l’appel avant de décider.',
    tous: 'Tous les leads, quelle que soit l’approche.',
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Réattribution des appels froids"
        subtitle="Leads déjà attribués dont le premier appel (plus de 2 min) n’a donné ni RDV ni inscription. Le télépro qui les reçoit voit une pastille « Transfert » avec le contexte de l’appel."
        actions={<CrmV2Button icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>Actualiser</CrmV2Button>}
      />
      <CrmV2Body>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        {data && !data.available && (
          <AdminNotice tone="warning">La table des transferts n’existe pas encore (migration v86 à lancer dans Supabase) : la liste s’affiche, mais la réattribution est bloquée.</AdminNotice>
        )}
        {result && <AdminNotice tone={result.startsWith('Échec') ? 'error' : 'success'}>{result}</AdminNotice>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CrmV2Segmented items={tabs} value={tab} onChange={v => { setTab(v); setTelepro(''); setSelected(new Set()) }} />
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>{tabHelp[tab]}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginRight: 2 }}>Télépro actuel :</span>
            <button type="button" onClick={() => setTelepro('')} style={chip(crmV2.primary, !telepro)}>Tous ({inTab.length})</button>
            {teleproCounts.map(([id, t]) => (
              <button key={id} type="button" onClick={() => { setTelepro(id); setSelected(new Set()) }} style={chip(crmV2.primary, telepro === id)}>
                {t.name} ({t.count})
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={days} onChange={e => setDays(Number(e.target.value))} style={selectStyle}>
              {[14, 30, 60, 90, 180].map(d => <option key={d} value={d}>Appels des {d} derniers jours</option>)}
            </select>
            <select value={cause} onChange={e => setCause(e.target.value)} style={selectStyle}>
              <option value="">Toutes les raisons</option>
              {(data?.causes ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: crmV2.textMuted }}>
              <input type="checkbox" checked={showTransferred} onChange={e => setShowTransferred(e.target.checked)} /> Afficher les déjà transférés
            </label>
          </div>
        </div>

        {/* Barre de réattribution */}
        {selectedRows.length > 0 && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 20, background: crmV2.bg, border: `1px solid ${crmV2.link}`, borderRadius: 14,
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: crmV2.shadow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{selectedRows.length} lead{selectedRows.length > 1 ? 's' : ''} sélectionné{selectedRows.length > 1 ? 's' : ''}</strong>
              <span style={{ fontSize: 13, color: crmV2.textMuted }}>→ donner à (un ou plusieurs, répartition équitable) :</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {targetChoices.map(t => (
                <button
                  key={t.id}
                  type="button"
                  disabled={t.allBlocked}
                  title={t.allBlocked ? 'A déjà eu tous ces leads' : t.blocked ? `A déjà eu ${t.blocked} de ces leads : ils iront aux autres` : undefined}
                  onClick={() => setTargets(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}
                  style={{ ...chip('#ea580c', targets.has(t.id)), opacity: t.allBlocked ? 0.35 : 1, cursor: t.allBlocked ? 'not-allowed' : 'pointer' }}
                >
                  {t.name}{t.blocked > 0 && !t.allBlocked ? ` (sauf ${t.blocked})` : ''}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Mot pour le télépro (facultatif) : ex. « reprends en approche asso, parle aux parents »"
                style={{ ...selectStyle, flex: '1 1 320px' }}
              />
              <CrmV2Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Désélectionner</CrmV2Button>
              <CrmV2Button variant="primary" icon={<Forward size={14} />} onClick={submit} disabled={busy || !targets.size || (data ? !data.available : true)}>
                {busy ? 'Transfert…' : `Réattribuer ${selectedRows.length} lead${selectedRows.length > 1 ? 's' : ''}`}
              </CrmV2Button>
            </div>
          </div>
        )}

        {loading && !data ? <CrmV2Spinner /> : (
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={selectableVisible.length > 0 && selectableVisible.every(r => selected.has(r.hubspot_contact_id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th style={th}>Contact</th>
                  <th style={th}>Télépro actuel</th>
                  <th style={th}>Premier appel</th>
                  <th style={th}>Approche</th>
                  <th style={th}>Pourquoi pas de RDV</th>
                  <th style={th}>À replacer</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: crmV2.textMuted, padding: 30 }}>
                    {loading ? 'Chargement…' : 'Aucun lead dans cette catégorie.'}
                  </td></tr>
                )}
                {visible.map(r => {
                  const can = selectable(r)
                  const open = expanded.has(r.hubspot_contact_id)
                  const ap = r.call.approach
                  return (
                    <Fragment key={r.hubspot_contact_id}>
                      <tr style={{ background: selected.has(r.hubspot_contact_id) ? 'rgba(0,145,174,0.05)' : undefined, opacity: can ? 1 : 0.55 }}>
                        <td style={td}>
                          <input type="checkbox" disabled={!can} checked={selected.has(r.hubspot_contact_id)} onChange={() => toggle(r.hubspot_contact_id)} aria-label={`Sélectionner ${r.name}`} />
                        </td>
                        <td style={td}>
                          <a href={`/admin/crm/contacts/${r.hubspot_contact_id}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: crmV2.link, textDecoration: 'none' }}>{r.name}</a>
                          <div style={{ fontSize: 12, color: crmV2.textMuted }}>{[r.classe, r.lead_status].filter(Boolean).join(' · ')}</div>
                          {r.later_calls > 0 && <div style={{ fontSize: 11, color: crmV2.textFaint }}>{r.later_calls} appel{r.later_calls > 1 ? 's' : ''} de plus de 2 min depuis</div>}
                        </td>
                        <td style={td}>
                          <strong style={{ fontWeight: 600 }}>{r.telepro.name}</strong>
                          {r.call.caller && r.call.caller.id !== r.telepro.id && <div style={{ fontSize: 11, color: crmV2.textMuted }}>appelé par {r.call.caller.name}</div>}
                        </td>
                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{formatCallWhen(r.call.started_at)}</div>
                          <div style={{ fontSize: 12, color: crmV2.textMuted }}>{formatTalk(r.call.talk_sec)}{r.call.caller ? ` · ${r.call.caller.name}` : ''}</div>
                        </td>
                        <td style={td}>
                          {ap ? (
                            <span style={{ ...chip(APPROACH_COLORS[ap], true), cursor: 'default', padding: '2px 9px', fontSize: 11, background: `${APPROACH_COLORS[ap]}18`, color: APPROACH_COLORS[ap], border: `1px solid ${APPROACH_COLORS[ap]}55` }}>
                              {ap === 'diploma' ? 'Diploma Santé' : 'Étudiants / asso'}
                            </span>
                          ) : <span style={{ fontSize: 12, color: crmV2.textFaint }}>{r.call.analysed ? 'Non reconnue' : 'Pas analysé'}</span>}
                        </td>
                        <td style={{ ...td, maxWidth: 360 }}>
                          {r.call.cause_label && <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 12 }}>{r.call.cause_label}</div>}
                          {r.call.summary && (
                            <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: open ? 'unset' : 2, WebkitBoxOrient: 'vertical' }}>
                              {r.call.summary}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                            {(r.call.summary || r.call.missing || r.call.advice) && (
                              <button type="button" onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(r.hubspot_contact_id)) n.delete(r.hubspot_contact_id); else n.add(r.hubspot_contact_id); return n })}
                                style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: crmV2.link, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {open ? 'Moins' : 'Détail'}
                              </button>
                            )}
                            {r.call.recording_url && (
                              <a href={r.call.recording_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: crmV2.link, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Headphones size={11} /> Écouter
                              </a>
                            )}
                          </div>
                        </td>
                        <td style={td}>
                          {r.transferred ? (
                            <span style={{ fontSize: 12, color: '#c2410c', fontWeight: 600 }}>Transféré à {r.transferred.to_name} le {fmtDay(r.transferred.created_at)}</span>
                          ) : r.retry_after && !isReady(r) ? (
                            <span style={{ fontSize: 12, color: APPROACH_COLORS.etudiants, fontWeight: 700 }}>À partir du {fmtDay(r.retry_after)}</span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>Maintenant</span>
                          )}
                        </td>
                      </tr>
                      {open && (r.call.missing || r.call.advice) && (
                        <tr>
                          <td style={{ ...td, background: crmV2.bgHover }} />
                          <td colSpan={6} style={{ ...td, background: crmV2.bgHover, fontSize: 12, color: crmV2.text }}>
                            {r.call.missing && <div><strong>Ce qui a manqué :</strong> {r.call.missing}</div>}
                            {r.call.advice && <div style={{ marginTop: 4 }}><strong>Conseil :</strong> {r.call.advice}</div>}
                            {ap && <div style={{ marginTop: 4, color: crmV2.textMuted }}>{APPROACH_LABELS[ap]}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}
