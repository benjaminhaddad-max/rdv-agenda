const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isEventId(id: string): boolean {
  return UUID_RE.test(id)
}

/** Extraire le code QR depuis un scan (URL /q/, ?code=, #qr/, ou code brut). */
export function extractQrCode(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const fromQuery = url.searchParams.get('code') || url.searchParams.get('qr')
    if (fromQuery) return fromQuery.trim()
    const qPath = url.pathname.match(/\/q\/([^/]+)/i)
    if (qPath?.[1]) return decodeURIComponent(qPath[1])
  } catch {
    /* pas une URL complète */
  }
  const hashQr = trimmed.match(/#qr\/([^/?#]+)/i)
  if (hashQr?.[1]) return decodeURIComponent(hashQr[1])
  const pathQr = trimmed.match(/\/q\/([^/?#]+)/i)
  if (pathQr?.[1]) return decodeURIComponent(pathQr[1])
  return trimmed
}
