'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2, ArrowRight, ArrowLeft, Check, Eye, UserPlus, RefreshCw, SkipForward, AlertTriangle,
} from 'lucide-react'
import {
  CrmV2Page, CrmV2Header, CrmV2Button, CrmV2Card, CrmV2Field, CrmV2Input, CrmV2Select, CrmV2Textarea, CrmV2Toggle,
  CrmV2Table, CrmV2Th, CrmV2Td,
} from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin, AdminEllipsis } from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/* ------------------------------------------------------------------ */
/* CSV parsing simple — gère les guillemets et les virgules dans les   */
/* champs quotés. Suffisant pour les exports Excel / Google Sheets.    */
/* ------------------------------------------------------------------ */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    } else {
      if (c === '"') { inQuotes = true; i++; continue }
      if (c === ',' || c === ';' || c === '\t') { cur.push(field); field = ''; i++; continue }
      if (c === '\n') { cur.push(field); lines.push(cur); cur = []; field = ''; i++; continue }
      if (c === '\r') { i++; continue }
      field += c; i++
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); lines.push(cur) }
  if (lines.length === 0) return { headers: [], rows: [] }
  return { headers: lines[0].map(h => h.trim()), rows: lines.slice(1).filter(r => r.some(v => v.trim() !== '')) }
}

/* ------------------------------------------------------------------ */
/* Champs CRM disponibles + auto-detection depuis les headers CSV     */
/* ------------------------------------------------------------------ */
const CRM_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'firstname',           label: 'Prénom' },
  { key: 'lastname',            label: 'Nom' },
  { key: 'email',               label: 'Email *' },
  { key: 'phone',               label: 'Téléphone *' },
  { key: 'classe_actuelle',     label: 'Classe actuelle' },
  { key: 'departement',         label: 'Département' },
  { key: 'zone_localite',       label: 'Zone / Localité' },
  { key: 'formation_souhaitee', label: 'Formation souhaitée' },
  { key: 'formation_demandee',  label: 'Formation demandée' },
  { key: 'hs_lead_status',      label: 'Statut du lead' },
  { key: 'origine',             label: 'Origine' },
  { key: 'hubspot_owner_id',    label: 'Propriétaire (ID)' },
]

const HEADER_TO_KEY: Record<string, string> = {
  firstname: 'firstname', prenom: 'firstname', 'prénom': 'firstname', 'first name': 'firstname',
  lastname: 'lastname', nom: 'lastname', 'last name': 'lastname',
  email: 'email', mail: 'email', 'e-mail': 'email', 'adresse email': 'email',
  phone: 'phone', telephone: 'phone', 'téléphone': 'phone', mobile: 'phone', tel: 'phone',
  classe: 'classe_actuelle', 'classe actuelle': 'classe_actuelle', classe_actuelle: 'classe_actuelle',
  departement: 'departement', 'département': 'departement', dept: 'departement',
  zone: 'zone_localite', zone_localite: 'zone_localite', 'zone / localité': 'zone_localite', localite: 'zone_localite',
  formation: 'formation_souhaitee', 'formation souhaitée': 'formation_souhaitee', formation_souhaitee: 'formation_souhaitee',
  formation_demandee: 'formation_demandee', 'formation demandée': 'formation_demandee',
  statut: 'hs_lead_status', 'lead status': 'hs_lead_status', hs_lead_status: 'hs_lead_status',
  origine: 'origine', source: 'origine',
  owner: 'hubspot_owner_id', owner_id: 'hubspot_owner_id', proprietaire: 'hubspot_owner_id',
}

function autoMapHeader(header: string): string | null {
  const norm = header.toLowerCase().trim()
  return HEADER_TO_KEY[norm] || null
}

/* ------------------------------------------------------------------ */
type ImportResult = {
  total: number
  created: number
  updated: number
  skipped: number
  errors?: Array<{ row_index: number; email?: string; error: string }>
  error_count?: number
  to_create?: number
  to_update?: number
  to_skip?: number
  dry_run?: boolean
}

