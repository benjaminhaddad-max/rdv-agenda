'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  FileText, Plus, ExternalLink, Copy, Trash2,
  CheckCircle2, Eye, Send, Download, Loader2, FolderInput,
  AlertTriangle, Check, RefreshCw, XCircle, Lightbulb, ChevronLeft,
} from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Empty, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2KpiCard, CrmV2KpiGrid,
  CrmV2Page, CrmV2Search, CrmV2Select, CrmV2Spinner, CrmV2StatusPill, CrmV2Table, CrmV2TableCard,
  CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  MKT_TONES, MktIconBox, MktIconButton, MktMenu, MktMobileRow, MktModal, MktNameCell, MktNotice, MktSelectPill,
  mutedCell, numCell, useCrmBase,
} from '@/components/crm-v2/marketing/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

interface Form {
  id: string
  name: string
  slug: string
  title: string | null
  status: 'draft' | 'published' | 'archived'
  primary_color: string
  view_count: number
  submission_count: number
  created_at: string
  updated_at: string
  folder?: string | null
}

const STATUS_META: Record<Form['status'], { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon', ...MKT_TONES.gold },
  published: { label: 'Publié',    ...MKT_TONES.green },
  archived:  { label: 'Archivé',   ...MKT_TONES.grey },
}

// Dossiers de classement des formulaires (7 marques du groupe)
const FOLDERS = ['Diploma Santé', 'Medibox', 'Edumove', 'Linova Education', 'AFEM', 'Prépa Médecine.fr', 'Hermione'] as const
type Folder = typeof FOLDERS[number]
const DEFAULT_FOLDER: Folder = 'Diploma Santé'

// Couleur par dossier (déco)
const FOLDER_COLOR: Record<Folder, string> = {
  'Diploma Santé':     '#22c55e',
  'Medibox':           '#14b8a6',
  'Edumove':           '#0ea5e9',
  'Linova Education':  '#a855f7',
  'AFEM':              '#f59e0b',
  'Prépa Médecine.fr': '#ef4444',
  'Hermione':          '#ec4899',
}

function getFolder(f: Form): Folder {
  const x = (f.folder ?? '').trim()
  return (FOLDERS as readonly string[]).includes(x) ? (x as Folder) : DEFAULT_FOLDER
}

function ago(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return formatDistanceToNow(d, { addSuffix: true, locale: fr })
}

