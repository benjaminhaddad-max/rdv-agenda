import { ImageResponse } from 'next/og'
import { detectLandingKind, formatEventDate } from '@/lib/event-landing/format'
import { loadPublicFormPage } from '@/lib/event-landing/load'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await loadPublicFormPage(slug)
  const title = page.kind === 'landing' ? page.data.event.name : page.kind === 'form' ? page.form.title || 'Inscription' : 'Diploma Santé'
  const fmt = page.kind === 'landing' ? formatEventDate(page.data.event) : null
  const kind = page.kind === 'landing' ? detectLandingKind(page.data.event) : null
  const kicker = kind === 'webinaire' ? 'Webinaire' : kind === 'immersion' ? 'Journée d’immersion' : kind === 'salon' ? 'Salon' : 'Événement'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#12314d',
          padding: 72,
          color: '#fff',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#d3ab67',
              fontFamily: 'sans-serif',
              fontWeight: 600,
            }}
          >
            Diploma Santé · {kicker}
          </div>
          {fmt && (
            <div
              style={{
                background: '#d3ab67',
                color: '#12314d',
                borderRadius: 20,
                padding: '16px 22px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1 }}>{fmt.jour}</div>
              <div style={{ fontSize: 16, letterSpacing: 3, fontFamily: 'sans-serif', fontWeight: 600 }}>{fmt.mois}</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
          <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.08 }}>{title}</div>
          {fmt && (
            <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.78)', fontFamily: 'sans-serif' }}>
              {fmt.dateLongue} · {fmt.horaires}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  )
}
