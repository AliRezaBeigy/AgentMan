import { filterAddEntrySectionsForIntent, filterFieldsForIntent } from "~/lib/page-form-context"
import { getFillableFields } from "~/lib/fill-parse"
import type { FormFieldDescriptor, PageContext } from "~/lib/types"

const SECTION_ALIASES: Record<string, string> = {
  "Work experience": "work",
  Education: "edu",
  Language: "lang"
}

export interface FillFieldAliasRegistry {
  aliasToSelector: Map<string, string>
  promptBlock: string
}

function sectionAlias(sectionLabel: string): string {
  if (SECTION_ALIASES[sectionLabel]) return SECTION_ALIASES[sectionLabel]
  return sectionLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 4)
}

function fieldSlug(field: FormFieldDescriptor): string {
  const part =
    field.label?.split(" - ").slice(1).join(" - ") ??
    field.label ??
    field.id ??
    field.name ??
    "field"
  return part
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function formatOptions(field: FormFieldDescriptor): string {
  if (field.type !== "select" && field.type !== "button-group") return ""
  if (!field.options?.length) return ""
  const opts = field.options
    .slice(0, 4)
    .map((o) => o.value || o.label)
    .join("|")
  const more = field.options.length > 4 ? `|+${field.options.length - 4}` : ""
  return `;${opts}${more}`
}

export function buildFillFieldAliasRegistry(
  pageContext: PageContext,
  userMessage?: string
): FillFieldAliasRegistry {
  const sections = userMessage
    ? filterAddEntrySectionsForIntent(
        pageContext.addEntrySections ?? [],
        userMessage,
        pageContext.fields
      )
    : (pageContext.addEntrySections ?? [])

  const fillable = userMessage
    ? filterFieldsForIntent(getFillableFields(pageContext.fields), userMessage, sections)
    : getFillableFields(pageContext.fields)

  const aliasToSelector = new Map<string, string>()
  const lines: string[] = []
  const usedAliases = new Set<string>()

  for (const field of fillable) {
    const sectionLabel = field.label?.split(" - ")[0]?.trim() ?? "field"
    const sec = sectionAlias(sectionLabel)
    const slug = fieldSlug(field)
    let alias = `${sec}:${slug}`

    let suffix = 2
    while (usedAliases.has(alias)) {
      alias = `${sec}:${slug}${suffix++}`
    }
    usedAliases.add(alias)

    aliasToSelector.set(alias, field.selector)
    if (field.id) {
      aliasToSelector.set(`#${field.id}`, field.selector)
      aliasToSelector.set(field.id, field.selector)
    }

    lines.push(`${alias};${field.type}${formatOptions(field)}`)
  }

  const promptBlock = lines.join("\n")
  return { aliasToSelector, promptBlock }
}

export function resolveAliasSelector(
  selector: string,
  aliasMap?: ReadonlyMap<string, string>
): string | null {
  if (!aliasMap?.size) return null
  const trimmed = selector.trim()
  if (aliasMap.has(trimmed)) return aliasMap.get(trimmed)!

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed
  if (aliasMap.has(withoutHash)) return aliasMap.get(withoutHash)!

  return null
}