export default function FormsPage() {
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [folderFilter, setFolderFilter] = useState<Folder>(DEFAULT_FOLDER)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  // Mobile : choix du dossier dans une fenêtre dédiée
  const [moveForm, setMoveForm] = useState<Form | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/forms')
      const data = await res.json()
      setForms(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = forms.filter(f => {
    if (getFolder(f) !== folderFilter) return false
    if (statusFilter && f.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
    }
    return true
  })

  // Compteurs par dossier (pour les onglets)
  const folderCounts: Record<Folder, number> = {
    'Diploma Santé': 0, 'Medibox': 0, 'Edumove': 0, 'Linova Education': 0, 'AFEM': 0, 'Prépa Médecine.fr': 0, 'Hermione': 0,
  }
  for (const f of forms) folderCounts[getFolder(f)]++

  const moveToFolder = async (f: Form, target: Folder) => {
    // Optimiste : maj locale
    setForms(prev => prev.map(x => x.id === f.id ? { ...x, folder: target } : x))
    const res = await fetch(`/api/forms/${f.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: target }),
    })
    if (!res.ok) {
      // Revert si erreur
      setForms(prev => prev.map(x => x.id === f.id ? { ...x, folder: f.folder } : x))
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Impossible de changer le dossier')
    }
  }

  const remove = async (f: Form) => {
    if (!confirm(`Supprimer le formulaire "${f.name}" et toutes ses soumissions ?`)) return
    const res = await fetch(`/api/forms/${f.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error)
  }

  const duplicate = async (f: Form) => {
    const res = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `${f.name} (copie)`, skipDefaultFields: true }),
    })
    if (res.ok) load()
  }

  const stats = {
    total: forms.length,
    published: forms.filter(f => f.status === 'published').length,
    totalViews: forms.reduce((s, f) => s + (f.view_count || 0), 0),
    totalSubmissions: forms.reduce((s, f) => s + (f.submission_count || 0), 0),
  }

  const openForm = (f: Form) => { window.location.href = `${base}/forms/${f.id}` }
  const openPublic = (f: Form) => { window.open(`/forms/${f.slug}`, '_blank') }

  const folderSelect = (f: Form) => {
    const current = getFolder(f)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: FOLDER_COLOR[current], flexShrink: 0 }} />
        <MktSelectPill
          value={current}
          title="Déplacer dans un autre dossier"
          onChange={e => {
            const v = e.target.value as Folder
            if (v !== current) moveToFolder(f, v)
          }}
          style={{ height: 32 }}
        >
          {FOLDERS.map(x => <option key={x} value={x}>{x}</option>)}
        </MktSelectPill>
      </span>
    )
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Formulaires"
        subtitle={loading ? 'Formulaires web et intégrations' : `${stats.total.toLocaleString('fr-FR')} formulaire${stats.total > 1 ? 's' : ''} · formulaires web et intégrations`}
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<Download size={14} />} onClick={() => setShowImportModal(true)}>
              {isMobile ? 'Importer' : 'Importer des formulaires'}
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewModal(true)}>
              Créer un formulaire
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          items={FOLDERS.map(f => ({ id: f, label: f, count: folderCounts[f] }))}
          value={folderFilter}
          onChange={id => setFolderFilter(id as Folder)}
        />
      </CrmV2Header>

      <CrmV2Body>
        <CrmV2KpiGrid>
          <CrmV2KpiCard label="Total" value={stats.total} color={crmV2.gold} icon={<FileText size={15} />} detail="Toutes marques" />
          <CrmV2KpiCard label="Publiés" value={stats.published} color="#16a34a" icon={<CheckCircle2 size={15} />} detail="En ligne" />
          <CrmV2KpiCard label="Vues totales" value={stats.totalViews.toLocaleString('fr-FR')} color={crmV2.link} icon={<Eye size={15} />} detail="Affichages des formulaires" />
          <CrmV2KpiCard label="Soumissions" value={stats.totalSubmissions.toLocaleString('fr-FR')} color="#7e22ce" icon={<Send size={15} />} detail="Hors spam" />
        </CrmV2KpiGrid>

        <CrmV2TableCard
          toolbar={
            <>
              <CrmV2Search
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un formulaire…"
                style={isMobile ? { flex: '1 1 100%' } : undefined}
              />
              <MktSelectPill value={statusFilter} active={!!statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Statut : tous</option>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </MktSelectPill>
            </>
          }
        >
          {loading ? (
            <CrmV2Spinner />
          ) : filtered.length === 0 ? (
            forms.length === 0 ? (
              <CrmV2Empty
                icon={<FileText size={26} />}
                title="Aucun formulaire pour le moment"
                description="Crée un formulaire pour capturer des prospects sur ton site."
                action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewModal(true)}>Créer mon premier formulaire</CrmV2Button>}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: crmV2.textMuted, fontSize: 13 }}>Aucun formulaire ne correspond aux filtres.</div>
            )
          ) : isMobile ? (
            <div>
              {filtered.map(f => {
                const meta = STATUS_META[f.status]
                return (
                  <MktMobileRow
                    key={f.id}
                    href={`${base}/forms/${f.id}`}
                    icon={<MktIconBox color={meta.color} bg={meta.bg} size={32}><FileText size={15} /></MktIconBox>}
                    title={f.name}
                    subtitle={`${(f.submission_count || 0).toLocaleString('fr-FR')} soumission${f.submission_count > 1 ? 's' : ''} · ${f.view_count || 0} vues`}
                    right={<CrmV2StatusPill label={meta.label} color={meta.color} bg={meta.bg} />}
                    actions={
                      <MktMenu items={[
                        ...(f.status === 'published' ? [{ label: 'Voir la page publique', icon: <ExternalLink size={14} />, onClick: () => openPublic(f) }] : []),
                        { label: 'Changer de dossier', icon: <FolderInput size={14} />, onClick: () => setMoveForm(f) },
                        { label: 'Dupliquer', icon: <Copy size={14} />, onClick: () => duplicate(f) },
                        { label: 'Supprimer', icon: <Trash2 size={14} />, onClick: () => remove(f), danger: true },
                      ]} />
                    }
                  />
                )
              })}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Formulaire</CrmV2Th>
                  <CrmV2Th>Marque</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Vues</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Soumissions</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Conversion</CrmV2Th>
                  <CrmV2Th>Statut</CrmV2Th>
                  <CrmV2Th>Mis à jour</CrmV2Th>
                  <CrmV2Th style={{ width: 1 }}>{''}</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const meta = STATUS_META[f.status]
                  const conversionRate = f.view_count > 0 ? Math.round((f.submission_count / f.view_count) * 100) : 0
                  return (
                    <CrmV2Tr key={f.id} onClick={() => openForm(f)}>
                      <CrmV2Td style={{ maxWidth: 380 }}>
                        <MktNameCell
                          icon={<FileText size={14} />}
                          iconColor={meta.color}
                          iconBg={meta.bg}
                          href={`${base}/forms/${f.id}`}
                          title={f.name}
                          subtitle={`/forms/${f.slug}`}
                        />
                      </CrmV2Td>
                      <CrmV2Td>{folderSelect(f)}</CrmV2Td>
                      <CrmV2Td style={numCell}>{(f.view_count || 0).toLocaleString('fr-FR')}</CrmV2Td>
                      <CrmV2Td style={numCell}>{(f.submission_count || 0).toLocaleString('fr-FR')}</CrmV2Td>
                      <CrmV2Td style={{ ...numCell, color: conversionRate > 0 ? '#16a34a' : crmV2.textMuted }}>{conversionRate} %</CrmV2Td>
                      <CrmV2Td><CrmV2StatusPill label={meta.label} color={meta.color} bg={meta.bg} /></CrmV2Td>
                      <CrmV2Td style={mutedCell}>{ago(f.updated_at)}</CrmV2Td>
                      <CrmV2Td>
                        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          {f.status === 'published' && (
                            <MktIconButton title="Voir la page publique" onClick={() => openPublic(f)}><ExternalLink size={14} /></MktIconButton>
                          )}
                          <MktIconButton title="Dupliquer" onClick={() => duplicate(f)}><Copy size={14} /></MktIconButton>
                          <MktIconButton title="Supprimer" onClick={() => remove(f)} danger><Trash2 size={14} /></MktIconButton>
                        </span>
                      </CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>

      {showNewModal && (
        <NewFormModal onClose={() => setShowNewModal(false)} onCreated={(id) => { window.location.href = `${base}/forms/${id}` }} />
      )}
      {showImportModal && (
        <ImportFormsModal onClose={() => setShowImportModal(false)} onDone={() => { setShowImportModal(false); load() }} />
      )}
      {moveForm && (
        <MktModal
          open
          onClose={() => setMoveForm(null)}
          title="Changer de dossier"
          footer={<CrmV2Button variant="secondary" onClick={() => setMoveForm(null)}>Fermer</CrmV2Button>}
        >
          <CrmV2Field label={moveForm.name}>
            <CrmV2Select
              value={getFolder(moveForm)}
              onChange={e => {
                const v = e.target.value as Folder
                if (v !== getFolder(moveForm)) moveToFolder(moveForm, v)
                setMoveForm(null)
              }}
              style={{ height: 44 }}
            >
              {FOLDERS.map(x => <option key={x} value={x}>{x}</option>)}
            </CrmV2Select>
          </CrmV2Field>
        </MktModal>
      )}
    </CrmV2Page>
  )
}

