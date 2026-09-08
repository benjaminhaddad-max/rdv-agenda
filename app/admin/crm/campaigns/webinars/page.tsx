'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Presentation, MessageSquareWarning } from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  PRESENTATION_STATUSES,
  getDeckTheme,
  htmlDeckSrc,
  normalizeSlides,
  type PresentationStatus,
  type WebinarPresentation,
} from '@/lib/webinar-presentations'

type Row = WebinarPresentation & { open_feedback?: number }

export default function WebinarPresentationsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/webinar-presentations')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        setRows(Array.isArray(d) ? d : [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(
    () => [...rows].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
    [rows],
  )

  return (
    <div>
      <MarketingNav title="Présentations webinaires" />
      <CrmV2Page style={{ padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: crmV2.text }}>Présentations webinaires</h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: crmV2.textMuted, maxWidth: 640 }}>
                Decks interactifs type PowerPoint pour chaque webinaire. Colle un guide, ajoute un brief, présente, puis laisse un retour pour qu’on ajuste.
              </p>
            </div>
            <a href="/admin/crm/campaigns/webinars/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, background: crmV2.text,
              border: `1px solid ${crmV2.text}`, color: '#fff', textDecoration: 'none',
            }}>
              <Plus size={15} /> Nouvelle présentation
            </a>
          </div>

          {loading && <p style={{ color: crmV2.textMuted }}>Chargement…</p>}
          {error && <p style={{ color: crmV2.danger }}>{error}</p>}

          {!loading && !error && sorted.length === 0 && (
            <CrmV2Card style={{ padding: 36, textAlign: 'center' }}>
              <Presentation size={28} color={crmV2.gold} style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 700, fontSize: 16, color: crmV2.text }}>Aucune présentation pour l’instant</div>
              <p style={{ color: crmV2.textMuted, fontSize: 14, maxWidth: 480, margin: '8px auto 18px' }}>
                Crée le premier deck en collant le guide du webinaire. Les slides interactives sont générées automatiquement, puis on les peaufine ensemble.
              </p>
              <a href="/admin/crm/campaigns/webinars/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999,
                padding: '8px 16px', fontSize: 13, fontWeight: 600, background: crmV2.goldSoft,
                border: `1px solid ${crmV2.goldBorder}`, color: crmV2.gold, textDecoration: 'none',
              }}>
                Créer la première présentation
              </a>
            </CrmV2Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {sorted.map(row => {
              const theme = getDeckTheme(row.brand)
              const st = PRESENTATION_STATUSES[row.status as PresentationStatus] || PRESENTATION_STATUSES.draft
              const slides = normalizeSlides(row.slides)
              const htmlSrc = htmlDeckSrc(slides)
              const dateLabel = row.webinar_date
                ? new Date(row.webinar_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : null
              return (
                <Link key={row.id} href={`/admin/crm/campaigns/webinars/${row.id}`} style={{ textDecoration: 'none' }}>
                  <CrmV2Card style={{ overflow: 'hidden', height: '100%' }}>
                    <div style={{
                      height: 8,
                      background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
                    }} />
                    <div style={{ padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: theme.primary }}>{theme.name}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: st.bg, color: st.color,
                        }}>
                          {st.label}
                        </span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: crmV2.text, lineHeight: 1.25 }}>{row.title}</div>
                      {row.subtitle && (
                        <div style={{ marginTop: 4, fontSize: 13, color: crmV2.textMuted }}>{row.subtitle}</div>
                      )}
                      <div style={{ marginTop: 14, display: 'flex', gap: 12, fontSize: 12, color: crmV2.textFaint }}>
                        <span>{htmlSrc ? '23 slides · HTML Diploma' : `${slides.length} slides`}</span>
                        {dateLabel && <span>{dateLabel}</span>}
                        {(row.open_feedback || 0) > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b45309', fontWeight: 700 }}>
                            <MessageSquareWarning size={12} /> {row.open_feedback} retour{(row.open_feedback || 0) > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </CrmV2Card>
                </Link>
              )
            })}
          </div>
        </div>
      </CrmV2Page>
    </div>
  )
}
