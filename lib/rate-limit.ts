type Bucket = {
  count: number
  resetAt: number
}

const memoryBuckets = new Map<string, Bucket>()

export function memoryRateLimit(
  key: string,
  options: { windowMs: number; limit: number }
) {
  const now = Date.now()
  const current = memoryBuckets.get(key)

  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return {
      ok: true,
      remaining: options.limit - 1,
      resetAt: now + options.windowMs,
    }
  }

  if (current.count >= options.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: current.resetAt,
    }
  }

  current.count += 1
  memoryBuckets.set(key, current)
  return {
    ok: true,
    remaining: options.limit - current.count,
    resetAt: current.resetAt,
  }
}
