import { normalizeFillResponse } from "~/lib/fill-rows"
import { expandCompositeFieldValues } from "~/lib/fill-values"
import type { FormFieldDescriptor, RepeatableSectionDescriptor } from "~/lib/types"

export interface FillMapping {
  selector: string
  value: string | boolean
}

export function getFillableFields(fields: FormFieldDescriptor[]): FormFieldDescriptor[] {
  return fields.filter((f) => !f.isFileInput)
}

export function fieldFillKey(field: FormFieldDescriptor, index: number): string {
  return field.label?.trim() || field.name?.trim() || field.placeholder?.trim() || `field_${index + 1}`
}

export function getMissingFillKeys(
  fillable: FormFieldDescriptor[],
  accumulated: Map<string, FillMapping>
): string[] {
  return fillable
    .map((f, i) => ({ field: f, index: i }))
    .filter(({ field }) => !accumulated.has(field.selector))
    .map(({ field, index }) => fieldFillKey(field, index))
}

export interface FillInstructionOptions {
  pageContextNote?: string
}

export function buildFillInstruction(
  fields: FormFieldDescriptor[],
  repeatableSections: RepeatableSectionDescriptor[] = [],
  options: FillInstructionOptions = {}
): string {
  const { pageContextNote = "" } = options
  const fillable = getFillableFields(fields)
  const template: Record<string, string> = {}
  const hints: Record<string, Record<string, unknown>> = {}

  fillable.forEach((f, i) => {
    const key = fieldFillKey(f, i)
    template[key] = "<value>"

    const hint: Record<string, unknown> = {
      type: f.type,
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
      ...(f.name ? { name: f.name } : {})
    }

    if ((f.type === "select" || f.type === "button-group") && f.options?.length) {
      hint.options = f.options.map((o) => o.label || o.value)
      hint.rule = "Must be exactly one of the listed options — do not invent values"
    }

    hints[key] = hint
  })

  const repeatableNote =
    repeatableSections.length > 0
      ? `\nRepeatable sections on this page (the page may have several different "Add …" buttons):\n${repeatableSections
          .map((s) => `- "${s.addButtonLabel}" — ${s.rowCount} row(s) visible now`)
          .join("\n")}\n`
      : ""

  const hasRowFields = Object.keys(template).some((k) => k.startsWith("Row "))
  const rowColumns = [
    ...new Set(
      fillable
        .map((f) => f.label?.match(/^Row \d+ - (.+)$/)?.[1])
        .filter((c): c is string => !!c)
    )
  ]
  const lineItemExample =
    rowColumns.length > 0
      ? `  "line_items": [\n    {${rowColumns.map((c) => `"${c}": "..."`).join(", ")}}\n  ]`
      : ""

  const rowNote = hasRowFields
    ? `- Repeating rows use keys like "Row 1 - Date", "Row 2 - Description", etc.\n- YOU decide how many rows are needed from the user request (e.g. "eight receipt items" → Row 1 through Row 8, or a line_items array with 8 objects).\n- Extra DOM rows are created ONLY from your Row N keys or line_items length — never use item1, item2, or repeated bare column keys.\n- NEVER repeat bare keys like "Date" or "Description" at the top level — JSON only keeps one value per key.\n- For many rows, prefer line_items:\n${lineItemExample}\n- If multiple repeatable sections exist, only fill the section the user meant (match column names like Date/Description vs Company/Title).\n`
    : ""

  const contextNote = pageContextNote.trim()
    ? `${pageContextNote.trim()}\n\nUse page context and any facts in the user message (e.g. university name, company, person) when choosing values.\n`
    : ""

  return `Generate values for each form field per the user request.
${contextNote}${repeatableNote}
Return ONE JSON object. Property names must match EXACTLY (copy verbatim):
${JSON.stringify(template, null, 2)}

Field details:
${JSON.stringify(hints, null, 2)}

Rules:
- Include every property listed above — no more, no fewer.
- Use the exact property names shown (e.g. "Lead source" not "source"). Never invent alternate key names.
${rowNote}- For fields with an "options" list, pick one option exactly as written.
- Checkboxes: "true" or "false".
- Generate realistic random data when asked.
- JSON only — no markdown, no explanation.`
}

export function parseFillMappings(text: string, fields: FormFieldDescriptor[]): FillMapping[] {
  const parsed = extractJsonValue(text)
  if (!parsed) return []

  if (Array.isArray(parsed) && parsed.every((item) => item && typeof item === "object" && "selector" in (item as object))) {
    return parsed
      .map((item) => normalizeMappingItem(item, fields))
      .filter((item): item is FillMapping => item !== null)
  }

  const normalized = normalizeFillResponse(parsed, fields)
  if (normalized) {
    return mapLabelObjectToMappings(normalized, fields)
  }

  return []
}

