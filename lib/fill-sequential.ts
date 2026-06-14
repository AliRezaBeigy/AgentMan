import { parseFillFieldsArg } from "~/lib/tool-args"

export interface FillFieldItem {
  selector: string
  value: string
}

export interface SequentialFillResult {
  selector: string
  ok: boolean
  error?: string
}

export interface SequentialFillProgress {
  index: number
  total: number
  selector: string
}

/** Read a single {selector,value} from native fill tool arguments. */
export function extractSingleFillFromToolArguments(args: unknown): FillFieldItem | null {
  if (typeof args === "string") {
    const fields = parseFillFieldsArg(args)
    return fields[0] ?? null
  }
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const record = args as Record<string, unknown>
    if ("fields" in record) {
      return parseFillFieldsArg(record.fields)[0] ?? null
    }
    const selector = String(record.selector ?? "").trim()
    const value = String(record.value ?? "")
    if (selector && value) return { selector, value }
  }
  return null
}

/** Read {selector,value} pairs from native tool arguments (object or partial JSON string). */
export function extractFillFieldsFromToolArguments(
  args: unknown,
  alreadyFilled: ReadonlyMap<string, string> = new Map()
): FillFieldItem[] {
  let fields: FillFieldItem[] = []
  if (typeof args === "string") {
    fields = parseFillFieldsArg(args)
  } else if (args && typeof args === "object" && !Array.isArray(args) && "fields" in args) {
    fields = parseFillFieldsArg((args as { fields: unknown }).fields)
  }
  return fields.filter((field) => alreadyFilled.get(field.selector) !== field.value)
}

export function markFieldFilled(
  filled: Map<string, string>,
  sourceSelector: string,
  resolvedSelector: string,
  value: string
): void {
  filled.set(sourceSelector, value)
  if (resolvedSelector !== sourceSelector) {
    filled.set(resolvedSelector, value)
  }
}

export function filterFieldsNotYetFilledByKey<T extends FillFieldItem>(
  fields: T[],
  alreadyFilled: ReadonlyMap<string, string>
): T[] {
  return fields.filter((field) => alreadyFilled.get(field.selector) !== field.value)
}
