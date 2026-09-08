'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, StickyNote, Grid3X3, X } from 'lucide-react'
import { htmlDeckSrc, getDeckTheme, revealStepsFor, type WebinarSlide } from '@/lib/webinar-presentations'
import { SlideCanvas } from './SlideCanvas'

export default function WebinarDeckPlayer({
  title,
  brand,
  slides,
  onExit,
}: {
  title: string
  brand: string
  slides: WebinarSlide[]
  onExit: () => void
}) {
  const htmlSrc = htmlDeckSrc(slides)
  const theme = getDeckTheme(brand)
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(1)
  const [notesOn, setNotesOn] = useState(false)
  const [overview, setOverview] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [quizChoice, setQuizChoice] = useState<number | null>(null)

  const slide = slides[index] || slides[0]
  const maxStep = useMemo(() => (slide ? revealStepsFor(slide) : 1), [slide])

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, i))
    setIndex(next)
    setStep(1)
    setQuizChoice(null)
    setOverview(false)
  }, [slides.length])

  const next = useCallback(() => {
    if (step < maxStep) {
      setStep(s => s + 1)
      return
    }
    if (index < slides.length - 1) goTo(index + 1)
  }, [step, maxStep, index, slides.length, goTo])

  const prev = useCallback(() => {
    if (step > 1) {
      setStep(s => s - 1)
      return
    }
    if (index > 0) {
      const prevSlide = slides[index - 1]
      setIndex(index - 1)
      setStep(revealStepsFor(prevSlide))
      setQuizChoice(null)
    }
  }, [step, index, slides])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overview) { setOverview(false); return }
        onExit()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Home') {
        goTo(0)
      } else if (e.key === 'End') {
        goTo(slides.length - 1)
      } else if (e.key === 'n' || e.key === 'N') {
        setNotesOn(v => !v)
      } else if (e.key === 'o' || e.key === 'O') {
        setOverview(v => !v)
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, goTo, onExit, overview, slides.length])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setFullscreen(false)
    }
  }

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (htmlSrc) {
    return (
      <HtmlDeckFrame src={htmlSrc} title={title} onExit={onExit} />
    )
  }

  if (!slide) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: theme.bg, color: theme.text, display: 'grid', placeItems: 'center' }}>
        <div>Aucune slide.</div>
      </div>
    )
  }

  const progress = ((index + step / maxStep) / slides.length) * 100

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: '#000',
        color: theme.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 4,
          background: 'rgba(255,255,255,0.12)',
          flexShrink: 0,
        }}
      >
        <div style={{ height: '100%', width: `${progress}%`, background: theme.accent, transition: 'width .25s ease' }} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <div
          role="presentation"
          onClick={next}
          style={{
            flex: 1,
            minWidth: 0,
            cursor: 'pointer',
          }}
        >
          <SlideCanvas
            slide={slide}
            brand={brand}
            step={step}
            quizChoice={quizChoice}
            onQuizChoice={i => {
              setQuizChoice(i)
              setStep(s => Math.max(s, 2))
            }}
          />
        </div>

        {notesOn && slide.notes && (
          <aside style={{
            width: 320,
            flexShrink: 0,
            background: 'rgba(0,0,0,0.72)',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            padding: 18,
            overflow: 'auto',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: theme.accent, marginBottom: 10 }}>
              Notes orateur
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.86)' }}>{slide.notes}</p>
          </aside>
        )}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.72)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button type="button" onClick={onExit} style={ctrlBtn} title="Quitter (Esc)">
            <X size={15} /> Quitter
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={prev} disabled={index === 0 && step === 1} style={ctrlBtn} title="Précédent">
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 72, textAlign: 'center', opacity: 0.85 }}>
            {index + 1} / {slides.length}
          </span>
          <button type="button" onClick={next} disabled={index === slides.length - 1 && step >= maxStep} style={ctrlBtn} title="Suivant">
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => setOverview(v => !v)} style={ctrlBtn} title="Vue d’ensemble (O)">
            <Grid3X3 size={15} />
          </button>
          <button type="button" onClick={() => setNotesOn(v => !v)} style={{ ...ctrlBtn, opacity: notesOn ? 1 : 0.7 }} title="Notes (N)">
            <StickyNote size={15} />
          </button>
          <button type="button" onClick={toggleFullscreen} style={ctrlBtn} title="Plein écran (F)">
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {overview && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.86)',
            zIndex: 2,
            overflow: 'auto',
            padding: 28,
          }}
          onClick={() => setOverview(false)}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={e => { e.stopPropagation(); goTo(i) }}
                style={{
                  border: i === index ? `2px solid ${theme.accent}` : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  height: 150,
                  padding: 0,
                  cursor: 'pointer',
                  background: 'transparent',
                  position: 'relative',
                }}
              >
                <SlideCanvas slide={s} brand={brand} compact step={99} />
                <span style={{
                  position: 'absolute',
                  left: 8,
                  bottom: 8,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 99,
                  padding: '2px 8px',
                }}>
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HtmlDeckFrame({ src, title, onExit }: { src: string; title: string; onExit: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0d2238' }}>
      <iframe
        src={src}
        title={title}
        style={{ width: '100%', height: '100%', border: 'none', background: '#0d2238' }}
      />
      <button
        type="button"
        onClick={onExit}
        style={{
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 81,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(13,34,56,0.88)',
          border: '1px solid rgba(211,171,103,0.45)',
          color: '#d3ab67',
          borderRadius: 999,
          padding: '8px 14px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'inherit',
        }}
      >
        <X size={14} /> Quitter
      </button>
    </div>
  )
}

const ctrlBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  borderRadius: 999,
  padding: '7px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'inherit',
}