export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* not raw JSON */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()

  try {
    return JSON.parse(candidate)
  } catch {
    /* fall through */
  }

  const arrayMatch = candidate.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0])
    } catch {
      /* try object */
    }
  }

  const objectMatch = candidate.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0])
    } catch {
      return null
    }
  }

  return null
}

export function mergeFillObject(target: Record<string, unknown>, parsed: unknown): void {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return
  Object.assign(target, parsed)
}

export function buildMissingFieldHints(
  fillable: FormFieldDescriptor[],
  missingKeys: string[]
): string {
  const lines: string[] = []
  for (const key of missingKeys) {
    const field = fillable.find((f, i) => fieldFillKey(f, i) === key)
    if (field?.options?.length) {
      const opts = field.options.map((o) => o.label || o.value).join(", ")
      lines.push(`- ${key}: pick one of [${opts}] (or close match)`)
    }
  }
  if (!lines.length) return ""
  return `\n\nHints:\n${lines.join("\n")}`
}

function normalizeMappingItem(
  item: unknown,
  fields: FormFieldDescriptor[]
): FillMapping | null {
  if (!item || typeof item !== "object") return null

  const record = item as Record<string, unknown>
  const selector = typeof record.selector === "string" ? record.selector.trim() : ""
  const rawValue = record.value

  if (selector && rawValue !== undefined && rawValue !== null) {
    const field = fields.find((f) => f.selector === selector)
    const value = field ? normalizeFieldValue(field, rawValue) : String(rawValue)
    return value === null ? null : { selector, value }
  }

  const labelKey =
    typeof record.label === "string"
      ? record.label
      : typeof record.name === "string"
        ? record.name
        : ""
  if (labelKey && rawValue !== undefined && rawValue !== null) {
    const field = findFieldForKey(labelKey, fields)
    if (!field) return null
    const value = normalizeFieldValue(field, rawValue)
    return value === null ? null : { selector: field.selector, value }
  }

  return null
}

function mapLabelObjectToMappings(
  obj: Record<string, unknown>,
  fields: FormFieldDescriptor[]
): FillMapping[] {
  const fillable = getFillableFields(fields)
  const bySelector = new Map<string, FillMapping>()
  const usedKeys = new Set<string>()

  const assign = (field: FormFieldDescriptor, key: string, rawValue: unknown) => {
    const value = normalizeFieldValue(field, rawValue)
    if (value === null) return
    bySelector.set(field.selector, { selector: field.selector, value })
    usedKeys.add(key)
  }

  fillable.forEach((field, i) => {
    const key = fieldFillKey(field, i)
    if (key in obj && obj[key] !== null && obj[key] !== undefined) {
      assign(field, key, obj[key])
    }
  })

  for (const [key, rawValue] of Object.entries(obj)) {
    if (usedKeys.has(key) || rawValue === null || rawValue === undefined) continue
    const field = fillable.find(
      (f, i) =>
        !bySelector.has(f.selector) &&
        fieldFillKey(f, i).toLowerCase() === key.trim().toLowerCase()
    )
    if (field) assign(field, key, rawValue)
  }

  for (const [key, rawValue] of Object.entries(obj)) {
    if (usedKeys.has(key) || rawValue === null || rawValue === undefined) continue
    const resolved = resolveFieldForObjectKey(key, fields)
    if (resolved && "field" in resolved && !bySelector.has(resolved.field.selector)) {
      if (!resolved.field.isFileInput) assign(resolved.field, key, rawValue)
    }
  }

  const unfilled = fillable.filter((f) => !bySelector.has(f.selector))
  for (const field of unfilled) {
    let bestKey: string | null = null
    let bestScore = 0
    for (const [key, rawValue] of Object.entries(obj)) {
      if (usedKeys.has(key) || rawValue === null || rawValue === undefined) continue
      const score = scoreFieldKeyMatch(key, field)
      if (score > bestScore) {
        bestScore = score
        bestKey = key
      }
    }
    if (bestKey && bestScore >= 50) {
      assign(field, bestKey, obj[bestKey])
    }
  }

  return Array.from(bySelector.values())
}

