const IS_DEV = process.env.NODE_ENV === "development"

export function isDevBuild(): boolean {
  return IS_DEV
}

export function devLog(label: string, data?: unknown): void {
  if (!IS_DEV) return
  if (data === undefined) {
    console.log(`[AgentMan:dev] ${label}`)
    return
  }
  console.log(`[AgentMan:dev] ${label}`, data)
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}… (${value.length} chars)`
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }
  if (typeof value !== "object") return value

  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, val] of Object.entries(obj)) {
    if (key === "images" && Array.isArray(val)) {
      out[key] = val.map((img, i) => {
        const len = typeof img === "string" ? img.length : 0
        return `[image ${i + 1}: ${len} chars]`
      })
    } else {
      out[key] = sanitizeValue(val)
    }
  }

  return out
}

export function devLogRequest(
  scope: string,
  method: string,
  url: string,
  body?: unknown
): void {
  if (!IS_DEV) return
  devLog(`${scope} → ${method} ${url}`, body !== undefined ? sanitizeValue(body) : undefined)
}

export function devLogResponse(scope: string, status: number, data: unknown): void {
  if (!IS_DEV) return
  devLog(`${scope} ← ${status}`, sanitizeValue(data))
}

export function devLogError(label: string, error: unknown, extra?: unknown): void {
  if (!IS_DEV) return
  if (extra !== undefined) {
    console.error(`[AgentMan:dev] ${label}`, error, extra)
    return
  }
  console.error(`[AgentMan:dev] ${label}`, error)
}
