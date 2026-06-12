export interface StreamFillField {
  selector: string
  value: string
}

const FIELD_OBJECT_RE =
  /\{\s*"selector"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}|\{\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"selector"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g

function unescapeJsonString(fragment: string): string {
  try {
    return JSON.parse(`"${fragment}"`)
  } catch {
    return fragment.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
}

/** Pull complete {selector,value} pairs from a partial fill_fields JSON stream. */
export function extractCompleteFillFieldsFromStream(
  content: string,
  alreadyFilled: ReadonlyMap<string, string> = new Map()
): StreamFillField[] {
  if (!/"action"\s*:\s*"fill_fields"/.test(content) && !/"fields"\s*:\s*\[/.test(content)) {
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

export function filterFieldsNotYetFilled<T extends { selector: string; value: string }>(
  fields: T[],
  alreadyFilled: ReadonlyMap<string, string>
): T[] {
  return fields.filter((field) => alreadyFilled.get(field.selector) !== field.value)
}