// ─── Fenêtre d'import de formulaires externes ─────────────────────────────
function ImportFormsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [prefix, setPrefix] = useState('NS')
  const [folder, setFolder] = useState<Folder>(DEFAULT_FOLDER)
  const [step, setStep] = useState<'config' | 'preview' | 'importing' | 'done'>('config')
  const [preview, setPreview] = useState<Array<{ id: string; name: string; fieldsCount: number }>>([])
  const [results, setResults] = useState<Array<{ name: string; status: string; error?: string; fieldsCount?: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runPreview = async () => {
    setLoading(true)
    setError(null)
    try {
      // Timeout de 90 secondes côté client (serveur = 60s max)
      const ctrl = new AbortController()
      const timeoutId = setTimeout(() => ctrl.abort(), 90000)

      const res = await fetch('/api/admin/import-hubspot-forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, folder, dryRun: true }),
        signal: ctrl.signal,
      }).catch(e => {
        if (e.name === 'AbortError') throw new Error('La requête a pris trop de temps (> 90s). Trop de formulaires à analyser.')
        throw e
      })
      clearTimeout(timeoutId)

      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* ignore */ }

      if (!res.ok) {
        if (data.error === 'SCOPE_MISSING') {
          setError('SCOPE_MISSING')
          return
        }
        setError(String(data.error || data.message || `Erreur HTTP ${res.status}`))
        return
      }
      setPreview((data.preview as Array<{ id: string; name: string; fieldsCount: number }>) || [])
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally { setLoading(false) }
  }

  const runImport = async () => {
    setStep('importing')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/import-hubspot-forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, folder, dryRun: false }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur inconnue')
        setStep('config')
        return
      }
      setResults(data.results || [])
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
      setStep('config')
    } finally { setLoading(false) }
  }

  const created = results.filter(r => r.status === 'created').length
  const updated = results.filter(r => r.status === 'updated').length
  const errors = results.filter(r => r.status === 'error').length

  const listBox: React.CSSProperties = {
    maxHeight: 300, overflowY: 'auto', background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 6,
  }

  const footer = step === 'config' ? (
    <>
      <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
      <CrmV2Button
        variant="primary"
        onClick={runPreview}
        disabled={!prefix.trim() || loading}
        icon={loading ? <Loader2 size={14} style={{ animation: 'crm-v2-spin 1s linear infinite' }} /> : undefined}
      >
        {loading ? 'Analyse…' : 'Prévisualiser'}
      </CrmV2Button>
    </>
  ) : step === 'preview' ? (
    <>
      <CrmV2Button variant="secondary" icon={<ChevronLeft size={14} />} onClick={() => setStep('config')} style={{ marginRight: 'auto' }}>Modifier</CrmV2Button>
      <CrmV2Button variant="primary" onClick={runImport} disabled={preview.length === 0}>
        Importer les {preview.length} formulaire{preview.length > 1 ? 's' : ''}
      </CrmV2Button>
    </>
  ) : step === 'done' ? (
    <CrmV2Button variant="primary" onClick={onDone}>Fermer</CrmV2Button>
  ) : undefined

  return (
    <MktModal
      open
      onClose={step !== 'importing' ? onClose : () => { /* import en cours : fermeture bloquée */ }}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Download size={16} color={crmV2.gold} /> Importer des formulaires</span>}
      footer={footer}
      width={560}
    >
      {step === 'config' && (
        <>
          <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
            Récupère tous les formulaires externes dont le nom commence par le préfixe ci-dessous, et les importe dans ton CRM natif avec leurs champs.
          </div>
          <CrmV2Field label="Préfixe du nom">
            <CrmV2Input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="NS" autoFocus />
          </CrmV2Field>
          <CrmV2Field
            label="Dossier cible"
            hint={<>Exemple : <strong style={{ color: crmV2.goldDark }}>NS</strong> importera &quot;NS Landing PASS&quot;, &quot;NS Inscription LAS&quot;, etc.</>}
          >
            <CrmV2Select value={folder} onChange={e => setFolder(e.target.value as Folder)}>
              {FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
            </CrmV2Select>
          </CrmV2Field>

          {error === 'SCOPE_MISSING' ? (
            <MktNotice icon={<AlertTriangle size={16} />}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Scope manquant : &quot;forms&quot;</div>
              <div style={{ marginBottom: 8, color: crmV2.text }}>
                Le token d&apos;accès actuel n&apos;a pas la permission de lire les formulaires.
              </div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>À faire :</div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12, color: crmV2.textMuted }}>
                <li>Ouvre <a href="https://app.hubspot.com/settings/integrations/private-apps" target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600 }}>Paramètres → Private Apps</a></li>
                <li>Clique sur ton application privée</li>
                <li>Onglet &quot;Scopes&quot; → recherche <strong>forms</strong></li>
                <li>Coche <strong>forms</strong> (Read)</li>
                <li>Clique &quot;Commit changes&quot; → copie le nouveau token</li>
                <li>Mets à jour le token d&apos;accès sur Vercel</li>
                <li>Redéploie puis relance l&apos;import</li>
              </ol>
            </MktNotice>
          ) : error ? (
            <MktNotice tone="red" icon={<XCircle size={16} />}>{error}</MktNotice>
          ) : null}
        </>
      )}

      {step === 'preview' && (
        <>
          <div style={{ fontSize: 13, color: crmV2.text }}>
            <strong style={{ color: crmV2.goldDark }}>{preview.length}</strong> formulaire{preview.length > 1 ? 's' : ''} trouvé{preview.length > 1 ? 's' : ''} commençant par &quot;{prefix}&quot; :
          </div>
          {preview.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>
              Aucun formulaire ne correspond à ce préfixe.
            </div>
          ) : (
            <div style={listBox}>
              {preview.map((f, i) => (
                <div key={f.id} style={{ padding: '8px 10px', borderBottom: i < preview.length - 1 ? `1px solid ${crmV2.borderLight}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: crmV2.text, minWidth: 0 }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{f.fieldsCount} champ{f.fieldsCount > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'importing' && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <Loader2 size={30} color={crmV2.gold} style={{ animation: 'crm-v2-spin 1s linear infinite', margin: '0 auto 14px', display: 'block' }} />
          <div style={{ fontSize: 14, color: crmV2.text, fontWeight: 600, marginBottom: 4 }}>Import en cours…</div>
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Récupération des formulaires et création dans Supabase. Peut prendre 20-60 secondes.</div>
        </div>
      )}

      {step === 'done' && (
        <>
          <div style={{ padding: 14, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={16} /> Import terminé !
            </div>
            <div style={{ fontSize: 12, color: crmV2.text, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span><strong>{created}</strong> créés</span>
              <span><strong>{updated}</strong> mis à jour</span>
              {errors > 0 && <span style={{ color: '#dc2626' }}><strong>{errors}</strong> erreurs</span>}
            </div>
          </div>

          <div style={listBox}>
            {results.map((r, i) => (
              <div key={i} style={{ padding: '8px 10px', borderBottom: i < results.length - 1 ? `1px solid ${crmV2.borderLight}` : 'none', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: crmV2.text, minWidth: 0 }}>{r.name}</span>
                  {r.status === 'created' && <CrmV2StatusPill dot={false} label={<><Check size={12} /> Créé ({r.fieldsCount} champs)</>} {...MKT_TONES.green} />}
                  {r.status === 'updated' && <CrmV2StatusPill dot={false} label={<><RefreshCw size={12} /> Mis à jour ({r.fieldsCount} champs)</>} {...MKT_TONES.blue} />}
                  {r.status === 'error' && <CrmV2StatusPill dot={false} label={<><XCircle size={12} /> Erreur</>} {...MKT_TONES.red} />}
                </div>
                {r.error && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{r.error}</div>}
              </div>
            ))}
          </div>

          <MktNotice tone="blue" icon={<Lightbulb size={15} />}>
            Les formulaires importés sont en <strong>brouillon</strong>. Ouvre-les pour vérifier les champs et publier.
          </MktNotice>
        </>
      )}
    </MktModal>
  )
}

function NewFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState<Folder>(DEFAULT_FOLDER)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, folder }),
      })
      if (res.ok) {
        const created = await res.json()
        onCreated(created.id)
      } else {
        alert((await res.json()).error)
      }
    } finally { setLoading(false) }
  }

  return (
    <MktModal
      open
      onClose={onClose}
      title="Nouveau formulaire"
      width={440}
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={submit} disabled={!name.trim() || loading}>
            {loading ? 'Création…' : 'Créer et configurer'}
          </CrmV2Button>
        </>
      }
    >
      <CrmV2Field label="Nom du formulaire *">
        <CrmV2Input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="Ex: Inscription PASS 2026"
          autoFocus
        />
      </CrmV2Field>
      <CrmV2Field label="Dossier *" hint="Les champs par défaut (prénom, nom, email, téléphone) seront ajoutés automatiquement.">
        <CrmV2Select value={folder} onChange={e => setFolder(e.target.value as Folder)}>
          {FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
        </CrmV2Select>
      </CrmV2Field>
    </MktModal>
  )
}
