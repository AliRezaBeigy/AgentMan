import { getSectionFillableFields } from "~/lib/fill-selector-resolve"
import type { AddEntrySavedEntry, FormFieldDescriptor, PageContext } from "~/lib/types"

export interface FillFieldRef {
  selector: string
  value?: string
}

const KEY_FIELD_LABELS =
  /title|position|employer|company|organization|university|college|education name|degree|school/i

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function extractFillEntryMatchTokens(
  filled: FillFieldRef[],
  pageContext: PageContext,
  sectionLabel: string
): string[] {
  const sectionFields = getSectionFillableFields(pageContext, sectionLabel)
  const fieldBySelector = new Map(sectionFields.map((field) => [field.selector, field]))
  const tokens: string[] = []

  for (const item of filled) {
    const value = item.value?.trim()
    if (!value || value.length < 2) continue

    const field = fieldBySelector.get(item.selector)
    const labelPart = field?.label?.split(" - ").slice(1).join(" - ") ?? field?.label ?? ""
    if (!KEY_FIELD_LABELS.test(labelPart) && !KEY_FIELD_LABELS.test(field?.name ?? "")) continue

    const token = normalizeToken(value)
    if (token && !tokens.includes(token)) tokens.push(token)
  }

  return tokens
}

export function savedEntryMatchesFillTokens(
  entry: AddEntrySavedEntry,
  tokens: string[]
): boolean {
  if (tokens.length === 0) return false
  const summary = normalizeToken(entry.summary)
  const hits = tokens.filter((token) => token.length >= 3 && summary.includes(token))
  if (tokens.length === 1) return hits.length === 1
  return hits.length >= 2
}

export function findDuplicateSavedEntry(
  filled: FillFieldRef[],
  pageContext: PageContext,
  sectionLabel: string,
  savedEntries: AddEntrySavedEntry[] = []
): AddEntrySavedEntry | null {
  const tokens = extractFillEntryMatchTokens(filled, pageContext, sectionLabel)
  if (!tokens.length) return null

  for (const entry of savedEntries) {
    if (savedEntryMatchesFillTokens(entry, tokens)) return entry
  }
  return null
}

export function buildDuplicateEntryMessage(
  sectionLabel: string,
  duplicate: AddEntrySavedEntry
): string {
  const preview =
    duplicate.summary.length > 90 ? `${duplicate.summary.slice(0, 90)}…` : duplicate.summary
  return `Duplicate ${sectionLabel} entry — "${preview}" is already saved. Call done if all attachment items are saved, or fill_fields with the NEXT unsaved item only.`
}
