export async function fetchWithTimeout(
  requestUrl: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const timeoutMessage = `fetch timeout after ${timeoutMs}ms`
  const timeoutController = new AbortController()
  const upstreamSignal = init.signal

  if (upstreamSignal?.aborted) {
    throw upstreamSignal.reason instanceof Error
      ? upstreamSignal.reason
      : new Error('fetch aborted')
  }

  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const onUpstreamAbort = () => {
    timeoutController.abort(upstreamSignal?.reason ?? new Error('fetch aborted'))
  }

  upstreamSignal?.addEventListener('abort', onUpstreamAbort, { once: true })
  timeoutId = setTimeout(() => {
    timedOut = true
    timeoutController.abort(new Error(timeoutMessage))
  }, timeoutMs)

  try {
    return await fetch(requestUrl, {
      ...init,
      signal: timeoutController.signal,
    })
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    upstreamSignal?.removeEventListener('abort', onUpstreamAbort)
  }
}
