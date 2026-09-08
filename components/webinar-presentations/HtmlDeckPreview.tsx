'use client'

import Link from 'next/link'
import { Maximize2, Play } from 'lucide-react'
import { CrmV2Card } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

function presentSrc(src: string) {
  return src.includes('?') ? `${src}&present=1` : `${src}?present=1`
}

export function HtmlDeckPreview({
  src,
  title,
  meta = '23 slides · 45 min · Charte Diploma Santé',
  presentHref,
}: {
  src: string
  title: string
  meta?: string
  presentHref: string
}) {
  return (
    <CrmV2Card style={{ marginTop: 16, overflow: 'hidden' }}>
      <div
        style={{
          height: 6,
          background: 'linear-gradient(90deg, #4fabdb 0%, #d3ab67 55%, #0d2238 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          padding: '16px 20px 14px',
          background: crmV2.bg,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: crmV2.gold,
            }}
          >
            Aperçu du deck
          </div>
          <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: crmV2.text, letterSpacing: '-0.02em' }}>
            {title}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45, maxWidth: 560 }}>
            {meta}
          </div>
        </div>
        <Link
          href={presentHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            borderRadius: 999,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            background: crmV2.text,
            color: '#fff',
            border: `1px solid ${crmV2.text}`,
          }}
        >
          <Play size={14} fill="currentColor" />
          Présenter
        </Link>
      </div>

      <div
        style={{
          background: 'linear-gradient(180deg, #eef1f6 0%, #e3eaf2 100%)',
          padding: '28px 28px 22px',
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            aspectRatio: '16 / 9',
            borderRadius: 18,
            overflow: 'hidden',
            background: '#0d2238',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 50px rgba(13,34,56,0.22), 0 0 0 1px rgba(201,168,76,0.28)',
          }}
        >
          <iframe
            src={presentSrc(src)}
            title={title}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#0d2238',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            marginTop: 14,
            fontSize: 12,
            color: crmV2.textFaint,
          }}
        >
          <Maximize2 size={12} />
          Clique dans l’aperçu, flèches pour parcourir · Présenter pour le plein écran
        </div>
      </div>
    </CrmV2Card>
  )
}
