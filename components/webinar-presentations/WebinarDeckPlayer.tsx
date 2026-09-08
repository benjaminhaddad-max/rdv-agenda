'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, StickyNote, Grid3X3, X } from 'lucide-react'
import { htmlDeckSrc, getDeckTheme, revealStepsFor, type WebinarSlide } from '@/lib/webinar-presentations'
import { enhanceHtmlDeck, htmlDeckNav } from '@/lib/webinar-deck-enhance'
import { SlideCanvas } from './SlideCanvas'
import './webinar-present.css'

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
  if (htmlSrc) {
    return <HtmlDeckFrame src={htmlSrc} title={title} onExit={onExit} />
  }
  return (
    <NativeDeckPlayer
      title={title}
      brand={brand}
      slides={slides}
      onExit={onExit}
    />
  )
}

function NativeDeckPlayer({
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
  const theme = getDeckTheme(brand)
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(1)
  const [notesOn, setNotesOn] = useState(false)
  const [overview, setOverview] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [quizChoice, setQuizChoice] = useState<number | null>(null)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [sweepOn, setSweepOn] = useState(false)
  const [live, setLive] = useState(false)
  const [showUi, setShowUi] = useState(true)
  const idleRef = useRef<number | null>(null)

  const slide = slides[index] || slides[0]
  const maxStep = useMemo(() => (slide ? revealStepsFor(slide) : 1), [slide])
  const progress = slides.length ? ((index + step / maxStep) / slides.length) * 100 : 0

  const bumpUi = useCallback(() => {
    setShowUi(true)
    if (idleRef.current) window.clearTimeout(idleRef.current)
    idleRef.current = window.setTimeout(() => setShowUi(false), 2200)
  }, [])

  useEffect(() => {
    bumpUi()
    const t = window.setTimeout(() => setLive(true), 80)
    return () => window.clearTimeout(t)
  }, [bumpUi])

  const goTo = useCallback((i: number, nextDir?: 'fwd' | 'back') => {
    const next = Math.max(0, Math.min(slides.length - 1, i))
    setDir(nextDir || (next >= index ? 'fwd' : 'back'))
    setIndex(next)
    setStep(1)
    setQuizChoice(null)
    setOverview(false)
    setSweepOn(false)
    requestAnimationFrame(() => setSweepOn(true))
  }, [slides.length, index])

  const next = useCallback(() => {
    if (step < maxStep) {
      setStep(s => s + 1)
      return
    }
    if (index < slides.length - 1) goTo(index + 1, 'fwd')
  }, [step, maxStep, index, slides.length, goTo])

  const prev = useCallback(() => {
    if (step > 1) {
      setStep(s => s - 1)
      return
    }
    if (index > 0) {
      const prevSlide = slides[index - 1]
      setDir('back')
      setIndex(index - 1)
      setStep(revealStepsFor(prevSlide))
      setQuizChoice(null)
      setSweepOn(false)
      requestAnimationFrame(() => setSweepOn(true))
    }
  }, [step, index, slides])

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
    const onKey = (e: KeyboardEvent) => {
      bumpUi()
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
        goTo(0, 'back')
      } else if (e.key === 'End') {
        goTo(slides.length - 1, 'fwd')
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
  }, [next, prev, goTo, onExit, overview, slides.length, bumpUi])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (!slide) {
    return (
      <div className="webinar-present wp-show-ui">
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: theme.text }}>Aucune slide.</div>
      </div>
    )
  }

  return (
    <div
      className={`webinar-present${showUi ? ' wp-show-ui' : ''}`}
      onMouseMove={bumpUi}
      onTouchStart={bumpUi}
    >
      <div className="webinar-present-ambient" />
      <Curtain />
      <div className={`webinar-present-frame${live ? ' is-live' : ''}`}>
        <div
          className="webinar-present-stage"
          role="presentation"
          onClick={e => {
            const x = e.clientX / window.innerWidth
            if (x < 0.22) prev()
            else next()
          }}
        >
          <div className="webinar-present-board">
            <div className="webinar-present-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className={`webinar-present-sweep${sweepOn ? ' is-on' : ''}`} />
            <div key={`${slide.id}-${dir}`} className={`webinar-present-slide is-${dir}`}>
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
          </div>
        </div>
      </div>

      {notesOn && slide.notes && (
        <aside className="webinar-present-notes">
          <div className="webinar-present-kicker" style={{ marginBottom: 8 }}>Notes orateur</div>
          <p>{slide.notes}</p>
        </aside>
      )}

      <Chrome
        title={title}
        index={index}
        total={slides.length}
        fullscreen={fullscreen}
        notesOn={notesOn}
        onExit={onExit}
        onPrev={prev}
        onNext={next}
        disablePrev={index === 0 && step === 1}
        disableNext={index === slides.length - 1 && step >= maxStep}
        onOverview={() => setOverview(v => !v)}
        onNotes={() => setNotesOn(v => !v)}
        onFullscreen={toggleFullscreen}
      />

      {overview && (
        <div className="webinar-present-overview" onClick={() => setOverview(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={e => { e.stopPropagation(); goTo(i) }}
                style={{
                  border: i === index ? '2px solid #d3ab67' : '1px solid rgba(255,255,255,0.12)',
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
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [live, setLive] = useState(false)
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(23)
  const [sweepOn, setSweepOn] = useState(false)
  const [showUi, setShowUi] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const idleRef = useRef<number | null>(null)

  const bumpUi = useCallback(() => {
    setShowUi(true)
    if (idleRef.current) window.clearTimeout(idleRef.current)
    idleRef.current = window.setTimeout(() => setShowUi(false), 2200)
  }, [])

  useEffect(() => {
    bumpUi()
  }, [bumpUi])

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
    const iframe = iframeRef.current
    if (!iframe) return
    return enhanceHtmlDeck(iframe)
  }, [src])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d?.webinarPresent === 'exit') onExit()
      if (d?.webinarPresent === 'fullscreen') toggleFullscreen()
      if (typeof d?.slideIndexChanged === 'number') {
        const nextIndex = d.slideIndexChanged
        setIndex(prev => {
          if (prev !== nextIndex) {
            queueMicrotask(() => {
              setSweepOn(false)
              requestAnimationFrame(() => setSweepOn(true))
              bumpUi()
            })
          }
          return nextIndex
        })
        if (typeof d.deckTotal === 'number' && d.deckTotal > 0) setTotal(d.deckTotal)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onExit, bumpUi])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      bumpUi()
      if (e.key === 'Escape') onExit()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, bumpUi])

  const progress = total ? ((index + 1) / total) * 100 : 0

  function sendDeckNav(delta: number) {
    const iframe = iframeRef.current
    if (iframe) htmlDeckNav(iframe, delta)
  }

  return (
    <div
      className={`webinar-present${showUi ? ' wp-show-ui' : ''}`}
      onMouseMove={bumpUi}
      onTouchStart={bumpUi}
    >
      <div className="webinar-present-ambient" />
      <Curtain />
      <div className={`webinar-present-frame${live ? ' is-live' : ''}`}>
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="webinar-present-iframe"
          onLoad={() => {
            setLive(true)
            try { iframeRef.current?.focus() } catch { /* ignore */ }
          }}
        />
        <div className="webinar-present-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className={`webinar-present-sweep${sweepOn ? ' is-on' : ''}`} />
      </div>
      <Chrome
        title={title}
        index={index}
        total={total}
        fullscreen={fullscreen}
        notesOn={false}
        hideNotes
        hideOverview
        onExit={onExit}
        onPrev={() => sendDeckNav(-1)}
        onNext={() => sendDeckNav(1)}
        disablePrev={index <= 0}
        disableNext={index >= total - 1}
        onOverview={() => {}}
        onNotes={() => {}}
        onFullscreen={toggleFullscreen}
      />
    </div>
  )
}

