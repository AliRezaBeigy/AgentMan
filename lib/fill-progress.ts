import type { FormFieldDescriptor } from "~/lib/types"
import {
  buildMissingRequiredMessage,
  isEmptyFieldValue
} from "~/lib/required-field-detect"

/** Seed a per-turn filled map from persisted partial fills (includes alias keys). */
export function seedFilledSelectorMap(
  partialFills: ReadonlyMap<string, string>,
  aliasToSelector?: ReadonlyMap<string, string>
): Map<string, string> {
  const map = new Map<string, string>()
  for (const [selector, value] of partialFills) {
    map.set(selector, value)
    if (aliasToSelector) {
      for (const [alias, resolved] of aliasToSelector) {
        if (resolved === selector) map.set(alias, value)
      }
    }
  }
  return map
}

export function selectorToFillAlias(
  selector: string,
  aliasToSelector: ReadonlyMap<string, string>
): string | undefined {
  for (const [alias, resolved] of aliasToSelector) {
    if (resolved === selector) return alias
  }
  return undefined
}

export function isFieldAlreadyFilled(
  sourceSelector: string,
  resolvedSelector: string,
  value: string,
  filled: ReadonlyMap<string, string>
): boolean {
  return (
    filled.get(resolvedSelector) === value ||
    filled.get(sourceSelector) === value
  )
}

export interface NextFillTarget {
  alias: string
  label: string
}

function resolvePartialFillValue(
  field: FormFieldDescriptor,
  partialFills: ReadonlyMap<string, string>,
  aliasToSelector?: ReadonlyMap<string, string>
): string | undefined {
  if (partialFills.has(field.selector)) return partialFills.get(field.selector)
  if (aliasToSelector) {
    for (const [alias, resolved] of aliasToSelector) {
      if (resolved === field.selector && partialFills.has(alias)) {
        return partialFills.get(alias)
      }
    }
  }
  return undefined
}

/** Required fields not yet filled in this add-entry session (ignores stale DOM values). */
export function getSessionMissingRequiredFields(
  sectionFields: FormFieldDescriptor[],
  partialFills: ReadonlyMap<string, string>,
  aliasToSelector?: ReadonlyMap<string, string>
): FormFieldDescriptor[] {
  return sectionFields.filter((field) => {
    if (!field.required) return false
    const value = resolvePartialFillValue(field, partialFills, aliasToSelector)
    if (value === undefined) return true
    return isEmptyFieldValue(field, value)
  })
}

/** First required field in the section that is not filled yet. */
export function getNextRequiredFillTarget(
  sectionFields: FormFieldDescriptor[],
  partialFills: ReadonlyMap<string, string>,
  aliasToSelector?: ReadonlyMap<string, string>
): NextFillTarget | null {
  const missing = getSessionMissingRequiredFields(
    sectionFields,
    partialFills,
    aliasToSelector
  )
  const next = missing[0]
  if (!next) return null

  const alias =
    (aliasToSelector ? selectorToFillAlias(next.selector, aliasToSelector) : undefined) ??
    next.selector
  return { alias, label: next.label ?? alias }
}

export function buildRepeatFillMessage(
  filledAlias: string,
  next: NextFillTarget | null
): string {
  if (next && next.alias !== filledAlias) {
    return `"${filledAlias}" is already filled. Call fill with selector "${next.alias}" next (${next.label}).`
  }
  if (next) {
    return `"${filledAlias}" is already filled. Continue with the remaining required fields.`
  }
  return `"${filledAlias}" is already filled. All required fields have values — wait for auto-save or call done.`
}

export function buildFillContinuationMessage(
  partialCount: number,
  missing: FormFieldDescriptor[],
  next: NextFillTarget | null,
  aliasToSelector?: ReadonlyMap<string, string>
): string {
  const missingMsg = buildMissingRequiredMessage(missing)
  if (next) {
    const lines = [
      `Filled ${partialCount} field(s) so far.`,
      missingMsg,
      `Next: call fill with selector "${next.alias}".`
    ]
    return lines.join("\n")
  }
  if (missing.length) return missingMsg
  if (partialCount > 0 && aliasToSelector) {
    return `Filled ${partialCount} field(s) so far.`
  }
  return ""
}
