'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ExternalLink, Mail, Phone, Plane, RefreshCw, X } from 'lucide-react'
import {
  CrmV2Button, CrmV2Drawer, CrmV2Empty, CrmV2Pagination, CrmV2Search, CrmV2Spinner, CrmV2TableCard,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  EDUMOVE_TRACKING_BY_UNI, EDUMOVE_TRACKING_LABELS, EDUMOVE_UNIS, type EdumoveStage,
} from '@/lib/edumove-stage'
import { EdumoveDossier, STAGE_STYLE, type Dossier } from '@/components/crm-v2/contact/EdumoveSection'
import { QUEUES, fullName, queueOf, trackingOf, type DossierLite, type QueueId } from './types'
import EdumoveSuiviTable from './EdumoveSuiviTable'

const PAGE_SIZE = 50
const pillSelect: CSSProperties = {
  fontSize: 13, padding: '7px 10px', borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.text, fontFamily: 'inherit',
}
const STAGE_TABS: { id: EdumoveStage | 'actifs'; label: string }[] = [
  { id: 'actifs', label: 'Tous (hors archives)' },
  { id: 'compte', label: 'Comptes' },
  { id: 'candidature', label: 'Candidature déposée' },
  { id: 'reponse', label: 'Réponse envoyée' },
  { id: 'choix_faits', label: 'Facs choisies' },
  { id: 'inscrit', label: 'Inscrits' },
  { id: 'archive', label: 'Archivés' },
]


const chip = (active: boolean): CSSProperties => ({
  fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${active ? crmV2.gold : crmV2.border}`, background: active ? crmV2.goldSoft : crmV2.bg, color: crmV2.text,
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
})

export default function EdumoveDossiersTab({ dossiers, loading, error, onReload, onPatched, onMail }: {
  dossiers: DossierLite[]
  loading: boolean
  error: string | null
  onReload: () => Promise<void> | void
  onPatched: (id: string, patch: Partial<DossierLite>) => void
  onMail: (targets: DossierLite[], templateId?: string) => void
}) {
  const [queue, setQueue] = useState<QueueId | null>(null)
  const [stage, setStage] = useState<EdumoveStage | 'actifs'>('actifs')
  const [fac, setFac] = useState('')
  const [facStep, setFacStep] = useState('')
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
    if (fac) list = list.filter(d => d.facs.includes(fac) || (!facStep && d.facs.length === 0 && d.destinations[0] === fac))
    if (fac && facStep) list = list.filter(d => d.facs.includes(fac) && trackingOf(d, fac) === facStep)
    if (q) {
      const digits = q.replace(/\D/g, '')
      list = list.filter(d =>
        fullName(d).toLowerCase().includes(q) || (d.email ?? '').toLowerCase().includes(q)
        || (digits.length >= 4 && (d.tel ?? '').replace(/\D/g, '').includes(digits)))
    }
    return list
  }, [dossiers, queues, queue, stage, fac, facStep, search])

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
              <select value={fac} onChange={e => { setFac(e.target.value); setFacStep(''); resetView() }} aria-label="Fac" style={pillSelect}>
                <option value="">Toutes les facs</option>
                {EDUMOVE_UNIS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
              </select>
              {fac && (
                <select value={facStep} onChange={e => { setFacStep(e.target.value); resetView() }} aria-label="Étape de la fac" style={pillSelect}>
                  <option value="">{fac} : toutes les étapes</option>
                  {(EDUMOVE_TRACKING_BY_UNI[fac] ?? []).map(t => <option key={t} value={t}>{fac} · {EDUMOVE_TRACKING_LABELS[t] ?? t}</option>)}
                </select>
              )}
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
          <EdumoveSuiviTable
            rows={pageRows}
            selected={selected}
            onToggle={toggle}
            allSelected={allPageSelected}
            onToggleAll={() => setSelected(prev => {
              const n = new Set(prev)
              for (const d of pageRows) { if (allPageSelected) n.delete(d.candidature_id); else n.add(d.candidature_id) }
              return n
            })}
            openId={openId}
            onOpen={setOpenId}
            onPatched={onPatched}
          />
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
