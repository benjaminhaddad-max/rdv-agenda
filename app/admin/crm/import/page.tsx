'use client'

import { useEffect, useMemo, useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'

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
  { key: 'hubspot_owner_id',    label: 'Propriétaire (owner_id)' },
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

  // Charge les owners pour le dropdown attribution
  useEffect(() => {
    fetch('/api/crm/metadata')
      .then(r => r.json())
      .then(d => setOwners(d.owners || []))
      .catch(() => {})
  }, [])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = String(e.target?.result || '')
      setCsvText(text)
      doParse(text)
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Import de contacts</h1>
        <p className="text-sm text-gray-600">
          Importe une liste de leads (CSV / Excel collé). Le département est auto-normalisé,
          la zone est calculée automatiquement, les doublons par email/téléphone sont détectés.
        </p>
      </div>

      {/* ─── Étape 1 : Upload / paste CSV ─────────────────── */}
      <section className="bg-white border rounded-lg p-5 mb-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Upload className="w-5 h-5 text-[#2ea3f2]" /> 1. Charger le CSV
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block">
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-[#2ea3f2] file:text-white file:font-medium hover:file:bg-[#0038f0]"
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">CSV, TSV ou Excel exporté en CSV</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">…ou colle directement ici :</p>
            <textarea
              value={csvText}
              onChange={e => { setCsvText(e.target.value); if (e.target.value.trim()) doParse(e.target.value) }}
              placeholder="firstname,lastname,email,phone,classe_actuelle,departement
Marie,Durand,marie@example.com,0612345678,Terminale,75"
              className="w-full h-24 px-3 py-2 border rounded-md text-xs font-mono"
            />
          </div>
        </div>
      </section>

      {/* ─── Étape 2 : Mapping colonnes ───────────────────── */}
      {parsed && parsed.headers.length > 0 && (
        <section className="bg-white border rounded-lg p-5 mb-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#2ea3f2]" />
            2. Vérifier le mapping
            <span className="text-sm font-normal text-gray-500">
              ({parsed.rows.length} ligne{parsed.rows.length > 1 ? 's' : ''} détectée{parsed.rows.length > 1 ? 's' : ''})
            </span>
          </h2>
          <div className="overflow-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Colonne CSV</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">→ Champ CRM</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Aperçu (3 valeurs)</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((h, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 font-mono">{h}</td>
                    <td className="px-3 py-2">
                      <select
                        value={mapping[i] || ''}
                        onChange={e => setMapping(m => ({ ...m, [i]: e.target.value }))}
                        className="w-full px-2 py-1 border rounded text-xs"
                      >
                        <option value="">— Ignorer —</option>
                        {CRM_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {parsed.rows.slice(0, 3).map(r => r[i] || '').filter(Boolean).join(' · ') || <span className="text-gray-300">vide</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasEmailOrPhone && (
            <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Tu dois mapper au minimum une colonne vers <strong>email</strong> ou <strong>téléphone</strong>.
            </div>
          )}
        </section>
      )}

      {/* ─── Étape 3 : Options ────────────────────────────── */}
      {parsed && parsed.rows.length > 0 && hasEmailOrPhone && (
        <section className="bg-white border rounded-lg p-5 mb-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">3. Options</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Origine par défaut</label>
              <input
                type="text"
                value={defaultOrigine}
                onChange={e => setDefaultOrigine(e.target.value)}
                placeholder="Import CSV"
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Utilisée si la colonne &quot;origine&quot; n&apos;est pas mappée.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Propriétaire par défaut</label>
              <select
                value={defaultOwnerId}
                onChange={e => setDefaultOwnerId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="">— Aucun (lead non attribué) —</option>
                {owners.map(o => {
                  const name = [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
                  return <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>{name}</option>
                })}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={e => setSkipDuplicates(e.target.checked)}
            />
            Ignorer les doublons (par défaut : mettre à jour le contact existant)
          </label>
        </section>
      )}

      {/* ─── Étape 4 : Aperçu / Import ────────────────────── */}
      {parsed && parsed.rows.length > 0 && hasEmailOrPhone && (
        <section className="bg-white border rounded-lg p-5 mb-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">4. Lancer l&apos;import</h2>
          <div className="flex gap-3 mb-4">
            <button
              onClick={runDryRun}
              disabled={loading !== null}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border rounded-md text-sm font-medium disabled:opacity-50"
            >
              {loading === 'preview' ? 'Analyse…' : 'Aperçu (sans toucher la DB)'}
            </button>
            <button
              onClick={runImport}
              disabled={loading !== null}
              className="px-4 py-2 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0] text-white rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {loading === 'import' ? 'Import en cours…' : <>Importer {apiRows.length} ligne{apiRows.length > 1 ? 's' : ''} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {dryRunResult && !result && (
            <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
              <div className="font-semibold mb-1">Aperçu :</div>
              <ul className="space-y-0.5">
                <li>📥 {dryRunResult.to_create || 0} contacts à créer</li>
                <li>🔄 {dryRunResult.to_update || 0} contacts existants à mettre à jour</li>
                <li>⏭ {dryRunResult.to_skip || 0} ignorés</li>
                {(dryRunResult.errors?.length || 0) > 0 && (
                  <li>⚠️ {dryRunResult.errors!.length} erreurs</li>
                )}
              </ul>
            </div>
          )}
          {result && (
            <div className="px-4 py-3 bg-green-50 border border-green-300 rounded-md text-sm">
              <div className="font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" /> Import terminé
              </div>
              <ul className="space-y-0.5">
                <li>✅ {result.created} contacts créés</li>
                <li>🔄 {result.updated} contacts mis à jour</li>
                <li>⏭ {result.skipped} ignorés</li>
                {(result.error_count || 0) > 0 && (
                  <li className="text-red-700">⚠️ {result.error_count} erreurs (voir détail ci-dessous)</li>
                )}
              </ul>
              {result.errors && result.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900">
                    Détail des {result.errors.length} premières erreurs
                  </summary>
                  <pre className="mt-2 p-2 bg-white border rounded text-xs overflow-auto max-h-60">
                    {result.errors.map((e, i) => `[${i + 1}] ${e.email || `ligne ${e.row_index}`}: ${e.error}`).join('\n')}
                  </pre>
                </details>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
