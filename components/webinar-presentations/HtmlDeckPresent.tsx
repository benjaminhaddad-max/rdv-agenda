'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

function presentSrc(src: string) {
  return src.includes('?') ? `${src}&present=1` : `${src}?present=1`
}

export function HtmlDeckPresent({
  src,
  title,
  backHref,
}: {
  src: string
  title: string
  backHref: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
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
    return () => {
      if (idleRef.current) window.clearTimeout(idleRef.current)
    }
  }, [bumpUi])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) void el.requestFullscreen?.()?.catch(() => {})
      else void document.exitFullscreen?.()?.catch(() => {})
    } catch {
      /* plein écran parfois refusé */
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      bumpUi()
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bumpUi, toggleFullscreen])

  const chip: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 999,
    background: 'rgba(13,34,56,0.92)',
    border: '1px solid rgba(211,171,103,0.45)',
    color: '#d3ab67',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
  }

  return (
    <div
      ref={rootRef}
      onMouseMove={bumpUi}
      onTouchStart={bumpUi}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: '#0d2238',
      }}
    >
      <iframe
        src={presentSrc(src)}
        title={title}
        allow="fullscreen"
        allowFullScreen
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#0d2238',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          right: 16,
          zIndex: 2147483647,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          opacity: showUi ? 1 : 0,
          pointerEvents: showUi ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      >
        <a href={backHref} style={chip}>
          ← Quitter
        </a>
        <button type="button" onClick={toggleFullscreen} style={chip}>
          {fullscreen ? 'Quitter le plein écran' : 'Plein écran (F)'}
        </button>
      </div>
    </div>
  )
}
