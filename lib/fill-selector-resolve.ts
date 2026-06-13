import { resolveAliasSelector } from "~/lib/fill-field-aliases"
import type { FormFieldDescriptor, PageContext } from "~/lib/types"

export function getSectionFillableFields(
  pageContext: PageContext,
  sectionLabel: string
): FormFieldDescriptor[] {
  const prefix = `${sectionLabel} -`
  const fromLabels = pageContext.fields.filter(
    (field) => !field.isFileInput && field.label?.startsWith(prefix)
  )
  if (fromLabels.length > 0) return fromLabels

  const section = pageContext.addEntrySections?.find((s) => s.sectionLabel === sectionLabel)
  if (!section?.fieldLabels?.length) return []

  const allowed = new Set(section.fieldLabels)
  return pageContext.fields.filter(
    (field) => !field.isFileInput && field.label && allowed.has(field.label)
  )
}

function extractFieldKeyFromSelector(selector: string): string | null {
  const match = selector.match(/data-agentman-field-key=["']([^"']+)["']/i)
  return match?.[1] ?? null
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2)
}

function labelMatchScore(selector: string, field: FormFieldDescriptor): number {
  const key = extractFieldKeyFromSelector(selector)
  if (key && field.label === key) return 100

  if (field.id && selector.includes(`#${field.id}`)) return 90

  const labelPart = field.label?.split(" - ").slice(1).join(" - ") ?? field.label ?? ""
  const selectorTokens = tokenize(selector)
  const labelTokens = tokenize(labelPart)
  let score = 0
  for (const token of selectorTokens) {
    if (labelTokens.some((labelToken) => labelToken.includes(token) || token.includes(labelToken))) {
      score += 2
    }
  }
  return score
}

export function resolveFillFieldSelector(
  selector: string,
  candidates: FormFieldDescriptor[],
  aliasMap?: ReadonlyMap<string, string>
): string | null {
  const trimmed = selector.trim()
  if (!trimmed || !candidates.length) return null

  const fromAlias = resolveAliasSelector(trimmed, aliasMap)
  if (fromAlias) return fromAlias

  if (candidates.some((field) => field.selector === trimmed)) return trimmed

  const key = extractFieldKeyFromSelector(trimmed)
  if (key) {
    const byKey = candidates.find((field) => field.label === key)
    if (byKey) return byKey.selector
  }

  const idMatch = trimmed.match(/#([A-Za-z0-9_-]+)/)
  if (idMatch) {
    const byId = candidates.find((field) => field.id === idMatch[1])
    if (byId) return byId.selector
  }

  const nameMatch = trimmed.match(/\[name=["']([^"']+)["']\]/i)
  if (nameMatch) {
    const byName = candidates.find((field) => field.name === nameMatch[1])
    if (byName) return byName.selector
  }

  let best: { field: FormFieldDescriptor; score: number } | null = null
  for (const field of candidates) {
    const score = labelMatchScore(trimmed, field)
    if (!best || score > best.score) best = { field, score }
  }

  const minScore = candidates.length <= 15 ? 2 : 4
  return best && best.score >= minScore ? best.field.selector : null
}

export function resolveFillFieldMappings(
  items: Array<{ selector: string; value: string }>,
  pageContext: PageContext,
  openSectionLabel?: string | null,
  aliasMap?: ReadonlyMap<string, string>
): Array<{ selector: string; value: string }> {
  const candidates = openSectionLabel
    ? getSectionFillableFields(pageContext, openSectionLabel)
    : pageContext.fields.filter((field) => !field.isFileInput)

  return items.map((item) => {
    const resolved = resolveFillFieldSelector(item.selector, candidates, aliasMap)
    return { selector: resolved ?? item.selector, value: item.value }
  })
}

export function fieldBelongsToSection(
  selector: string,
  sectionLabel: string,
  pageContext: PageContext,
  aliasMap?: ReadonlyMap<string, string>
): boolean {
  const field = pageContext.fields.find((candidate) => candidate.selector === selector)
  if (field?.label?.startsWith(`${sectionLabel} -`)) return true

  const candidates = getSectionFillableFields(pageContext, sectionLabel)
  const resolved = resolveFillFieldSelector(selector, candidates, aliasMap)
  if (!resolved || resolved === selector) return false
  const resolvedField = pageContext.fields.find((candidate) => candidate.selector === resolved)
  return resolvedField?.label?.startsWith(`${sectionLabel} -`) ?? false
}

export function allFieldsBelongToSection(
  fields: Array<{ selector: string }>,
  sectionLabel: string,
  pageContext: PageContext,
  aliasMap?: ReadonlyMap<string, string>
): boolean {
  return (
    fields.length > 0 &&
    fields.every((field) =>
      fieldBelongsToSection(field.selector, sectionLabel, pageContext, aliasMap)
    )
  )
}
