/** Mode présentation d’un deck Cloud Design same-origin : rail masqué, plein écran. */

const SHADOW_STYLE_ID = 'wp-deck-motion-shadow'
const LIGHT_STYLE_ID = 'wp-deck-motion-light'

const SHADOW_CSS = `
  .overlay, .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
  .stage { left: 0 !important; }
  :host { background: #0d2238 !important; }
  .canvas { box-shadow: none !important; border-radius: 0 !important; }
`

const LIGHT_CSS = `
  html, body { background: #0d2238 !important; }
`

type DeckStageEl = HTMLElement & {
  next?: () => void
  prev?: () => void
  goTo?: (i: number) => void
  _advance?: (dir: number, reason?: string) => void
  _presenting?: boolean
  _syncRailHidden?: () => void
  _fit?: () => void
}

function stageEl(doc: Document): DeckStageEl | null {
  return doc.querySelector('deck-stage')
}

function injectStyle(root: ParentNode, id: string, css: string) {
  try {
    if (root.querySelector(`#${id}`)) return
    const isDocument = (root as Node).nodeType === 9
    const doc = isDocument ? root as Document : (root as ShadowRoot).ownerDocument
    if (!doc?.createElement) return
    const style = doc.createElement('style')
    style.id = id
    style.textContent = css
    if (isDocument) {
      const htmlDoc = root as Document
      ;(htmlDoc.head || htmlDoc.documentElement).appendChild(style)
    } else {
      root.appendChild(style)
    }
  } catch {
    /* iframe / shadow parfois inaccessibles */
  }
}

export function htmlDeckNav(iframe: HTMLIFrameElement, delta: number) {
  try {
    const doc = iframe.contentDocument
    if (!doc) return
    const stage = stageEl(doc)
    if (!stage) return
    if (delta > 0) {
      if (typeof stage.next === 'function') stage.next()
      else stage._advance?.(1, 'keyboard')
    } else if (typeof stage.prev === 'function') {
      stage.prev()
    } else {
      stage._advance?.(-1, 'keyboard')
    }
  } catch {
    /* iframe pas encore prêt */
  }
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

function enterPresenting(stage: DeckStageEl, win: Window) {
  try { stage.setAttribute('no-rail', '') } catch { /* ignore */ }
  try { stage._presenting = true } catch { /* ignore */ }
  try { stage._syncRailHidden?.() } catch { /* ignore */ }
  try { stage._fit?.() } catch { /* ignore */ }
  try { win.postMessage({ __omelette_presenting: true }, '*') } catch { /* ignore */ }
}

export function enhanceHtmlDeck(iframe: HTMLIFrameElement): () => void {
  let cancelled = false
  let tries = 0
  let observer: MutationObserver | null = null
  let lastIndex = 0
  let wired = false

  const tick = () => {
    if (cancelled || wired) return
    try {
      const doc = iframe.contentDocument
      const win = iframe.contentWindow
      if (!doc || !win || !doc.body) {
        if (tries++ < 80) window.setTimeout(tick, 80)
        return
      }

      injectStyle(doc, LIGHT_STYLE_ID, LIGHT_CSS)
      bindExitKeys(win)

      const stage = stageEl(doc)
      const shadow = stage?.shadowRoot
      if (!stage || !shadow) {
        void win.customElements?.whenDefined('deck-stage').then(() => { if (!cancelled) tick() }).catch(() => {})
        if (tries++ < 80) window.setTimeout(tick, 80)
        return
      }

      wired = true
      injectStyle(shadow, SHADOW_STYLE_ID, SHADOW_CSS)
      enterPresenting(stage, win)
      try { iframe.focus() } catch { /* ignore */ }

      const syncDir = (force = false) => {
        const slides = Array.from(doc.querySelectorAll('section[data-screen-label], deck-stage > section, x-import > section'))
        const found = slides.findIndex(s => s.hasAttribute('data-deck-active'))
        const idx = found < 0 ? lastIndex : found
        if (force || idx !== lastIndex) {
          try {
            win.parent.postMessage({
              slideIndexChanged: idx,
              deckTotal: slides.length,
            }, '*')
          } catch { /* ignore */ }
          lastIndex = idx
        }
      }

      observer = new MutationObserver(() => syncDir())
      observer.observe(stage, { attributes: true, subtree: true, attributeFilter: ['data-deck-active'] })
      syncDir(true)
    } catch {
      if (tries++ < 80) window.setTimeout(tick, 80)
    }
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
