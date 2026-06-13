import type { AddEntrySectionDescriptor, FormFieldDescriptor, PageContext } from "~/lib/types"

export interface FilledFieldRef {
  selector: string
  value?: string
}

export function sectionLabelFromFieldKey(fieldKey: string): string | null {
  const match = fieldKey.match(/^(.+?) - /)
  return match?.[1]?.trim() ?? null
}

export function findAddEntrySectionForFilledFields(
  filled: FilledFieldRef[],
  pageContext: PageContext
): AddEntrySectionDescriptor | null {
  if (!filled.length) return null

  const sections = pageContext.addEntrySections ?? []
  if (!sections.length) return null

  const fieldBySelector = new Map(
    pageContext.fields.map((field) => [field.selector, field] as const)
  )

  const sectionHits = new Map<string, number>()

  for (const item of filled) {
    const field = fieldBySelector.get(item.selector)
    const label = field?.label ?? selectorToFieldKey(item.selector)
    const sectionLabel = label ? sectionLabelFromFieldKey(label) : null
    if (!sectionLabel) continue
    sectionHits.set(sectionLabel, (sectionHits.get(sectionLabel) ?? 0) + 1)
  }

  let best: { section: AddEntrySectionDescriptor; hits: number } | null = null
  for (const section of sections) {
    const hits = sectionHits.get(section.sectionLabel) ?? 0
    if (!hits) continue
    const threshold = Math.max(2, Math.ceil(section.fieldLabels.length * 0.4))
    if (hits < threshold) continue
    if (!best || hits > best.hits) best = { section, hits }
  }

  return best?.section ?? null
}

function selectorToFieldKey(selector: string): string | null {
  const match = selector.match(/data-agentman-field-key="([^"]+)"/)
  return match?.[1] ?? null
}

export function pickCssSelector(selectorList: string): string {
  return selectorList.split(",")[0]?.trim() ?? selectorList
}

export function buildPostFillValueMap(
  sectionFields: FormFieldDescriptor[],
  filledFields: FilledFieldRef[]
): Map<string, string> {
  const values = new Map<string, string>()
  for (const field of sectionFields) {
    values.set(field.selector, field.value ?? "")
  }
  for (const filled of filledFields) {
    if (filled.value !== undefined) {
      values.set(filled.selector, filled.value)
    }
  }
  return values
}

export function buildFillFieldsSignature(fields: FilledFieldRef[]): string {
  return JSON.stringify(
    fields
      .map((f) => ({ selector: f.selector, value: f.value ?? "" }))
      .sort((a, b) => a.selector.localeCompare(b.selector))
  )
}

export function buildAddEntryAdvanceMessage(
  section: AddEntrySectionDescriptor,
  entryNumber: number
): string {
  return `Saved ${section.sectionLabel} entry #${entryNumber}. Form reopened — if the attachment has more ${section.sectionLabel} items, call fill_fields with the NEXT item now (do not open another section yet). When all ${section.sectionLabel} items are saved, then open the next section.`
}
