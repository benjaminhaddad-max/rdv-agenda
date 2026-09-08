'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { htmlDeckNav } from '@/lib/webinar-deck-enhance'

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
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [showUi, setShowUi] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const idleRef = useRef<number | null>(null)

  const bumpUi = useCallback(() => {
    setShowUi(true)
    if (idleRef.current) window.clearTimeout(idleRef.current)
    idleRef.current = window.setTimeout(() => setShowUi(false), 2200)
  }, [])

  const focusDeck = useCallback(() => {
    try { iframeRef.current?.focus() } catch { /* ignore */ }
    try { iframeRef.current?.contentWindow?.focus() } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    bumpUi()
    const id = window.setTimeout(focusDeck, 400)
    return () => {
      window.clearTimeout(id)
      if (idleRef.current) window.clearTimeout(idleRef.current)
    }
  }, [bumpUi, focusDeck])

  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement)
      window.setTimeout(focusDeck, 50)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [focusDeck])

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) void el.requestFullscreen?.()?.catch(() => {})
      else void document.exitFullscreen?.()?.catch(() => {})
    } catch {
      /* plein écran parfois refusé */
    }
    window.setTimeout(focusDeck, 80)
  }, [focusDeck])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      bumpUi()
      const iframe = iframeRef.current
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
        return
      }
      if (!iframe) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        htmlDeckNav(iframe, 1)
        focusDeck()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') {
        e.preventDefault()
        htmlDeckNav(iframe, -1)
        focusDeck()
      } else if (e.key === 'Home') {
        e.preventDefault()
        try {
          const stage = iframe.contentDocument?.querySelector('deck-stage') as { goTo?: (i: number) => void } | null
          stage?.goTo?.(0)
        } catch { /* ignore */ }
        focusDeck()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bumpUi, toggleFullscreen, focusDeck])

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
      onClick={focusDeck}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: '#0d2238',
      }}
    >
      <iframe
        ref={iframeRef}
        src={presentSrc(src)}
        title={title}
        allow="fullscreen"
        allowFullScreen
        tabIndex={0}
        onLoad={focusDeck}
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
        <a href={backHref} style={chip} onClick={e => e.stopPropagation()}>
          ← Quitter
        </a>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            toggleFullscreen()
          }}
          style={chip}
        >
          {fullscreen ? 'Quitter le plein écran' : 'Plein écran (F)'}
        </button>
      </div>
    </div>
  )
}