function scoreFieldKeyMatch(key: string, field: FormFieldDescriptor): number {
  const k = normalizeFieldKey(key)
  if (!k) return 0

  const label = normalizeFieldKey(field.label || "")
  const name = normalizeFieldKey(field.name || "")
  const id = (field.id || "").toLowerCase()
  const placeholder = normalizeFieldKey(field.placeholder || "")

  if (k === label || k === name || k === id || k === placeholder) return 100
  if (label && (label.includes(k) || k.includes(label))) return 85
  if (name && (name.includes(k) || k.includes(name))) return 80
  if (id && (id.includes(k.replace(/\s/g, "")) || k.replace(/\s/g, "").includes(id))) return 75

  if (field.type === "email" && /e?mail/.test(k)) return 90
  if ((field.type === "tel" || /phone|tel|mobile/.test(label)) && /phone|tel|mobile/.test(k)) return 90
  if (/name|contact/.test(k) && /name|contact/.test(label)) return 85
  if (/company|organization|org/.test(k) && /company|organization|org/.test(label)) return 85
  if (/title|job|role|position/.test(k) && /title|job|role|position/.test(label)) return 85
  if (/note|comment|message|description/.test(k) && /note|comment|message|description/.test(label)) return 85
  if (/source|referral|how|lead/.test(k) && /source|referral|how|lead/.test(label)) return 85
  if (/priority|urgent/.test(k) && /priority|urgent/.test(label)) return 85
  if (/country|nation/.test(k) && /country|nation/.test(label)) return 85
  if (/zip|postal|postcode/.test(k) && /zip|postal|postcode/.test(label)) return 85
  if (/city|town/.test(k) && /city|town/.test(label)) return 85
  if (/state|province|region/.test(k) && /state|province|region/.test(label)) return 85
  if (/address|street/.test(k) && /address|street/.test(label)) return 85
  if (/website|url|site/.test(k) && /website|url|site/.test(label)) return 85

  return 0
}

function normalizeFieldKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function resolveFieldForObjectKey(
  key: string,
  fields: FormFieldDescriptor[]
): { field: FormFieldDescriptor } | { selector: string } | null {
  const trimmed = key.trim()

  const exactSelector = fields.find((f) => f.selector === trimmed)
  if (exactSelector) return { field: exactSelector }

  const idFromSelector = trimmed.match(/^#([\w-]+)$/)?.[1]
  if (idFromSelector) {
    const field = fields.find((f) => f.id === idFromSelector)
    if (field) return { field }
  }

  const nameFromSelector =
    trimmed.match(/\[name=['"]([^'"]+)['"]\]/i)?.[1] ??
    trimmed.match(/^(?:input|textarea|select)\[name=([^\]]+)\]$/i)?.[1]

  if (nameFromSelector) {
    const field =
      fields.find((f) => f.name === nameFromSelector) ??
      fields.find((f) => f.name?.toLowerCase() === nameFromSelector.toLowerCase()) ??
      fields.find((f) => f.id?.toLowerCase().includes(nameFromSelector.toLowerCase())) ??
      fields.find((f) => f.selector.toLowerCase().includes(nameFromSelector.toLowerCase()))
    if (field) return { field }
  }

  if (!looksLikeSelector(trimmed)) {
    const field = findFieldByLabelOrName(trimmed, fields)
    if (field) return { field }
  }

  if (looksLikeSelector(trimmed)) {
    return { selector: trimmed }
  }

  return null
}

function looksLikeSelector(key: string): boolean {
  return (
    /^[#.]/.test(key) ||
    /^(input|textarea|select|button)\b/i.test(key) ||
    key.includes("[") ||
    key.includes(":")
  )
}

function findFieldByLabelOrName(
  key: string,
  fields: FormFieldDescriptor[]
): FormFieldDescriptor | undefined {
  const normalized = key.trim().toLowerCase()
  return (
    fields.find((f) => f.label?.trim().toLowerCase() === normalized) ??
    fields.find((f) => f.name?.trim().toLowerCase() === normalized) ??
    fields.find((f) => f.placeholder?.trim().toLowerCase() === normalized) ??
    fields.find((f) => f.id?.trim().toLowerCase() === normalized)
  )
}

function findFieldForKey(key: string, fields: FormFieldDescriptor[]): FormFieldDescriptor | undefined {
  const resolved = resolveFieldForObjectKey(key, fields)
  return resolved && "field" in resolved ? resolved.field : findFieldByLabelOrName(key, fields)
}

function normalizeFieldValue(
  field: FormFieldDescriptor,
  value: unknown
): string | boolean | null {
  if (value === null || value === undefined) return null
  if (field.isFileInput) return null

  if (field.type === "checkbox") {
    return value === true || value === "true"
  }

  let str = String(value).trim()
  if (field.type === "number") {
    str = str.replace(/^\$/, "").replace(/,/g, "").trim()
  }

  if (field.type === "select" || field.type === "button-group") {
    if (field.options?.length) {
      const byValue = field.options.find((o) => o.value === str)
      if (byValue) return field.type === "button-group" ? byValue.label : byValue.value

      const lower = str.toLowerCase()
      const byLabel = field.options.find(
        (o) => o.label.toLowerCase() === lower || o.value.toLowerCase() === lower
      )
      if (byLabel) return field.type === "button-group" ? byLabel.label : byLabel.value

      const fuzzy = field.options.find(
        (o) =>
          o.label.toLowerCase().includes(lower) || lower.includes(o.label.toLowerCase())
      )
      if (fuzzy) return field.type === "button-group" ? fuzzy.label : fuzzy.value
    }

    if (field.widget === "combobox" || field.type === "button-group") {
      return str
    }

    if (field.options?.length) return null
  }

  return str
}
