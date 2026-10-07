'use client'

import { Suspense, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Download, Eye, FileSpreadsheet, Info, Upload,
} from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Header, CrmV2Page, CrmV2Pill, CrmV2Table, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { V2Banner, V2CardTitle, V2Steps } from '@/components/crm-v2/marketing2/sms-events-tools/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { BRAND_CONFIG, EVENT_TYPES, type EventBrand } from '@/lib/events-studio/config'
import { IMPORT_DEFAULT_LOCATION, IMPORT_SCHEDULE } from '@/lib/events-studio/import-csv'

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

const IMPORT_STEPS = ['Fichier', 'Aperçu', 'Import']

function EventsImportInner() {
  const isMobile = useIsMobile()
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const actionable = useMemo(() => preview?.drafts.filter((d) => !d.skip) || [], [preview])
  const skipped = useMemo(() => preview?.drafts.filter((d) => d.skip) || [], [preview])

  // Nombre de lignes de données du fichier (hors en-tête), pour la carte fichier
  const lineCount = useMemo(() => {
    if (!csv) return 0
    return Math.max(0, csv.split(/\r?\n/).filter((l) => l.trim()).length - 1)
  }, [csv])

  // Étape courante : 0 = fichier, 1 = aperçu, 2 = import, 3 = terminé
  const step = commit ? 3 : preview ? 2 : csv ? 1 : 0

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

  const listHref = `/admin/crm/events?brand=${brand}`

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: listHref, label: 'Événements' }}
        title={`Import CSV — ${BRAND_CONFIG[brand].name}`}
        subtitle="Importer un fichier CSV d'événements : chaque ligne crée un brouillon et son formulaire CRM"
        actions={
          <a href="/modele-import-evenements.csv" download style={{ textDecoration: 'none' }}>
            <CrmV2Button variant="secondary" icon={<Download size={14} />}>Fichier modèle</CrmV2Button>
          </a>
        }
      />

      <CrmV2Body style={{ maxWidth: 960, boxSizing: 'border-box', paddingBottom: 48 }}>
        <V2Steps steps={IMPORT_STEPS} current={step} />

        {/* Carte fichier */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16, background: crmV2.goldSoft, color: '#b8963e',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileSpreadsheet size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fileName || 'Aucun fichier sélectionné'}
              </div>
              <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                {fileName
                  ? `${lineCount} ligne${lineCount > 1 ? 's' : ''} · fichier CSV`
                  : 'Fichier CSV (.csv) : Nom, Date, Heure début, Heure fin, Type, Lieu'}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = '' }}
              style={{ display: 'none' }}
            />
            <CrmV2Button
              variant={fileName ? 'secondary' : 'primary'}
              icon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
              style={isMobile ? { width: '100%', minHeight: 40 } : undefined}
            >
              {fileName ? 'Changer de fichier' : 'Choisir un fichier'}
            </CrmV2Button>
          </div>
        </CrmV2Card>

        {/* Règles d'import */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 18 }}>
          <V2CardTitle
            icon={<span style={{ color: crmV2.link, display: 'inline-flex', marginTop: 2 }}><Info size={16} /></span>}
            title="Format attendu"
            description={
              <>
                Colonnes : Nom, Date, Heure début, Heure fin, Type, Lieu. Sans horaires → webinaire{' '}
                {IMPORT_SCHEDULE.webinaire.time_start}–{IMPORT_SCHEDULE.webinaire.time_end}, présentiel{' '}
                {IMPORT_SCHEDULE.presentiel.time_start}–{IMPORT_SCHEDULE.presentiel.time_end}. Sans lieu
                (présentiel) → {IMPORT_DEFAULT_LOCATION}. Chaque ligne crée un brouillon + formulaire CRM
                « Nom — JJ/MM/AAAA ».
              </>
            }
          />
          <p style={{ margin: '10px 0 0', fontSize: 12, color: crmV2.textFaint, lineHeight: 1.5 }}>
            Type : Webinaire, Salon ou JPO. Lieu vide en présentiel = Quai de la Rapée. Zoom
            optionnel (colonne Zoom) pour les webinaires. Doublons (même nom + date) ignorés.{' '}
            <a href="/modele-import-evenements.csv" download style={{ color: crmV2.link, fontWeight: 600 }}>
              Télécharger le fichier modèle
            </a>
          </p>
        </CrmV2Card>

        {error && <V2Banner kind="error">{error}</V2Banner>}

        {commit && (
          <CrmV2Card style={{ padding: isMobile ? 14 : 18 }}>
            <V2CardTitle
              icon={<span style={{ color: crmV2.success, display: 'inline-flex', marginTop: 2 }}><CheckCircle2 size={18} /></span>}
              title="Import terminé"
              description={<>Créés : {commit.created} · Doublons ignorés : {commit.duplicates} · Échecs : {commit.failed}</>}
            />
            {commit.results.some((r) => !r.ok || r.form_warning) && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: crmV2.textMuted, lineHeight: 1.6 }}>
                {commit.results
                  .filter((r) => !r.ok || r.form_warning)
                  .map((r) => (
                    <li key={r.row}>
                      Ligne {r.row} — {r.name} : {r.error || r.form_warning}
                    </li>
                  ))}
              </ul>
            )}
            <div style={{ marginTop: 14 }}>
              <Link href={listHref} style={{ textDecoration: 'none' }}>
                <CrmV2Button variant="primary">Voir la liste</CrmV2Button>
              </Link>
            </div>
          </CrmV2Card>
        )}

        {preview && (
          <>
            {(preview.errors || []).length > 0 && (
              <V2Banner kind="error">{preview.errors.join(' · ')}</V2Banner>
            )}

            {/* Aperçu : chaque ligne du CSV → événement CRM */}
            <div style={{
              background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
              boxShadow: crmV2.shadow, overflow: 'hidden',
            }}>
              <div style={{ padding: isMobile ? '14px 14px 10px' : '16px 16px 12px' }}>
                <V2CardTitle
                  title="Aperçu des événements"
                  description={<>{preview.will_create} à créer · {preview.skipped} ignorée(s)</>}
                />
              </div>
              {isMobile ? (
                <div style={{ borderTop: `1px solid ${crmV2.border}` }}>
                  {actionable.map((d) => (
                    <div key={d.row} style={{ padding: '10px 14px', borderBottom: `1px solid ${crmV2.border}`, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: crmV2.textFaint, fontWeight: 700 }}>#{d.row}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                        <CrmV2Pill style={{ fontSize: 11 }}>
                          {EVENT_TYPES[d.event_type as keyof typeof EVENT_TYPES]?.short || d.event_type}
                        </CrmV2Pill>
                      </div>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.date} · {d.time_start}–{d.time_end}{d.location ? ` · ${d.location}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <CrmV2Table>
                    <thead>
                      <tr>
                        <CrmV2Th style={{ width: 48 }}>#</CrmV2Th>
                        <CrmV2Th>Nom</CrmV2Th>
                        <CrmV2Th>Type CRM</CrmV2Th>
                        <CrmV2Th>Date</CrmV2Th>
                        <CrmV2Th>Horaires</CrmV2Th>
                        <CrmV2Th>Lieu</CrmV2Th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionable.map((d) => (
                        <CrmV2Tr key={d.row}>
                          <CrmV2Td style={{ color: crmV2.textFaint, fontWeight: 600 }}>{d.row}</CrmV2Td>
                          <CrmV2Td style={{ fontWeight: 700 }}>{d.name}</CrmV2Td>
                          <CrmV2Td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <CrmV2Pill>
                                {EVENT_TYPES[d.event_type as keyof typeof EVENT_TYPES]?.short || d.event_type}
                              </CrmV2Pill>
                              <span style={{ fontSize: 11, color: crmV2.textFaint }}>{d.source_type}</span>
                            </span>
                          </CrmV2Td>
                          <CrmV2Td style={{ whiteSpace: 'nowrap' }}>{d.date}</CrmV2Td>
                          <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                            {d.time_start}–{d.time_end}
                          </CrmV2Td>
                          <CrmV2Td style={{ color: crmV2.textMuted }}>{d.location}</CrmV2Td>
                        </CrmV2Tr>
                      ))}
                    </tbody>
                  </CrmV2Table>
                </div>
              )}
            </div>

            {skipped.length > 0 && (
              <CrmV2Card style={{ padding: isMobile ? 14 : 18 }}>
                <V2CardTitle
                  icon={<span style={{ color: '#b45309', display: 'inline-flex', marginTop: 2 }}><AlertTriangle size={16} /></span>}
                  title="Lignes ignorées"
                />
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: crmV2.textMuted, lineHeight: 1.6 }}>
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

        {/* Pied du parcours : Retour / Prévisualiser / Créer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={listHref} style={{ textDecoration: 'none' }}>
            <CrmV2Button variant="secondary" icon={<ArrowLeft size={14} />} style={isMobile ? { minHeight: 40 } : undefined}>
              Retour
            </CrmV2Button>
          </Link>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <CrmV2Button
              variant="secondary"
              icon={<Eye size={14} />}
              onClick={runPreview}
              disabled={!csv || loading}
              style={isMobile ? { minHeight: 40 } : undefined}
            >
              Prévisualiser
            </CrmV2Button>
            <CrmV2Button
              variant="primary"
              onClick={runCommit}
              disabled={!csv || loading || (preview != null && preview.will_create === 0)}
              style={isMobile ? { minHeight: 40 } : undefined}
            >
              {loading ? 'Import…' : 'Créer les événements'}
              {!loading && <ArrowRight size={14} />}
            </CrmV2Button>
          </div>
        </div>
      </CrmV2Body>
    </CrmV2Page>
  )
}

export default function EventsImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 28, color: '#516f90', fontSize: 13 }}>Chargement…</div>}>
      <EventsImportInner />
    </Suspense>
  )
}
