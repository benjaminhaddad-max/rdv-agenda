'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Presentation, MessageSquareWarning } from 'lucide-react'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Card, CrmV2Empty, CrmV2Spinner, CrmV2Button,
  CrmV2StatusPill, CrmV2TileCard, CrmV2TileGrid,
} from '@/components/crm-v2/primitives'
import { MktNotice, useCrmBase } from '@/components/crm-v2/marketing/ui'
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
  const base = useCrmBase()
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
  const goNew = () => { window.location.href = `${base}/campaigns/webinars/new` }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Présentations webinaires"
        subtitle="Decks interactifs pour chaque webinaire : colle un guide, ajoute un brief, présente, puis laisse un retour pour qu’on ajuste."
        actions={
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={goNew}>
            Nouvelle présentation
          </CrmV2Button>
        }
      />
      <CrmV2Body>
        {loading && <CrmV2Spinner />}
        {error && <MktNotice tone="red">{error}</MktNotice>}

        {!loading && !error && sorted.length === 0 && (
          <CrmV2Card>
            <CrmV2Empty
              icon={<Presentation size={26} />}
              title="Aucune présentation pour l’instant"
              description="Crée le premier deck en collant le guide du webinaire. Les slides interactives sont générées automatiquement, puis on les peaufine ensemble."
              action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={goNew}>Créer la première présentation</CrmV2Button>}
            />
          </CrmV2Card>
        )}

        {sorted.length > 0 && (
          <CrmV2TileGrid>
            {sorted.map(row => {
              const theme = getDeckTheme(row.brand)
              const st = PRESENTATION_STATUSES[row.status as PresentationStatus] || PRESENTATION_STATUSES.draft
              const slides = normalizeSlides(row.slides)
              const htmlSrc = htmlDeckSrc(slides)
              const dateLabel = row.webinar_date
                ? new Date(row.webinar_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : null
              const feedback = row.open_feedback || 0
              return (
                <CrmV2TileCard
                  key={row.id}
                  href={`/admin/crm/campaigns/webinars/${row.id}`}
                  icon={<Presentation size={18} />}
                  iconColor={theme.primary}
                  status={<CrmV2StatusPill label={st.label} color={st.color} bg={st.bg} />}
                  title={row.title}
                  description={
                    <>
                      <span style={{ fontWeight: 700, color: theme.primary }}>{theme.name}</span>
                      {row.subtitle ? <> · {row.subtitle}</> : null}
                    </>
                  }
                  meta={
                    <>
                      {htmlSrc ? '23 slides · HTML Diploma' : `${slides.length} slides`}
                      {dateLabel && <> · {dateLabel}</>}
                      {feedback > 0 && (
                        <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b45309', fontWeight: 700, verticalAlign: 'middle' }}>
                          <MessageSquareWarning size={12} /> {feedback} retour{feedback > 1 ? 's' : ''}
                        </span>
                      )}
                    </>
                  }
                />
              )
            })}
          </CrmV2TileGrid>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}
