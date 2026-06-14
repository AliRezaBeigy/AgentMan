export interface StreamFillField {
  selector: string
  value: string
}

export interface StreamFillObjectEntry {
  key: string
  value: string | boolean
}

const FIELD_OBJECT_RE =
  /\{\s*"selector"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}|\{\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"selector"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g

const FILL_OBJECT_STRING_RE = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g
const FILL_OBJECT_BOOL_RE = /"((?:[^"\\]|\\.)*)"\s*:\s*(true|false)/g

function unescapeJsonString(fragment: string): string {
  try {
    return JSON.parse(`"${fragment}"`)
  } catch {
    return fragment.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
}

export function looksLikeFillFieldsStream(content: string): boolean {
  return (
    /"action"\s*:\s*"fill_fields"/.test(content) ||
    /"action"\s*:\s*"fill"/.test(content) ||
    /"fields"\s*:\s*\[/.test(content) ||
    /"selector"\s*:\s*"[^"]+"\s*,\s*"value"\s*:\s*"/.test(content)
  )
}

/** Pull a complete single fill action from partial JSON stream. */
export function extractCompleteFillFromStream(
  content: string,
  alreadyFilled: ReadonlyMap<string, string> = new Map()
): StreamFillField | null {
  const batch = extractCompleteFillFieldsFromStream(content, alreadyFilled)
  if (batch.length) return batch[0] ?? null

  const actionMatch = content.match(
    /"action"\s*:\s*"fill"[\s\S]*?"selector"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"/
  )
  if (actionMatch) {
    const selector = unescapeJsonString(actionMatch[1] ?? "")
    const value = unescapeJsonString(actionMatch[2] ?? "")
    if (selector && alreadyFilled.get(selector) !== value) {
      return { selector, value }
    }
  }

  return null
}

/** Pull complete {selector,value} pairs from a partial fill_fields JSON stream. */
export function extractCompleteFillFieldsFromStream(
  content: string,
  alreadyFilled: ReadonlyMap<string, string> = new Map()
): StreamFillField[] {
  if (!looksLikeFillFieldsStream(content)) {
    return []
  }

  const found: StreamFillField[] = []
  const seen = new Set<string>()

  for (const match of content.matchAll(FIELD_OBJECT_RE)) {
    const selector = unescapeJsonString(match[1] ?? match[4] ?? "")
    const value = unescapeJsonString(match[2] ?? match[3] ?? "")
    if (!selector) continue

    const dedupeKey = `${selector}\0${value}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const previousValue = alreadyFilled.get(selector)
    if (previousValue === value) continue

    found.push({ selector, value })
  }

  return found
}

/** Pull complete flat key/value pairs from a partial fill-mode JSON object stream. */
export function extractCompleteFillObjectEntriesFromStream(
  content: string,
  alreadyApplied: ReadonlySet<string> = new Set(),
  allowedKeys?: ReadonlySet<string>
): StreamFillObjectEntry[] {
  if (!/\{/.test(content)) return []

  const found: StreamFillObjectEntry[] = []
  const seen = new Set<string>()

  for (const match of content.matchAll(FILL_OBJECT_STRING_RE)) {
    const key = unescapeJsonString(match[1] ?? "")
    const value = unescapeJsonString(match[2] ?? "")
    if (!key || seen.has(key) || alreadyApplied.has(key)) continue
    if (allowedKeys && !allowedKeys.has(key)) continue
    seen.add(key)
    found.push({ key, value })
  }

  for (const match of content.matchAll(FILL_OBJECT_BOOL_RE)) {
    const key = unescapeJsonString(match[1] ?? "")
    if (!key || seen.has(key) || alreadyApplied.has(key)) continue
    if (allowedKeys && !allowedKeys.has(key)) continue
    seen.add(key)
    found.push({ key, value: match[2] === "true" })
  }

  return found
}

export function filterFieldsNotYetFilled<T extends { selector: string; value: string }>(
  fields: T[],
  alreadyFilled: ReadonlyMap<string, string>
): T[] {
  return fields.filter((field) => alreadyFilled.get(field.selector) !== field.value)
}