function Curtain() {
  return (
    <div className="webinar-present-curtain" aria-hidden>
      <div className="webinar-present-curtain-inner">
        <div className="webinar-present-curtain-kicker">Diploma Santé</div>
        <div className="webinar-present-curtain-line" />
      </div>
    </div>
  )
}

function Chrome({
  title,
  index,
  total,
  fullscreen,
  notesOn,
  hideNotes,
  hideOverview,
  onExit,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
  onOverview,
  onNotes,
  onFullscreen,
}: {
  title: string
  index: number
  total: number
  fullscreen: boolean
  notesOn: boolean
  hideNotes?: boolean
  hideOverview?: boolean
  onExit: () => void
  onPrev: () => void
  onNext: () => void
  disablePrev: boolean
  disableNext: boolean
  onOverview: () => void
  onNotes: () => void
  onFullscreen: () => void
}) {
  const dots = Math.min(total, 24)
  return (
    <div className="webinar-present-chrome">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button type="button" className="webinar-present-btn is-gold" onClick={onExit} title="Quitter (Esc)">
          <X size={14} /> Quitter
        </button>
        <div className="webinar-present-meta">
          <div className="webinar-present-kicker">Présentation</div>
          <div className="webinar-present-title">{title}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="webinar-present-btn" onClick={onPrev} disabled={disablePrev} title="Précédent">
          <ChevronLeft size={16} />
        </button>
        <div className="webinar-present-dots" aria-hidden>
          {Array.from({ length: dots }).map((_, i) => (
            <span key={i} className={`webinar-present-dot${i === Math.min(index, dots - 1) ? ' is-on' : ''}`} />
          ))}
        </div>
        <span className="webinar-present-count">{index + 1} / {total}</span>
        <button type="button" className="webinar-present-btn" onClick={onNext} disabled={disableNext} title="Suivant">
          <ChevronRight size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!hideOverview && (
          <button type="button" className="webinar-present-btn" onClick={onOverview} title="Vue d’ensemble (O)">
            <Grid3X3 size={15} />
          </button>
        )}
        {!hideNotes && (
          <button type="button" className="webinar-present-btn" onClick={onNotes} style={{ opacity: notesOn ? 1 : 0.7 }} title="Notes (N)">
            <StickyNote size={15} />
          </button>
        )}
        <button type="button" className="webinar-present-btn" onClick={onFullscreen} title="Plein écran (F)">
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  )
}
