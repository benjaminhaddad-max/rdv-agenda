/** Injecte transitions + mode présentation dans un deck Cloud Design same-origin. */

const SHADOW_STYLE_ID = 'wp-deck-motion-shadow'
const LIGHT_STYLE_ID = 'wp-deck-motion-light'

const SHADOW_CSS = `
  .overlay { display: none !important; }
  .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
  :host {
    background: #07131f !important;
  }
  .canvas {
    border-radius: 6px;
    overflow: hidden;
    box-shadow:
      0 0 0 1px rgba(211, 171, 103, 0.22),
      0 28px 80px rgba(0, 0, 0, 0.48) !important;
  }
  @media (prefers-reduced-motion: no-preference) {
    ::slotted(*) {
      visibility: visible !important;
      opacity: 0;
      pointer-events: none;
      transform: translate3d(var(--wp-out-x, 36px), 10px, 0) scale(0.975);
      filter: blur(14px);
      transition:
        opacity 0.55s cubic-bezier(.22, 1, .36, 1),
        transform 0.8s cubic-bezier(.16, 1, .3, 1),
        filter 0.5s ease;
      z-index: 0;
    }
    ::slotted([data-deck-active]) {
      opacity: 1;
      pointer-events: auto;
      transform: none;
      filter: none;
      z-index: 2;
    }
  }
`

const LIGHT_CSS = `
  html, body {
    background: #07131f !important;
  }
  @media (prefers-reduced-motion: no-preference) {
    html[data-wp-dir="fwd"] section[data-deck-active] {
      animation: wp-in-fwd 0.78s cubic-bezier(.16, 1, .3, 1) both;
    }
    html[data-wp-dir="back"] section[data-deck-active] {
      animation: wp-in-back 0.78s cubic-bezier(.16, 1, .3, 1) both;
    }
  }
  @keyframes wp-in-fwd {
    0% {
      clip-path: inset(0 18% 0 0);
      filter: saturate(0.7);
    }
    100% {
      clip-path: inset(0 0 0 0);
      filter: none;
    }
  }
  @keyframes wp-in-back {
    0% {
      clip-path: inset(0 0 0 18%);
      filter: saturate(0.7);
    }
    100% {
      clip-path: inset(0 0 0 0);
      filter: none;
    }
  }
`

function stageEl(doc: Document): (HTMLElement & { next?: () => void; prev?: () => void }) | null {
  return doc.querySelector('deck-stage')
}

function injectStyle(root: Document | ShadowRoot, id: string, css: string) {
  if (root.querySelector(`#${id}`)) return
  const doc = root instanceof Document ? root : root.ownerDocument
  const style = doc.createElement('style')
  style.id = id
  style.textContent = css
  if (root instanceof Document) (root.head || root.documentElement).appendChild(style)
  else root.appendChild(style)
}

export function htmlDeckNav(iframe: HTMLIFrameElement, delta: number) {
  const doc = iframe.contentDocument
  if (!doc) return
  const stage = stageEl(doc)
  if (delta > 0) stage?.next?.()
  else stage?.prev?.()
}

function bindExitKeys(win: Window) {
  if ((win as Window & { __wpKeys?: boolean }).__wpKeys) return
  ;(win as Window & { __wpKeys?: boolean }).__wpKeys = true
  win.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      win.parent.postMessage({ webinarPresent: 'exit' }, '*')
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      win.parent.postMessage({ webinarPresent: 'fullscreen' }, '*')
    }
  }, true)
}

export function enhanceHtmlDeck(iframe: HTMLIFrameElement): () => void {
  let cancelled = false
  let tries = 0
  let observer: MutationObserver | null = null
  let lastIndex = 0
  let wired = false

  const tick = () => {
    if (cancelled || wired) return
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win || !doc.body) {
      if (tries++ < 80) window.setTimeout(tick, 80)
      return
    }

    doc.documentElement.setAttribute('data-wp-dir', 'fwd')
    injectStyle(doc, LIGHT_STYLE_ID, LIGHT_CSS)
    bindExitKeys(win)

    const stage = stageEl(doc)
    const shadow = stage?.shadowRoot
    if (!stage || !shadow) {
      void win.customElements?.whenDefined('deck-stage').then(() => { if (!cancelled) tick() })
      if (tries++ < 80) window.setTimeout(tick, 80)
      return
    }

    wired = true
    injectStyle(shadow, SHADOW_STYLE_ID, SHADOW_CSS)
    win.postMessage({ __omelette_presenting: true }, '*')
    try { iframe.focus() } catch { /* ignore */ }

    const syncDir = (force = false) => {
      const slides = Array.from(doc.querySelectorAll('section[data-screen-label], deck-stage > section, x-import > section'))
      const found = slides.findIndex(s => s.hasAttribute('data-deck-active'))
      const idx = found < 0 ? lastIndex : found
      const dir = idx >= lastIndex ? 'fwd' : 'back'
      doc.documentElement.setAttribute('data-wp-dir', dir)
      stage.style.setProperty('--wp-out-x', dir === 'fwd' ? '-42px' : '42px')
      if (force || idx !== lastIndex) {
        win.parent.postMessage({
          slideIndexChanged: idx,
          deckTotal: slides.length,
        }, '*')
        lastIndex = idx
      }
    }

    observer = new MutationObserver(() => syncDir())
    observer.observe(stage, { attributes: true, subtree: true, attributeFilter: ['data-deck-active'] })
    syncDir(true)
  }

  tick()
  iframe.addEventListener('load', () => {
    wired = false
    tries = 0
    observer?.disconnect()
    observer = null
    tick()
  })

  return () => {
    cancelled = true
    observer?.disconnect()
  }
}
