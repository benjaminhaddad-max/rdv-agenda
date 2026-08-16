'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { BRAND_CONFIG, EVENT_TYPES, type EventBrand } from '@/lib/events-studio/config'
import { IMPORT_SCHEDULE } from '@/lib/events-studio/import-csv'

type Draft = {
  row: number
  name: string
  event_type: string
  date: string
  time_start: string
  time_end: string
  location: string
  source_type: string
  skip: boolean
  skip_reason?: string
}

type PreviewResponse = {
  mode: string
  brand: string
  errors: string[]
  total_rows: number
  will_create: number
  skipped: number
  drafts: Draft[]
}

type CommitResponse = {
  mode: string
  created: number
  duplicates: number
  failed: number
  results: Array<{
    row: number
    name: string
    ok: boolean
    skipped_duplicate?: boolean
    error?: string
    form_warning?: string | null
  }>
  skipped_rows: Draft[]
}

function EventsImportInner() {
  const search = useSearchParams()
  const brandParam = search.get('brand')
  const brand: EventBrand =
    brandParam === 'medibox' || brandParam === 'edumove' || brandParam === 'diploma'
      ? brandParam
      : 'diploma'

  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [commit, setCommit] = useState<CommitResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionable = useMemo(() => preview?.drafts.filter((d) => !d.skip) || [], [preview])
  const skipped = useMemo(() => preview?.drafts.filter((d) => d.skip) || [], [preview])

  async function onFile(file: File | null) {
    if (!file) return
    setFileName(file.name)
    setCommit(null)
    setPreview(null)
    setError(null)
    const text = await file.text()
    setCsv(text)
  }

  async function runPreview() {
    setLoading(true)
    setError(null)
    setCommit(null)
    try {
      const res = await fetch('/api/events-studio/events/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', brand, csv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur preview')
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function runCommit() {
    if (!csv.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/events-studio/events/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'commit', brand, csv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur import')
      setCommit(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft }}>
      <MarketingNav title="Importer des événements" />
      <CrmV2Page style={{ paddingBottom: 48 }}>
        <div style={{ padding: '20px 28px 0' }}>
          <Link
            href={`/admin/crm/events?brand=${brand}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: crmV2.link,
              textDecoration: 'none',
              marginBottom: 12,
            }}
          >
            <ArrowLeft size={14} /> Retour aux événements
          </Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: crmV2.text }}>
            Import CSV — {BRAND_CONFIG[brand].name}
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: crmV2.textMuted, maxWidth: 640 }}>
            Chargez un planning (Type, Opération, Date événement…). Les webinaires sont créés à{' '}
            {IMPORT_SCHEDULE.webinaire.time_start}–{IMPORT_SCHEDULE.webinaire.time_end}, les
            événements présentiels à {IMPORT_SCHEDULE.presentiel.time_start}–
            {IMPORT_SCHEDULE.presentiel.time_end}. Chaque ligne crée un brouillon + formulaire CRM
            « Nom — JJ/MM/AAAA ».
          </p>
        </div>

        <div style={{ padding: '20px 28px', display: 'grid', gap: 16, maxWidth: 960 }}>
          <CrmV2Card style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <FileUp size={18} color={crmV2.gold} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Fichier CSV</span>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
              style={{ fontSize: 13 }}
            />
            {fileName && (
              <div style={{ marginTop: 8, fontSize: 12, color: crmV2.textMuted }}>{fileName}</div>
            )}
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Button variant="secondary" onClick={runPreview} disabled={!csv || loading}>
                Prévisualiser
              </CrmV2Button>
              <CrmV2Button
                variant="gold"
                onClick={runCommit}
                disabled={!csv || loading || (preview != null && preview.will_create === 0)}
              >
                {loading ? 'Import…' : 'Créer les événements'}
              </CrmV2Button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: crmV2.textFaint }}>
              Colonnes attendues : Type (Webinaire / Événement physique), Opération, Date événement
              (JJ/MM/AAAA). Les lignes « Réserve » sont ignorées. Les doublons (même nom + date)
              sont sautés.
            </p>
          </CrmV2Card>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: crmV2.radius,
                background: crmV2.dangerSoft,
                color: crmV2.danger,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {commit && (
            <CrmV2Card style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircle2 size={16} color={crmV2.success} />
                <strong style={{ fontSize: 14 }}>Import terminé</strong>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: crmV2.textMuted }}>
                Créés : {commit.created} · Doublons ignorés : {commit.duplicates} · Échecs :{' '}
                {commit.failed}
              </p>
              {commit.results.some((r) => !r.ok || r.form_warning) && (
                <ul
                  style={{
                    margin: '10px 0 0',
                    paddingLeft: 18,
                    fontSize: 12,
                    color: crmV2.textMuted,
                  }}
                >
                  {commit.results
                    .filter((r) => !r.ok || r.form_warning)
                    .map((r) => (
                      <li key={r.row}>
                        Ligne {r.row} — {r.name} : {r.error || r.form_warning}
                      </li>
                    ))}
                </ul>
              )}
              <div style={{ marginTop: 12 }}>
                <Link href={`/admin/crm/events?brand=${brand}`} style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="primary">Voir la liste</CrmV2Button>
                </Link>
              </div>
            </CrmV2Card>
          )}

          {preview && (
            <>
              {(preview.errors || []).length > 0 && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: crmV2.radius,
                    background: crmV2.dangerSoft,
                    color: crmV2.danger,
                    fontSize: 13,
                  }}
                >
                  {preview.errors.join(' · ')}
                </div>
              )}
              <CrmV2Card style={{ padding: 18 }}>
                <div style={{ fontSize: 13, color: crmV2.textMuted, marginBottom: 12 }}>
                  {preview.will_create} à créer · {preview.skipped} ignorée(s)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: crmV2.textMuted, fontSize: 11 }}>
                        <th style={{ padding: '6px 8px' }}>#</th>
                        <th style={{ padding: '6px 8px' }}>Nom</th>
                        <th style={{ padding: '6px 8px' }}>Type CRM</th>
                        <th style={{ padding: '6px 8px' }}>Date</th>
                        <th style={{ padding: '6px 8px' }}>Horaires</th>
                        <th style={{ padding: '6px 8px' }}>Lieu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionable.map((d) => (
                        <tr key={d.row} style={{ borderTop: `1px solid ${crmV2.border}` }}>
                          <td style={{ padding: '8px' }}>{d.row}</td>
                          <td style={{ padding: '8px', fontWeight: 500 }}>{d.name}</td>
                          <td style={{ padding: '8px' }}>
                            {EVENT_TYPES[d.event_type as keyof typeof EVENT_TYPES]?.short ||
                              d.event_type}
                            <div style={{ fontSize: 11, color: crmV2.textFaint }}>{d.source_type}</div>
                          </td>
                          <td style={{ padding: '8px' }}>{d.date}</td>
                          <td style={{ padding: '8px' }}>
                            {d.time_start}–{d.time_end}
                          </td>
                          <td style={{ padding: '8px' }}>{d.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CrmV2Card>

              {skipped.length > 0 && (
                <CrmV2Card style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AlertTriangle size={14} color={crmV2.textMuted} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Lignes ignorées</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: crmV2.textMuted }}>
                    {skipped.map((d) => (
                      <li key={d.row}>
                        Ligne {d.row} — {d.name} : {d.skip_reason}
                      </li>
                    ))}
                  </ul>
                </CrmV2Card>
              )}
            </>
          )}
        </div>
      </CrmV2Page>
    </div>
  )
}

export default function EventsImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 28, color: '#516f90', fontSize: 13 }}>Chargement…</div>}>
      <EventsImportInner />
    </Suspense>
  )
}
