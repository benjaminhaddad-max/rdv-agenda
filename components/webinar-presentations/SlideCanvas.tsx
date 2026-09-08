'use client'

import { getDeckTheme, revealStepsFor, type WebinarSlide } from '@/lib/webinar-presentations'

export function SlideCanvas({
  slide,
  brand,
  step = 99,
  compact = false,
  quizChoice = null,
  onQuizChoice,
}: {
  slide: WebinarSlide
  brand: string
  step?: number
  compact?: boolean
  quizChoice?: number | null
  onQuizChoice?: (i: number) => void
}) {
  const theme = getDeckTheme(brand)
  const max = revealStepsFor(slide)
  const shown = Math.min(step, max)
  const pad = compact ? 22 : 72
  const titleSize = compact ? 18 : slide.layout === 'title' ? 56 : 40
  const bodySize = compact ? 12 : 22

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `radial-gradient(1200px 600px at 10% -10%, ${theme.bgAlt} 0%, ${theme.bg} 55%)`,
        color: theme.text,
        fontFamily: 'ui-rounded, Quicksand, Inter, system-ui, sans-serif',
        padding: pad,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: slide.layout === 'title' || slide.layout === 'cta' ? 'center' : 'flex-start',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: -80,
          top: -80,
          width: compact ? 140 : 320,
          height: compact ? 140 : 320,
          borderRadius: '50%',
          background: theme.accent,
          opacity: 0.12,
          filter: 'blur(8px)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: -40,
          bottom: -60,
          width: compact ? 160 : 420,
          height: compact ? 160 : 420,
          borderRadius: '50%',
          border: `2px solid ${theme.accent}`,
          opacity: 0.18,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: compact ? '100%' : 980 }}>
        {slide.layout === 'title' && (
          <>
            <div style={{
              fontSize: compact ? 10 : 13,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: theme.accent,
              fontWeight: 700,
              marginBottom: compact ? 8 : 18,
            }}>
              {theme.name} · Webinaire
            </div>
            <h1 style={{
              margin: 0,
              fontSize: titleSize,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}>
              {slide.title}
            </h1>
            {slide.subtitle && (
              <p style={{
                margin: compact ? '10px 0 0' : '22px 0 0',
                fontSize: compact ? 12 : 24,
                color: theme.muted,
                maxWidth: 720,
                lineHeight: 1.4,
              }}>
                {slide.subtitle}
              </p>
            )}
          </>
        )}

        {slide.layout === 'section' && (
          <>
            <div style={{ color: theme.accent, fontWeight: 700, fontSize: compact ? 11 : 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
              Chapitre
            </div>
            <h2 style={{ margin: 0, fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.03em' }}>{slide.title}</h2>
            {slide.subtitle && (
              <p style={{ marginTop: 16, fontSize: bodySize, color: theme.muted }}>{slide.subtitle}</p>
            )}
          </>
        )}

        {slide.layout === 'quote' && (
          <>
            {slide.title && (
              <div style={{ color: theme.accent, fontWeight: 700, fontSize: compact ? 11 : 14, marginBottom: 16 }}>{slide.title}</div>
            )}
            <blockquote style={{
              margin: 0,
              fontSize: compact ? 16 : 36,
              lineHeight: 1.25,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}>
              {slide.body || slide.subtitle}
            </blockquote>
          </>
        )}

        {slide.layout === 'cta' && (
          <>
            <h2 style={{ margin: 0, fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.03em' }}>{slide.title}</h2>
            {(slide.subtitle || slide.body) && (
              <p style={{ marginTop: 18, fontSize: compact ? 13 : 22, color: theme.muted, maxWidth: 640 }}>
                {slide.subtitle || slide.body}
              </p>
            )}
            <div style={{
              marginTop: compact ? 14 : 32,
              display: 'inline-flex',
              padding: compact ? '6px 12px' : '12px 22px',
              borderRadius: 999,
              background: theme.accent,
              color: theme.bg,
              fontWeight: 800,
              fontSize: compact ? 11 : 16,
            }}>
              On échange →
            </div>
          </>
        )}

        {(slide.layout === 'bullets' || slide.layout === 'split') && (
          <div style={{ display: 'grid', gridTemplateColumns: slide.layout === 'split' && !compact ? '0.9fr 1.1fr' : '1fr', gap: compact ? 10 : 40, alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.03em' }}>{slide.title}</h2>
              {slide.subtitle && <p style={{ margin: 0, color: theme.muted, fontSize: compact ? 12 : 18 }}>{slide.subtitle}</p>}
            </div>
            <div>
              {slide.body && !(slide.bullets && slide.bullets.length) && (
                <p style={{ fontSize: bodySize, lineHeight: 1.45, color: theme.muted }}>{slide.body}</p>
              )}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: compact ? 6 : 14 }}>
                {(slide.bullets || []).map((b, i) => {
                  const visible = shown > i
                  return (
                    <li
                      key={i}
                      style={{
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(10px)',
                        transition: compact ? 'none' : 'opacity .35s ease, transform .35s ease',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        fontSize: bodySize,
                        lineHeight: 1.35,
                      }}
                    >
                      <span style={{
                        width: compact ? 8 : 12,
                        height: compact ? 8 : 12,
                        marginTop: compact ? 4 : 8,
                        borderRadius: 99,
                        background: theme.accent,
                        flexShrink: 0,
                      }} />
                      <span>{b}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}

        {slide.layout === 'stats' && (
          <>
            <h2 style={{ margin: '0 0 28px', fontSize: titleSize, fontWeight: 800 }}>{slide.title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(slide.stats?.length || 1, compact ? 2 : 3)}, minmax(0, 1fr))`, gap: compact ? 8 : 18 }}>
              {(slide.stats || []).map((st, i) => {
                const visible = shown > i
                return (
                  <div
                    key={i}
                    style={{
                      background: theme.card,
                      border: `1px solid ${theme.accent}33`,
                      borderRadius: compact ? 10 : 18,
                      padding: compact ? 10 : 24,
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(16px)',
                      transition: compact ? 'none' : 'opacity .4s ease, transform .4s ease',
                    }}
                  >
                    <div style={{ fontSize: compact ? 18 : 40, fontWeight: 800, color: theme.accent }}>{st.value}</div>
                    <div style={{ marginTop: 6, color: theme.muted, fontSize: compact ? 11 : 16 }}>{st.label}</div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {slide.layout === 'cards' && (
          <>
            <h2 style={{ margin: '0 0 22px', fontSize: titleSize, fontWeight: 800 }}>{slide.title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: compact ? 8 : 16 }}>
              {(slide.cards || []).map((c, i) => {
                const visible = shown > i
                return (
                  <div
                    key={i}
                    style={{
                      background: theme.card,
                      borderRadius: compact ? 10 : 16,
                      padding: compact ? 10 : 20,
                      border: `1px solid rgba(255,255,255,0.08)`,
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(14px)',
                      transition: compact ? 'none' : 'opacity .35s ease, transform .35s ease',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: compact ? 12 : 18, marginBottom: 8 }}>{c.title}</div>
                    {c.body && <div style={{ color: theme.muted, fontSize: compact ? 11 : 15, lineHeight: 1.4 }}>{c.body}</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {slide.layout === 'quiz' && slide.quiz && (
          <>
            <div style={{ color: theme.accent, fontWeight: 700, fontSize: compact ? 11 : 13, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
              Question
            </div>
            <h2 style={{ margin: '0 0 22px', fontSize: compact ? 16 : 34, fontWeight: 800, lineHeight: 1.2 }}>
              {slide.quiz.question || slide.title}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 12, maxWidth: 720 }}>
              {slide.quiz.options.map((opt, i) => {
                const selected = quizChoice === i
                const revealed = shown >= 2 && quizChoice != null
                const correct = slide.quiz?.correctIndex === i
                let border = 'rgba(255,255,255,0.12)'
                let bg = theme.card
                if (selected) { border = theme.accent; bg = `${theme.accent}22` }
                if (revealed && correct) { border = '#34d399'; bg = 'rgba(52,211,153,0.18)' }
                if (revealed && selected && !correct && slide.quiz?.correctIndex != null) {
                  border = '#f87171'
                  bg = 'rgba(248,113,113,0.16)'
                }
                return compact ? (
                  <div
                    key={i}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 14,
                      border: `1.5px solid ${border}`,
                      background: bg,
                      color: theme.text,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {opt}
                  </div>
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onQuizChoice?.(i)
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '14px 18px',
                      borderRadius: 14,
                      border: `1.5px solid ${border}`,
                      background: bg,
                      color: theme.text,
                      cursor: 'pointer',
                      fontSize: 18,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {shown >= 2 && slide.quiz.explanation && (
              <p style={{ marginTop: 18, color: theme.muted, fontSize: compact ? 11 : 16 }}>{slide.quiz.explanation}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
