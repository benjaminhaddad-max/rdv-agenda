'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ExternalLink, Mail, Phone, PhoneCall, Plane, RefreshCw, X } from 'lucide-react'
import {
  CrmV2Button, CrmV2Drawer, CrmV2Empty, CrmV2Pagination, CrmV2Search, CrmV2Spinner, CrmV2StatusPill,
  CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  EDUMOVE_SITUATION_LABELS, EDUMOVE_STAGE_LABELS, EDUMOVE_TRACKING_LABELS, EDUMOVE_UNIS, type EdumoveStage,
} from '@/lib/edumove-stage'
import { EdumoveDossier, STAGE_STYLE, type Dossier } from '@/components/crm-v2/contact/EdumoveSection'
import { QUEUES, fullName, queueOf, trackingOf, type DossierLite, type QueueId } from './types'

const PAGE_SIZE = 50
const STAGE_TABS: { id: EdumoveStage | 'actifs'; label: string }[] = [
  { id: 'actifs', label: 'Tous (hors archives)' },
  { id: 'compte', label: 'Comptes' },
  { id: 'candidature', label: 'Candidature déposée' },
  { id: 'reponse', label: 'Réponse envoyée' },
  { id: 'choix_faits', label: 'Facs choisies' },
  { id: 'inscrit', label: 'Inscrits' },
  { id: 'archive', label: 'Archivés' },
]
const SHORT_UNI: Record<string, string> = { LINK: 'LINK', UCJC: 'UCJC', UE: 'UE' }

const fmtDate = (d: string | null) => (d ? format(new Date(d), 'd MMM yyyy', { locale: fr }) : '—')

