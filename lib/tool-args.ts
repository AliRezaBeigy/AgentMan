export interface ToolFieldMapping {
  selector: string
  value: string
}

/** Ollama models sometimes return tool arguments as JSON strings. */
export function normalizeToolArguments(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args)
      return normalizeToolArguments(parsed)
    } catch {
      return {}
    }
  }

  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }

  return {}
}

export function parseFillFieldsArg(value: unknown): ToolFieldMapping[] {
  if (Array.isArray(value)) {
    return mappingsFromArray(value)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []

    const fromJson = tryParseFieldsJson(trimmed)
    if (fromJson.length) return fromJson

    return extractLooseFieldMappings(trimmed)
  }

  return []
}

function tryParseFieldsJson(text: string): ToolFieldMapping[] {
  const candidates = [text, repairModelJson(text)]

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return mappingsFromArray(parsed)
      if (typeof parsed === "string") {
        const nested = tryParseFieldsJson(parsed)
        if (nested.length) return nested
      }
    } catch {
      /* try next */
    }
  }

  return []
}

function repairModelJson(text: string): string {
  return text
    .replace(/value\\":\\"/g, 'value":"')
    .replace(/",\s*"value\\":\\"/g, '","value":"')
    .replace(/\\":\\"/g, '":"')
}

function mappingsFromArray(items: unknown[]): ToolFieldMapping[] {
  const out: ToolFieldMapping[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const record = item as { selector?: unknown; value?: unknown }
    const selector = String(record.selector ?? "").trim()
    if (!selector) continue
    out.push({
      selector,
      value: String(record.value ?? "")
    })
  }
  return out
}

function extractLooseFieldMappings(text: string): ToolFieldMapping[] {
  const out: ToolFieldMapping[] = []
  const seen = new Set<string>()

  const push = (selector: string, value: string) => {
    const key = `${selector}\0${value}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ selector, value })
  }

  const chunks = text.split(/data-agentman-field-key=/)
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i]
    const labelMatch = chunk.match(/^\\*"([^"\\]+)\\*"/)
    if (!labelMatch) continue
    const valueMatch = chunk.match(/value\\?"?:\\?"((?:[^"\\]|\\.)*)/)
    if (!valueMatch) continue
    const label = unescapeFragment(labelMatch[1])
    push(buildAgentFieldSelector(label), unescapeFragment(valueMatch[1]))
  }

  const pairRe =
    /"selector"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  for (const match of text.matchAll(pairRe)) {
    push(unescapeFragment(match[1]), unescapeFragment(match[2]))
  }

  const idPairRe = /"selector"\s*:\s*"(#[^"\\]+)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  for (const match of text.matchAll(idPairRe)) {
    push(match[1], unescapeFragment(match[2]))
  }

  return out
}

function buildAgentFieldSelector(label: string): string {
  const escaped = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `[data-agentman-field-key="${escaped}"]`
}

function unescapeFragment(fragment: string): string {
  try {
    return JSON.parse(`"${fragment}"`)
  } catch {
    return fragment.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n")
  }
}