export default function ImportPage() {
  const [csvText, setCsvText] = useState('')
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<Record<number, string>>({})  // colIndex -> crm_field
  const [defaultOrigine, setDefaultOrigine] = useState('Import CSV')
  const [defaultOwnerId, setDefaultOwnerId] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(false)
  const [owners, setOwners] = useState<Array<{ hubspot_owner_id: string; firstname?: string; lastname?: string; email?: string }>>([])
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Parcours en 3 étapes : Fichier → Correspondance → Import
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  // Charge les owners pour le dropdown attribution
  useEffect(() => {
    fetch('/api/crm/metadata')
      .then(r => r.json())
      .then(d => setOwners(d.owners || []))
      .catch(() => {})
  }, [])

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = String(e.target?.result || '')
      setCsvText(text)
      doParse(text)
      // Fichier chargé : on passe directement à la correspondance
      if (parseCsv(text).headers.length > 0) setStep(2)
    }
    reader.readAsText(file, 'utf-8')
  }

  function doParse(text: string) {
    const p = parseCsv(text)
    setParsed(p)
    // Auto-mapping par header
    const map: Record<number, string> = {}
    p.headers.forEach((h, idx) => {
      const k = autoMapHeader(h)
      if (k) map[idx] = k
    })
    setMapping(map)
    setDryRunResult(null)
    setResult(null)
    setError(null)
  }

  // Construit les rows pour l'API depuis le mapping
  const apiRows = useMemo(() => {
    if (!parsed) return []
    return parsed.rows.map(r => {
      const obj: Record<string, string> = {}
      for (const [colIdxStr, field] of Object.entries(mapping)) {
        const colIdx = parseInt(colIdxStr, 10)
        const v = r[colIdx]
        if (v && v.trim()) obj[field] = v.trim()
      }
      return obj
    })
  }, [parsed, mapping])

  async function runDryRun() {
    setLoading('preview'); setError(null); setResult(null)
    try {
      const res = await fetch('/api/crm/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: apiRows,
          options: {
            default_origine: defaultOrigine || undefined,
            default_owner_id: defaultOwnerId || undefined,
            skip_duplicates: skipDuplicates,
            dry_run: true,
          },
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDryRunResult(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  async function runImport() {
    if (!confirm(`Importer ${apiRows.length} ligne(s) ? Cette action est irréversible.`)) return
    setLoading('import'); setError(null); setResult(null)
    try {
      const res = await fetch('/api/crm/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: apiRows,
          options: {
            default_origine: defaultOrigine || undefined,
            default_owner_id: defaultOwnerId || undefined,
            skip_duplicates: skipDuplicates,
          },
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  const hasEmailOrPhone = useMemo(() => {
    const mapped = new Set(Object.values(mapping))
    return mapped.has('email') || mapped.has('phone')
  }, [mapping])

  const canMap = !!parsed && parsed.headers.length > 0
  const canImport = !!parsed && parsed.rows.length > 0 && hasEmailOrPhone
  const steps = ['Fichier', 'Correspondance', 'Import'] as const
  const fieldLabel = (k: string) => CRM_FIELDS.find(f => f.key === k)?.label ?? k

  const stepper = (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done = n < step
        const current = n === step
        // On peut revenir en arrière, ou avancer si l'étape est accessible
        const reachable = n < step || (n === 2 && canMap) || (n === 3 && canImport)
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
            <button
              type="button"
              onClick={() => reachable && setStep(n)}
              disabled={!reachable && !current}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0,
                fontFamily: 'inherit', cursor: reachable ? 'pointer' : 'default', minHeight: 32,
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
                background: done ? crmV2.success : current ? crmV2.primary : crmV2.bg,
                color: done || current ? '#fff' : crmV2.textFaint,
                border: done || current ? 'none' : `1.5px solid ${crmV2.borderStrong}`,
                fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : n}
              </span>
              {(!isMobile || current) && (
                <span style={{ fontSize: 13, fontWeight: 700, color: done || current ? crmV2.text : crmV2.textFaint }}>{label}</span>
              )}
            </button>
            {i < steps.length - 1 && (
              <span style={{ width: isMobile ? 20 : 48, height: 2, borderRadius: 2, background: crmV2.border, margin: '0 4px' }} />
            )}
          </div>
        )
      })}
    </div>
  )

  // Carte « fichier » : nom, lignes, colonnes
  const fileCard = canMap && (
    <CrmV2Card style={{ padding: isMobile ? 14 : 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 16, background: crmV2.goldSoft, color: '#b8963e', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileSpreadsheet size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <AdminEllipsis style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>{fileName || 'Données collées'}</AdminEllipsis>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
          {parsed!.rows.length} ligne{parsed!.rows.length > 1 ? 's' : ''} · {parsed!.headers.length} colonne{parsed!.headers.length > 1 ? 's' : ''}
        </div>
      </div>
      <CrmV2Button variant="secondary" onClick={() => setStep(1)} style={isMobile ? { width: '100%', minHeight: 44 } : undefined}>
        Changer de fichier
      </CrmV2Button>
    </CrmV2Card>
  )

  const navBtn = isMobile ? { flex: 1, minHeight: 44 } : undefined

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Import de contacts"
        subtitle="Importer un fichier CSV dans le CRM — département normalisé, zone calculée, doublons email / téléphone détectés"
      />

      <div style={{ padding: isMobile ? 12 : '20px 28px 24px' }}>
        <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          {stepper}

          {/* ─── Étape 1 : Fichier ─────────────────────────────── */}
          {step === 1 && (
            <>
              <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Charger le fichier</div>
                <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>CSV, TSV ou Excel exporté en CSV — ou colle directement les données.</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 16 }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
                    style={{
                      border: `1.5px dashed ${crmV2.borderStrong}`, borderRadius: 16, background: crmV2.bgHover,
                      padding: 20, minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 8, textAlign: 'center', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 44, height: 44, borderRadius: 14, background: crmV2.goldSoft, color: '#b8963e',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Upload size={20} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>
                      {fileName ? fileName : 'Choisir un fichier'}
                    </span>
                    <span style={{ fontSize: 12, color: crmV2.textMuted }}>ou glisse-le ici</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv,.txt"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
                      style={{ display: 'none' }}
                    />
                  </div>
                  <CrmV2Field label="…ou colle directement ici">
                    <CrmV2Textarea
                      value={csvText}
                      onChange={e => { setCsvText(e.target.value); setFileName(null); if (e.target.value.trim()) doParse(e.target.value) }}
                      placeholder={'firstname,lastname,email,phone,classe_actuelle,departement\nMarie,Durand,marie@example.com,0612345678,Terminale,75'}
                      style={{ minHeight: 140, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
                    />
                  </CrmV2Field>
                </div>
              </CrmV2Card>
              {canMap && fileCard}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <CrmV2Button variant="primary" onClick={() => setStep(2)} disabled={!canMap} style={navBtn}>
                  Continuer <ArrowRight size={14} />
                </CrmV2Button>
              </div>
            </>
          )}

          {/* ─── Étape 2 : Correspondance ──────────────────────── */}
          {step === 2 && canMap && (
            <>
              {fileCard}
              <CrmV2Card style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 12px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Correspondance des colonnes</div>
                  <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>Associe chaque colonne du fichier à une propriété du CRM.</div>
                </div>
                {isMobile ? (
                  <div>
                    {parsed!.headers.map((h, i) => {
                      const ignored = !mapping[i]
                      return (
                        <div key={i} style={{ padding: '10px 16px', borderTop: `1px solid ${crmV2.borderLight}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <AdminEllipsis style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{h}</AdminEllipsis>
                          <CrmV2Select
                            value={mapping[i] || ''}
                            onChange={e => setMapping(m => ({ ...m, [i]: e.target.value }))}
                            style={{ height: 42, color: ignored ? crmV2.textFaint : crmV2.text, borderColor: ignored ? crmV2.border : crmV2.borderStrong, fontWeight: 600 }}
                          >
                            <option value="">Ne pas importer</option>
                            {CRM_FIELDS.map(f => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </CrmV2Select>
                          <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>
                            {parsed!.rows.slice(0, 3).map(r => r[i] || '').filter(Boolean).join(' · ') || 'vide'}
                          </AdminEllipsis>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <CrmV2Table>
                    <thead>
                      <tr>
                        <CrmV2Th style={{ padding: '10px 16px' }}>Colonne CSV</CrmV2Th>
                        <CrmV2Th style={{ padding: '10px 16px' }}>→ Champ CRM</CrmV2Th>
                        <CrmV2Th style={{ padding: '10px 16px' }}>Aperçu (3 valeurs)</CrmV2Th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed!.headers.map((h, i) => {
                        const ignored = !mapping[i]
                        return (
                          <tr key={i}>
                            <CrmV2Td style={{ padding: '8px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</CrmV2Td>
                            <CrmV2Td style={{ padding: '8px 16px' }}>
                              <CrmV2Select
                                value={mapping[i] || ''}
                                onChange={e => setMapping(m => ({ ...m, [i]: e.target.value }))}
                                style={{
                                  height: 34, minWidth: 220, width: 'auto', fontWeight: 600,
                                  color: ignored ? crmV2.textFaint : crmV2.text, borderColor: ignored ? crmV2.border : crmV2.borderStrong,
                                }}
                              >
                                <option value="">Ne pas importer</option>
                                {CRM_FIELDS.map(f => (
                                  <option key={f.key} value={f.key}>{f.label}</option>
                                ))}
                              </CrmV2Select>
                            </CrmV2Td>
                            <CrmV2Td style={{ padding: '8px 16px', color: crmV2.textMuted, maxWidth: 360 }}>
                              <AdminEllipsis>
                                {parsed!.rows.slice(0, 3).map(r => r[i] || '').filter(Boolean).join(' · ') || <span style={{ color: crmV2.textFaint }}>vide</span>}
                              </AdminEllipsis>
                            </CrmV2Td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </CrmV2Table>
                )}
              </CrmV2Card>

              {!hasEmailOrPhone && (
                <AdminNotice tone="warning">
                  Tu dois associer au minimum une colonne à <strong>Email</strong> ou <strong>Téléphone</strong>.
                </AdminNotice>
              )}

              {parsed!.rows.length > 0 && hasEmailOrPhone && (
                <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Options</div>
                  <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>Valeurs appliquées aux lignes importées.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: '14px 16px', marginTop: 16 }}>
                    <CrmV2Field label="Origine par défaut" hint="Utilisée si la colonne « origine » n’est pas associée.">
                      <CrmV2Input
                        type="text"
                        value={defaultOrigine}
                        onChange={e => setDefaultOrigine(e.target.value)}
                        placeholder="Import CSV"
                      />
                    </CrmV2Field>
                    <CrmV2Field label="Propriétaire par défaut">
                      <CrmV2Select value={defaultOwnerId} onChange={e => setDefaultOwnerId(e.target.value)}>
                        <option value="">— Aucun (lead non attribué) —</option>
                        {owners.map(o => {
                          const name = [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
                          return <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>{name}</option>
                        })}
                      </CrmV2Select>
                    </CrmV2Field>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <CrmV2Toggle
                      checked={skipDuplicates}
                      onChange={setSkipDuplicates}
                      label="Ignorer les doublons (par défaut : mettre à jour le contact existant)"
                    />
                  </div>
                </CrmV2Card>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <CrmV2Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={() => setStep(1)} style={navBtn}>
                  Retour
                </CrmV2Button>
                <CrmV2Button variant="primary" onClick={() => setStep(3)} disabled={!canImport} style={navBtn}>
                  Continuer <ArrowRight size={14} />
                </CrmV2Button>
              </div>
            </>
          )}

          {/* ─── Étape 3 : Import ──────────────────────────────── */}
          {step === 3 && canImport && (
            <>
              {fileCard}
              <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Lancer l&apos;import</div>
                <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>
                  {apiRows.length} ligne{apiRows.length > 1 ? 's' : ''} · champs : {[...new Set(Object.values(mapping).filter(Boolean))].map(fieldLabel).join(', ')}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  <CrmV2Button
                    variant="secondary"
                    icon={loading === 'preview' ? <AdminSpin /> : <Eye size={14} />}
                    onClick={runDryRun}
                    disabled={loading !== null}
                    style={isMobile ? { width: '100%', minHeight: 44 } : undefined}
                  >
                    {loading === 'preview' ? 'Analyse…' : 'Aperçu (sans toucher la base)'}
                  </CrmV2Button>
                  <CrmV2Button
                    variant="primary"
                    icon={loading === 'import' ? <AdminSpin /> : undefined}
                    onClick={runImport}
                    disabled={loading !== null}
                    style={isMobile ? { width: '100%', minHeight: 44 } : undefined}
                  >
                    {loading === 'import' ? 'Import en cours…' : <>Importer {apiRows.length} ligne{apiRows.length > 1 ? 's' : ''} <ArrowRight size={14} /></>}
                  </CrmV2Button>
                </div>

                {error && <AdminNotice tone="error" style={{ marginTop: 14 }}>{error}</AdminNotice>}

                {dryRunResult && !result && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted, marginBottom: 8 }}>Aperçu</div>
                    <ResultGrid items={[
                      { icon: <UserPlus size={15} />, label: 'À créer', value: dryRunResult.to_create || 0, color: crmV2.link },
                      { icon: <RefreshCw size={15} />, label: 'À mettre à jour', value: dryRunResult.to_update || 0, color: crmV2.gold },
                      { icon: <SkipForward size={15} />, label: 'Ignorés', value: dryRunResult.to_skip || 0, color: crmV2.textMuted },
                      ...((dryRunResult.errors?.length || 0) > 0
                        ? [{ icon: <AlertTriangle size={15} />, label: 'Erreurs', value: dryRunResult.errors!.length, color: crmV2.danger }]
                        : []),
                    ]} />
                  </div>
                )}

                {result && (
                  <div style={{ marginTop: 14 }}>
                    <AdminNotice tone="success" icon={<CheckCircle2 size={15} />} style={{ marginBottom: 10 }}>
                      <strong>Import terminé</strong>
                    </AdminNotice>
                    <ResultGrid items={[
                      { icon: <UserPlus size={15} />, label: 'Créés', value: result.created, color: crmV2.successStrong },
                      { icon: <RefreshCw size={15} />, label: 'Mis à jour', value: result.updated, color: crmV2.gold },
                      { icon: <SkipForward size={15} />, label: 'Ignorés', value: result.skipped, color: crmV2.textMuted },
                      ...((result.error_count || 0) > 0
                        ? [{ icon: <AlertTriangle size={15} />, label: 'Erreurs', value: result.error_count || 0, color: crmV2.danger }]
                        : []),
                    ]} />
                    {result.errors && result.errors.length > 0 && (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: crmV2.link, fontWeight: 600 }}>
                          Détail des {result.errors.length} premières erreurs
                        </summary>
                        <pre style={{
                          marginTop: 8, padding: 10, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 10,
                          fontSize: 12, overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {result.errors.map((e, i) => `[${i + 1}] ${e.email || `ligne ${e.row_index}`}: ${e.error}`).join('\n')}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </CrmV2Card>

              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
                <CrmV2Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={() => setStep(2)} style={navBtn}>
                  Retour
                </CrmV2Button>
              </div>
            </>
          )}
        </div>
      </div>
    </CrmV2Page>
  )
}

/** Petits indicateurs du résultat (aperçu ou import). */
function ResultGrid({ items }: { items: Array<{ icon: React.ReactNode; label: string; value: number; color: string }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
      {items.map(it => (
        <div key={it.label} style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px', background: crmV2.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: it.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {it.icon}<span style={{ color: crmV2.textMuted }}>{it.label}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: it.color, marginTop: 4 }}>{it.value.toLocaleString('fr-FR')}</div>
        </div>
      ))}
    </div>
  )
}