const chip = (active: boolean): CSSProperties => ({
  fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${active ? crmV2.gold : crmV2.border}`, background: active ? crmV2.goldSoft : crmV2.bg, color: crmV2.text,
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
})

export default function EdumoveDossiersTab({ dossiers, loading, error, onReload, onMail }: {
  dossiers: DossierLite[]
  loading: boolean
  error: string | null
  onReload: () => Promise<void> | void
  onMail: (targets: DossierLite[], templateId?: string) => void
}) {
  const [queue, setQueue] = useState<QueueId | null>(null)
  const [stage, setStage] = useState<EdumoveStage | 'actifs'>('actifs')
  const [fac, setFac] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)

  const queues = useMemo(() => {
    const m = new Map<QueueId, DossierLite[]>()
    for (const d of dossiers) {
      const q = queueOf(d)
      if (q) m.set(q, [...(m.get(q) ?? []), d])
    }
    return m
  }, [dossiers])

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = { actifs: 0 }
    for (const d of dossiers) {
      c[d.stage] = (c[d.stage] ?? 0) + 1
      if (d.stage !== 'archive') c.actifs++
    }
    return c
  }, [dossiers])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = queue ? (queues.get(queue) ?? []) : dossiers.filter(d => (stage === 'actifs' ? d.stage !== 'archive' : d.stage === stage))
    if (fac) list = list.filter(d => d.facs.includes(fac) || (d.facs.length === 0 && d.destinations[0] === fac))
    if (q) {
      const digits = q.replace(/\D/g, '')
      list = list.filter(d =>
        fullName(d).toLowerCase().includes(q) || (d.email ?? '').toLowerCase().includes(q)
        || (digits.length >= 4 && (d.tel ?? '').replace(/\D/g, '').includes(digits)))
    }
    return list
  }, [dossiers, queues, queue, stage, fac, search])

  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allPageSelected = pageRows.length > 0 && pageRows.every(d => selected.has(d.candidature_id))
  const selectedRows = dossiers.filter(d => selected.has(d.candidature_id))
  const current = queue ? QUEUES.find(x => x.id === queue) : null
  const open = openId ? dossiers.find(d => d.candidature_id === openId) ?? null : null

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const resetView = () => { setPage(1); setSelected(new Set()) }

  if (error) return <CrmV2Empty icon={<Plane size={28} />} title={error} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* À faire */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: crmV2.textMuted, marginBottom: 8 }}>À faire</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {QUEUES.map(q => {
            const n = queues.get(q.id)?.length ?? 0
            const active = queue === q.id
            return (
              <button key={q.id} type="button" title={q.help}
                onClick={() => { setQueue(active ? null : q.id); resetView() }}
                style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 12, padding: '12px 14px',
                  border: `1.5px solid ${active ? crmV2.gold : crmV2.border}`, background: active ? crmV2.goldSoft : crmV2.bg,
                }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: n ? crmV2.text : crmV2.textFaint, lineHeight: 1.1 }}>{loading ? '…' : n}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: crmV2.textMuted, marginTop: 4 }}>{q.label}</div>
              </button>
            )
          })}
        </div>
      </div>

      {current && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12, background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}` }}>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: crmV2.text }}>
            <strong>{current.label}.</strong> {current.help}
          </div>
          {current.template && visible.length > 0 && (
            <CrmV2Button size="sm" variant="primary" icon={<Mail size={13} />} onClick={() => onMail(visible.slice(0, 300), current.template)}>
              {visible.length === 1 ? 'Lui écrire' : `Écrire aux ${Math.min(visible.length, 300)}`}
            </CrmV2Button>
          )}
          <CrmV2Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setQueue(null); resetView() }}>Fermer</CrmV2Button>
        </div>
      )}

      <CrmV2TableCard
        toolbar={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            {!queue && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STAGE_TABS.map(s => (
                  <button key={s.id} type="button" style={chip(stage === s.id)} onClick={() => { setStage(s.id); resetView() }}>
                    {s.id !== 'actifs' && <span style={{ width: 7, height: 7, borderRadius: 99, background: STAGE_STYLE[s.id].dot }} />}
                    {s.label}<span style={{ color: crmV2.textFaint }}>{stageCounts[s.id] ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <CrmV2Search placeholder="Nom, e-mail ou téléphone…" value={search} onChange={e => { setSearch(e.target.value); resetView() }} />
              <select value={fac} onChange={e => { setFac(e.target.value); resetView() }} aria-label="Fac"
                style={{ fontSize: 13, padding: '7px 10px', borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.text, fontFamily: 'inherit' }}>
                <option value="">Toutes les facs</option>
                {EDUMOVE_UNIS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
              </select>
              <div style={{ flex: 1 }} />
              {selected.size > 0 && (
                <>
                  <span style={{ fontSize: 13, color: crmV2.textMuted }}>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
                  <CrmV2Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Désélectionner</CrmV2Button>
                  <CrmV2Button size="sm" variant="primary" icon={<Mail size={13} />} onClick={() => onMail(selectedRows)}>Envoyer un mail</CrmV2Button>
                </>
              )}
              <CrmV2Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={() => void onReload()} title="Recharger">Actualiser</CrmV2Button>
            </div>
          </div>
        }
        footer={!loading && visible.length > PAGE_SIZE ? (
          <CrmV2Pagination page={page} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} />
        ) : !loading ? <span>{visible.length} dossier{visible.length > 1 ? 's' : ''}</span> : undefined}
      >
        {loading ? <CrmV2Spinner /> : visible.length === 0 ? (
          <CrmV2Empty icon={<Plane size={28} />} title={queue ? 'Rien à faire ici 🎉' : 'Aucun dossier dans cette vue'} />
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th style={{ width: 36 }}>
                  <input type="checkbox" aria-label="Tout sélectionner" checked={allPageSelected}
                    onChange={() => setSelected(prev => {
                      const n = new Set(prev)
                      for (const d of pageRows) { if (allPageSelected) n.delete(d.candidature_id); else n.add(d.candidature_id) }
                      return n
                    })} />
                </CrmV2Th>
                <CrmV2Th>Candidat</CrmV2Th>
                <CrmV2Th>Étape</CrmV2Th>
                <CrmV2Th>Facs · suivi</CrmV2Th>
                <CrmV2Th>Pièces</CrmV2Th>
                <CrmV2Th>Situation</CrmV2Th>
                <CrmV2Th>Déposée</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(d => {
                const st = STAGE_STYLE[d.stage] ?? STAGE_STYLE.candidature
                return (
                  <CrmV2Tr key={d.candidature_id} onClick={() => setOpenId(d.candidature_id)}
                    style={openId === d.candidature_id ? { background: crmV2.bgMuted } : undefined}>
                    <CrmV2Td>
                      <span onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Sélectionner ${fullName(d)}`} checked={selected.has(d.candidature_id)} onChange={() => toggle(d.candidature_id)} />
                      </span>
                    </CrmV2Td>
                    <CrmV2Td style={{ maxWidth: 260 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {fullName(d)}
                        {d.callback && <PhoneCall size={13} color="#b45309" aria-label="Rappel demandé" />}
                      </div>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.email}</div>
                    </CrmV2Td>
                    <CrmV2Td><CrmV2StatusPill label={EDUMOVE_STAGE_LABELS[d.stage]} color={st.color} bg={st.bg} /></CrmV2Td>
                    <CrmV2Td>
                      {d.facs.length ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {d.facs.map(u => {
                            const t = trackingOf(d, u)
                            const color = t === 'inscrit' ? '#047857' : t === 'refuse' || t === 'autre_agence' ? '#b91c1c' : t === 'en_attente' ? crmV2.textMuted : '#1d4ed8'
                            return (
                              <span key={u} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, color, whiteSpace: 'nowrap' }}>
                                {SHORT_UNI[u] ?? u} · {EDUMOVE_TRACKING_LABELS[t] ?? t}
                              </span>
                            )
                          })}
                        </div>
                      ) : <span style={{ fontSize: 12, color: crmV2.textFaint }}>{d.destinations.length ? `Vœu : ${d.destinations.slice(0, 2).join(' > ')}` : '—'}</span>}
                    </CrmV2Td>
                    <CrmV2Td>
                      {d.facs.length === 0 ? <span style={{ color: crmV2.textFaint }}>—</span>
                        : d.missing.length ? <span style={{ fontSize: 12.5, fontWeight: 600, color: '#b91c1c' }}>{d.missing.length} manquante{d.missing.length > 1 ? 's' : ''}</span>
                        : <span style={{ fontSize: 12.5, fontWeight: 600, color: '#047857' }}>Complet</span>}
                    </CrmV2Td>
                    <CrmV2Td style={{ fontSize: 12.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                      {d.stage === 'compte' ? '—' : EDUMOVE_SITUATION_LABELS[d.situation ?? 'nouveau'] ?? d.situation}
                    </CrmV2Td>
                    <CrmV2Td style={{ fontSize: 12.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>

      <CrmV2Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        width={560}
        header={open ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fullName(open)}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
              {open.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={13} /> {open.email}</span>}
              {open.tel && <a href={`tel:${open.tel}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: crmV2.link }}><Phone size={13} /> {open.tel}</a>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Button size="sm" variant="primary" icon={<Mail size={13} />} onClick={() => onMail([open])}>Envoyer un mail</CrmV2Button>
              {open.contact_id && (
                <CrmV2Button size="sm" icon={<ExternalLink size={13} />} onClick={() => window.open(`/admin/crm-v2/contacts/${encodeURIComponent(open.contact_id!)}`, '_blank')}>
                  Fiche contact
                </CrmV2Button>
              )}
            </div>
          </div>
        ) : null}
      >
        {open && <DossierPanel key={open.candidature_id} lite={open} onChanged={() => void onReload()} />}
      </CrmV2Drawer>
    </div>
  )
}

/** Dossier complet (pièces, conversations, actions) : même bloc que la fiche contact. */
function DossierPanel({ lite, onChanged }: { lite: DossierLite; onChanged: () => void }) {
  const [d, setD] = useState<Dossier | null | 'none'>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const contactId = lite.contact_id
    const p = contactId
      ? fetch(`/api/crm/contacts/${encodeURIComponent(contactId)}/edumove`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .then(j => (j?.dossiers as Dossier[] | undefined)?.find(x => x.candidature_id === lite.candidature_id) ?? 'none' as const)
          .catch(() => 'none' as const)
      : Promise.resolve('none' as const)
    let alive = true
    void p.then(v => { if (alive) setD(v) })
    return () => { alive = false }
  }, [lite.contact_id, lite.candidature_id, version])

  if (d === null) return <CrmV2Spinner />
  if (d === 'none') return <div style={{ fontSize: 13, color: crmV2.textMuted }}>Dossier pas encore rattaché à un contact : il le sera à la prochaine synchro (10 min).</div>
  return <EdumoveDossier d={d} bare onChanged={() => { setVersion(v => v + 1); onChanged() }} />
}
