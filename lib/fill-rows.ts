import type { FormFieldDescriptor } from "~/lib/types"
import { expandCompositeFieldValues, getMaxRowIndexFromKeys } from "~/lib/fill-values"

const LINE_ITEM_ARRAY_KEYS = [
  "line_items",
  "items",
  "receipts",
  "receipt_items",
  "rows",
  "entries",
  "expenses"
] as const

export function getRowColumnNames(fields: FormFieldDescriptor[]): string[] {
  const cols = new Set<string>()
  for (const field of fields) {
    const match = field.label?.match(/^Row \d+ - (.+)$/)
    if (match?.[1]) cols.add(match[1])
  }
  return Array.from(cols)
}

export function formUsesRowFields(fields: FormFieldDescriptor[]): boolean {
  return getRowColumnNames(fields).length > 0
}

function matchColumnName(key: string, columnNames: string[]): string | null {
  const normalized = key.trim().toLowerCase()
  for (const col of columnNames) {
    if (col.toLowerCase() === normalized) return col
  }
  return null
}

function rowKeysFromItemList(
  items: unknown[],
  columnNames: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return
    const row = index + 1
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      const col = matchColumnName(key, columnNames)
      if (col && value !== undefined && value !== null) {
        out[`Row ${row} - ${col}`] = value
      }
    }
  })
  return out
}

function expandLineItemArrays(
  obj: Record<string, unknown>,
  columnNames: string[]
): Record<string, unknown> {
  const expanded = { ...obj }

  for (const arrayKey of LINE_ITEM_ARRAY_KEYS) {
    const arr = expanded[arrayKey]
    if (!Array.isArray(arr)) continue

    const rowFields = rowKeysFromItemList(arr, columnNames)
    delete expanded[arrayKey]
    return { ...expanded, ...rowFields }
  }

  return expanded
}

function promoteBareColumnsToRowOne(
  obj: Record<string, unknown>,
  columnNames: string[]
): Record<string, unknown> {
  const expanded = { ...obj }
  let promoted = false

  for (const col of columnNames) {
    if (!(col in expanded)) continue
    const rowKey = `Row 1 - ${col}`
    if (expanded[rowKey] === undefined) {
      expanded[rowKey] = expanded[col]
      promoted = true
    }
    delete expanded[col]
  }

  return promoted ? expanded : obj
}

/** Normalize LLM fill JSON into Row N - Column keys when the form uses repeating rows. */
export function normalizeFillResponse(
  parsed: unknown,
  fields: FormFieldDescriptor[]
): Record<string, unknown> | null {
  const columnNames = getRowColumnNames(fields)
  if (!columnNames.length) {
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return expandCompositeFieldValues(parsed as Record<string, unknown>)
    }
    return null
  }

  if (Array.isArray(parsed)) {
    const rows = rowKeysFromItemList(parsed, columnNames)
    return expandCompositeFieldValues(rows)
  }

  if (!parsed || typeof parsed !== "object") return null

  let obj = expandLineItemArrays(parsed as Record<string, unknown>, columnNames)
  obj = promoteBareColumnsToRowOne(obj, columnNames)
  return expandCompositeFieldValues(obj)
}

export function getMaxRowIndexFromFillData(obj: Record<string, unknown>): number {
  return getMaxRowIndexFromKeys(Object.keys(obj))
}

/** Detect when raw JSON repeats bare column keys (invalid for multi-row data). */
export function detectDuplicateFlatKeysInRaw(raw: string, columnNames: string[]): string[] {
  const duplicated: string[] = []
  for (const col of columnNames) {
    const pattern = new RegExp(`"${col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`, "gi")
    if ((raw.match(pattern) ?? []).length > 1) {
      duplicated.push(col)
    }
  }
  return duplicated
}

export function buildFlatRowKeyRetryMessage(
  duplicatedColumns: string[],
  columnNames: string[],
  userMessage: string
): string {
  const cols = columnNames.join(", ")
  return `Your JSON repeated bare keys (${duplicatedColumns.join(", ")}) — JSON objects only keep ONE value per key, so extra rows were lost.

For multiple receipt/line items, use EITHER:
1) Row-prefixed keys for every row, e.g. "Row 1 - Date", "Row 2 - Date", … "Row 8 - Amount"
OR
2) A line_items array (recommended for many rows):
"line_items": [
  {${columnNames.map((c) => `"${c}": "..."`).join(", ")}},
  …one object per item…
]

Columns for each row: ${cols}.
Never use bare "${duplicatedColumns[0]}" keys when the form expects Row N - Column names.

User request: "${userMessage}"`
}
