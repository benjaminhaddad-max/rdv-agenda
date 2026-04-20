'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  FileText, Plus, Search, ExternalLink, Copy, Trash2, Code,
  CheckCircle2, FileEdit, Archive, X, Eye, Send, Inbox, Download, Loader2,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'

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
}

const STATUS_META: Record<Form['status'], { label: string; color: string; bg: string; icon: typeof FileText }> = {
  draft:     { label: 'Brouillon',  color: '#8b8fa8', bg: '#1d2f4b', icon: FileEdit },
  published: { label: 'Publié',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)', icon: CheckCircle2 },
  archived:  { label: 'Archivé',    color: '#8b8fa8', bg: 'rgba(139,143,168,0.15)', icon: Archive },
}

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

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
    if (statusFilter && f.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
    }
    return true
  })

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

  return (
    <div style={{ minHeight: '100vh', background: '#0b1624', color: '#e4e7eb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 20px', height: 52, background: '#1d2f4b', borderBottom: '1px solid #2d4a6b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin/crm" style={{ color: '#8b8fa8', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Retour CRM
          </a>
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Formulaires</span>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* Stats */}
      <div style={{ padding: '24px 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard label="Total" value={stats.total} color="#ccac71" icon={FileText} />
          <StatCard label="Publiés" value={stats.published} color="#22c55e" icon={CheckCircle2} />
          <StatCard label="Vues totales" value={stats.totalViews.toLocaleString('fr-FR')} color="#06b6d4" icon={Eye} />
          <StatCard label="Soumissions" value={stats.totalSubmissions.toLocaleString('fr-FR')} color="#a855f7" icon={Send} />
        </div>
      </div>

      {/* Barre d'action */}
      <div style={{ padding: '0 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', flex: '1 1 280px' }}>
            <Search size={14} style={{ color: '#8b8fa8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un formulaire…"
              style={{ flex: 1, background: 'transparent', border: 'none', color: '#e4e7eb', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', color: '#e4e7eb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowImportModal(true)}
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 14px', color: '#f59e0b', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Download size={14} /> Importer depuis HubSpot
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '8px 16px', color: '#22c55e', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Plus size={14} /> Nouveau formulaire
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: '0 24px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#8b8fa8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          forms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: '#152438', border: '1px dashed #2d4a6b', borderRadius: 12 }}>
              <FileText size={48} style={{ color: '#2d4a6b', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Aucun formulaire pour le moment</div>
              <div style={{ fontSize: 13, color: '#8b8fa8', marginBottom: 20 }}>Crée un formulaire pour capturer des prospects sur ton site.</div>
              <button onClick={() => setShowNewModal(true)} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 20px', color: '#22c55e', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}>
                <Plus size={14} /> Créer mon premier formulaire
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b8fa8' }}>Aucun formulaire ne correspond aux filtres.</div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(f => (
              <FormRow key={f.id} form={f} onDuplicate={() => duplicate(f)} onDelete={() => remove(f)} />
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewFormModal onClose={() => setShowNewModal(false)} onCreated={(id) => { window.location.href = `/admin/crm/forms/${id}` }} />
      )}
      {showImportModal && (
        <ImportHubspotModal onClose={() => setShowImportModal(false)} onDone={() => { setShowImportModal(false); load() }} />
      )}
    </div>
  )
}

// ─── Modal Import HubSpot ────────────────────────────────────────────────
function ImportHubspotModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [prefix, setPrefix] = useState('NS')
  const [step, setStep] = useState<'config' | 'preview' | 'importing' | 'done'>('config')
  const [preview, setPreview] = useState<Array<{ id: string; name: string; fieldsCount: number }>>([])
  const [results, setResults] = useState<Array<{ name: string; status: string; error?: string; fieldsCount?: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runPreview = async () => {
    setLoading(true)
    setError(null)
    try {
      // Timeout de 30 secondes côté client pour éviter de hang
      const ctrl = new AbortController()
      const timeoutId = setTimeout(() => ctrl.abort(), 30000)

      const res = await fetch('/api/admin/import-hubspot-forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, dryRun: true }),
        signal: ctrl.signal,
      }).catch(e => {
        if (e.name === 'AbortError') throw new Error('La requête a pris trop de temps (> 30s). HubSpot est peut-être lent.')
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
        body: JSON.stringify({ prefix, dryRun: false }),
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

  return (
    <>
      <div onClick={step !== 'importing' ? onClose : undefined} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, maxHeight: '85vh', overflowY: 'auto', background: '#1d2f4b', border: '1px solid #2d4a6b', borderRadius: 12, padding: 24, zIndex: 61 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e4e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={16} style={{ color: '#f59e0b' }} />
            Importer depuis HubSpot
          </h3>
          {step !== 'importing' && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8b8fa8', cursor: 'pointer' }}><X size={18} /></button>
          )}
        </div>

        {step === 'config' && (
          <>
            <div style={{ fontSize: 13, color: '#8b8fa8', marginBottom: 16, lineHeight: 1.5 }}>
              Récupère tous les formulaires HubSpot dont le nom commence par le préfixe ci-dessous, et les importe dans ton CRM natif avec leurs champs.
            </div>
            <div style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Préfixe du nom</div>
            <input
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              placeholder="NS"
              autoFocus
              style={{ width: '100%', background: '#0b1624', border: '1px solid #2d4a6b', borderRadius: 8, padding: '8px 12px', color: '#e4e7eb', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: '#8b8fa8', marginTop: 4 }}>
              Exemple : <code style={{ color: '#ccac71' }}>NS</code> importera &quot;NS Landing PASS&quot;, &quot;NS Inscription LAS&quot;, etc.
            </div>

            {error === 'SCOPE_MISSING' ? (
              <div style={{ marginTop: 12, padding: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#e4e7eb' }}>
                <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 8, fontSize: 13 }}>⚠️ Scope HubSpot manquant : &quot;forms&quot;</div>
                <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
                  Le token HubSpot actuel n&apos;a pas la permission de lire les formulaires.
                </div>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#ccac71' }}>À faire :</div>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 12, color: '#8b8fa8' }}>
                  <li>Ouvre <a href="https://app.hubspot.com/settings/integrations/private-apps" target="_blank" rel="noreferrer" style={{ color: '#06b6d4' }}>HubSpot → Private Apps</a></li>
                  <li>Clique sur ton application privée</li>
                  <li>Onglet &quot;Scopes&quot; → recherche <code style={{ color: '#ccac71' }}>forms</code></li>
                  <li>Coche <strong>forms</strong> (Read)</li>
                  <li>Clique &quot;Commit changes&quot; → copie le nouveau token</li>
                  <li>Mets à jour <code style={{ color: '#ccac71' }}>HUBSPOT_ACCESS_TOKEN</code> sur Vercel</li>
                  <li>Redéploie puis relance l&apos;import</li>
                </ol>
              </div>
            ) : error ? (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 12 }}>{error}</div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: '#152438', border: '1px solid #2d4a6b', color: '#8b8fa8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Annuler</button>
              <button
                onClick={runPreview}
                disabled={!prefix.trim() || loading}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: !prefix.trim() || loading ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                {loading ? 'Analyse HubSpot…' : 'Prévisualiser'}
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div style={{ fontSize: 13, color: '#e4e7eb', marginBottom: 12 }}>
              <strong style={{ color: '#f59e0b' }}>{preview.length}</strong> formulaire{preview.length > 1 ? 's' : ''} trouvé{preview.length > 1 ? 's' : ''} commençant par &quot;{prefix}&quot; :
            </div>
            {preview.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#8b8fa8', fontSize: 13, background: '#152438', borderRadius: 8 }}>
                Aucun formulaire ne correspond à ce préfixe.
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: 8 }}>
                {preview.map((f, i) => (
                  <div key={f.id} style={{ padding: '8px 10px', borderBottom: i < preview.length - 1 ? '1px solid #2d4a6b' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#e4e7eb' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: '#8b8fa8' }}>{f.fieldsCount} champ{f.fieldsCount > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
              <button onClick={() => setStep('config')} style={{ background: '#152438', border: '1px solid #2d4a6b', color: '#8b8fa8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>← Modifier</button>
              <button
                onClick={runImport}
                disabled={preview.length === 0}
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: preview.length === 0 ? 0.5 : 1 }}
              >
                Importer les {preview.length} formulaire{preview.length > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 size={32} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 14, color: '#e4e7eb', fontWeight: 600, marginBottom: 4 }}>Import en cours…</div>
            <div style={{ fontSize: 12, color: '#8b8fa8' }}>Récupération des formulaires et création dans Supabase. Peut prendre 20-60 secondes.</div>
          </div>
        )}

        {step === 'done' && (
          <>
            <div style={{ padding: 16, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>✅ Import terminé !</div>
              <div style={{ fontSize: 12, color: '#e4e7eb', display: 'flex', gap: 12 }}>
                <span><strong>{created}</strong> créés</span>
                <span><strong>{updated}</strong> mis à jour</span>
                {errors > 0 && <span style={{ color: '#ef4444' }}><strong>{errors}</strong> erreurs</span>}
              </div>
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: 8 }}>
              {results.map((r, i) => (
                <div key={i} style={{ padding: '8px 10px', borderBottom: i < results.length - 1 ? '1px solid #2d4a6b' : 'none', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#e4e7eb' }}>{r.name}</span>
                    <span style={{
                      color: r.status === 'error' ? '#ef4444' : r.status === 'created' ? '#22c55e' : '#06b6d4',
                      fontWeight: 600,
                      fontSize: 11,
                    }}>
                      {r.status === 'created' && `✅ Créé (${r.fieldsCount} champs)`}
                      {r.status === 'updated' && `🔄 Mis à jour (${r.fieldsCount} champs)`}
                      {r.status === 'error' && `❌ Erreur`}
                    </span>
                  </div>
                  {r.error && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 4 }}>{r.error}</div>}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: 10, background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, fontSize: 11, color: '#8b8fa8' }}>
              💡 Les formulaires importés sont en <strong>brouillon</strong>. Ouvre-les pour vérifier les champs et publier.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={onDone} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>Fermer</button>
            </div>
          </>
        )}
      </div>
      <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number | string; color: string; icon: typeof FileText }) {
  return (
    <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function FormRow({ form, onDuplicate, onDelete }: { form: Form; onDuplicate: () => void; onDelete: () => void }) {
  const meta = STATUS_META[form.status]
  const Icon = meta.icon
  const conversionRate = form.view_count > 0 ? Math.round((form.submission_count / form.view_count) * 100) : 0

  return (
    <div
      onClick={() => window.location.href = `/admin/crm/forms/${form.id}`}
      style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} style={{ color: meta.color }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e7eb', marginBottom: 2 }}>{form.name}</div>
        <div style={{ fontSize: 11, color: '#8b8fa8', fontFamily: 'ui-monospace, monospace' }}>/forms/{form.slug}</div>
      </div>

      <Metric label="Vues" value={form.view_count} />
      <Metric label="Soumissions" value={form.submission_count} color="#a855f7" />
      <Metric label="Conversion" value={`${conversionRate}%`} color="#22c55e" />

      <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
        {meta.label}
      </span>

      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        {form.status === 'published' && (
          <IconBtn title="Voir la page publique" onClick={() => window.open(`/forms/${form.slug}`, '_blank')}><ExternalLink size={13} /></IconBtn>
        )}
        <IconBtn title="Dupliquer" onClick={onDuplicate}><Copy size={13} /></IconBtn>
        <IconBtn title="Supprimer" onClick={onDelete} color="#ef4444"><Trash2 size={13} /></IconBtn>
      </div>
    </div>
  )
}

function Metric({ label, value, color = '#e4e7eb' }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ minWidth: 80, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#8b8fa8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function IconBtn({ children, onClick, title, color = '#8b8fa8' }: { children: React.ReactNode; onClick: () => void; title: string; color?: string }) {
  return (
    <button onClick={onClick} title={title} style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 6, padding: 6, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )
}

function NewFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
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
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, background: '#1d2f4b', border: '1px solid #2d4a6b', borderRadius: 12, padding: 24, zIndex: 61 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e4e7eb' }}>Nouveau formulaire</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8b8fa8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Nom du formulaire *</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Inscription PASS 2026"
          autoFocus
          style={{ width: '100%', background: '#0b1624', border: '1px solid #2d4a6b', borderRadius: 8, padding: '8px 12px', color: '#e4e7eb', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 11, color: '#8b8fa8', marginTop: 4 }}>
          Les champs par défaut (prénom, nom, email, téléphone) seront ajoutés automatiquement.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#152438', border: '1px solid #2d4a6b', color: '#8b8fa8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Annuler</button>
          <button
            onClick={submit}
            disabled={!name.trim() || loading}
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: !name.trim() || loading ? 0.5 : 1 }}
          >
            {loading ? 'Création…' : 'Créer et configurer →'}
          </button>
        </div>
      </div>
    </>
  )
}
