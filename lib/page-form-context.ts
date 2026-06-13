import { pickCssSelector } from "~/lib/add-entry-workflow"
import { buildFillFieldAliasRegistry } from "~/lib/fill-field-aliases"
import { getFillableFields } from "~/lib/fill-parse"
import type { AddEntrySectionDescriptor, FormFieldDescriptor, PageContext } from "~/lib/types"

const STOP_WORDS = new Set([
  "add",
  "the",
  "and",
  "for",
  "from",
  "with",
  "your",
  "fill",
  "complete",
  "form",
  "page",
  "attached",
  "attachment",
  "context",
  "please",
  "using",
  "use"
])

function messageTokens(userMessage: string): string[] {
  const withoutAttachments = userMessage.split(/\n\n\[Attached:/)[0] ?? userMessage
  return withoutAttachments
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
}

function collectSectionPrefixes(
  fields: FormFieldDescriptor[],
  addEntrySections: AddEntrySectionDescriptor[]
): string[] {
  const prefixes = new Set<string>()
  for (const section of addEntrySections) {
    if (section.sectionLabel.trim()) prefixes.add(section.sectionLabel.trim())
  }
  for (const field of fields) {
    const prefix = field.label?.split(" - ")[0]?.trim()
    if (prefix) prefixes.add(prefix)
  }
  return Array.from(prefixes)
}

function sectionMatchesTokens(section: string, tokens: string[]): boolean {
  const normalized = section.toLowerCase()
  const words = normalized.split(/\W+/).filter((w) => w.length > 2)
  return tokens.some(
    (token) =>
      normalized.includes(token) ||
      words.some((word) => word.startsWith(token) || token.startsWith(word))
  )
}

function matchedSectionLabels(
  userMessage: string,
  fields: FormFieldDescriptor[],
  addEntrySections: AddEntrySectionDescriptor[]
): string[] {
  const tokens = messageTokens(userMessage)
  if (!tokens.length) return []
  const sections = collectSectionPrefixes(fields, addEntrySections)
  return sections.filter((section) => sectionMatchesTokens(section, tokens))
}

/** Limit fill targets to sections the user mentioned (e.g. "work and education"). */
export function filterFieldsForIntent(
  fields: FormFieldDescriptor[],
  userMessage: string,
  addEntrySections: AddEntrySectionDescriptor[] = []
): FormFieldDescriptor[] {
  const matched = matchedSectionLabels(userMessage, fields, addEntrySections)
  if (!matched.length) return fields

  return fields.filter((field) => {
    const prefix = field.label?.split(" - ")[0]?.trim() ?? ""
    if (!prefix) return false
    return matched.some(
      (section) =>
        prefix.toLowerCase() === section.toLowerCase() ||
        prefix.toLowerCase().startsWith(section.toLowerCase()) ||
        section.toLowerCase().startsWith(prefix.toLowerCase())
    )
  })
}

export function filterAddEntrySectionsForIntent(
  sections: AddEntrySectionDescriptor[],
  userMessage: string,
  fields: FormFieldDescriptor[]
): AddEntrySectionDescriptor[] {
  const matched = matchedSectionLabels(userMessage, fields, sections)
  if (!matched.length) return sections

  return sections.filter((section) =>
    matched.some(
      (label) =>
        section.sectionLabel.toLowerCase() === label.toLowerCase() ||
        section.sectionLabel.toLowerCase().startsWith(label.toLowerCase()) ||
        label.toLowerCase().startsWith(section.sectionLabel.toLowerCase())
    )
  )
}

/** Multi-step Add-button forms need the agent (click → fill → submit → repeat). */
export function shouldDelegateFillToAgent(
  pageContext: PageContext,
  userMessage: string
): boolean {
  const addEntrySections = pageContext.addEntrySections ?? []
  if (!addEntrySections.length) return false

  const fillable = getFillableFields(pageContext.fields)
  const scoped = filterFieldsForIntent(fillable, userMessage, addEntrySections)
  if (!scoped.length) return false

  return scoped.length < fillable.length
}

export function estimateDelegatedAgentIterations(
  pageContext: PageContext,
  userMessage: string,
  baseLimit: number
): number {
  const sections = filterAddEntrySectionsForIntent(
    pageContext.addEntrySections ?? [],
    userMessage,
    pageContext.fields
  )
  const fieldsPerEntry = sections.reduce((sum, s) => sum + Math.max(s.fieldLabels.length, 1), 0)
  // ~4 LLM turns per entry (open, fill_fields, submit, cancel) × estimated entries per section
  const estimatedEntriesPerSection = 8
  const estimated = sections.length * estimatedEntriesPerSection * 3 + fieldsPerEntry
  return Math.max(baseLimit, Math.min(estimated, 150))
}

/** Model sometimes narrates the next step without calling tools — keep the loop going. */
export function assistantTurnNeedsToolFollowUp(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false

  if (
    /\b(task complete|all (work|education|entries|items) (have been |are )?added|finished adding|no more entries|that completes)\b/.test(
      t
    )
  ) {
    return false
  }

  if (
    /\b(let me|i'll|now i|continue|next entry|fill (this|in)|adding|proceed with|i will)\b/.test(t)
  ) {
    return true
  }

  if (
    /\b(second|third|fourth|fifth|next|remaining|another)\b/.test(t) &&
    /\b(experience|education|entry|job|degree|position)\b/.test(t)
  ) {
    return true
  }

  return false
}

/** Reject done when targeted add-entry sections still have zero saved rows. */
export function buildPrematureDoneRejection(
  userMessage: string,
  addEntryCounts: ReadonlyMap<string, number>,
  addEntrySections: AddEntrySectionDescriptor[],
  fields: FormFieldDescriptor[]
): string | null {
  const targeted = filterAddEntrySectionsForIntent(addEntrySections, userMessage, fields)
  if (!targeted.length) return null

  const missing = targeted
    .filter((section) => (addEntryCounts.get(section.sectionLabel) ?? 0) === 0)
    .map((section) => section.sectionLabel)

  if (!missing.length) return null

  return `Do not call done yet — no entries saved for: ${missing.join(", ")}. For each section: {"action":"click","section":"..."} then fill_fields once per CV item. Finish ALL work experience items before opening Education. Only one section form can be open at a time.`
}

export function buildAgentContinuationNudge(
  addEntryCounts: ReadonlyMap<string, number>
): string {
  const progress =
    addEntryCounts.size > 0
      ? ` Progress so far: ${Array.from(addEntryCounts.entries())
          .map(([section, count]) => `${section}=${count}`)
          .join(", ")}.`
      : ""

  return `You replied with text only but did not call any tools.${progress} Continue the user request now — use fill_fields for the next entry (one call per entry) or click to open a section. Do not stop with narration; call tools until every work and education item from the attachment is added.`
}

function formatFieldLine(field: FormFieldDescriptor): string {
  const label = field.label ?? field.name ?? field.selector
  let line = `- ${field.selector} — ${label} (${field.type})`
  if ((field.type === "select" || field.type === "button-group") && field.options?.length) {
    const opts = field.options
      .slice(0, 8)
      .map((o) => o.value || o.label)
      .join(", ")
    const more = field.options.length > 8 ? `, …+${field.options.length - 8}` : ""
    line += ` [options: ${opts}${more}]`
  }
  return line
}

export function buildAgentFormContextNote(
  pageContext: PageContext,
  userMessage?: string
): string {
  const lines: string[] = []
  const addEntrySections = userMessage
    ? filterAddEntrySectionsForIntent(
        pageContext.addEntrySections ?? [],
        userMessage,
        pageContext.fields
      )
    : (pageContext.addEntrySections ?? [])

  const fillable = userMessage
    ? filterFieldsForIntent(getFillableFields(pageContext.fields), userMessage, addEntrySections)
    : getFillableFields(pageContext.fields)

  if (fillable.length) {
    lines.push("Form fields (use fill or fill_fields with selector):")
    for (const field of fillable.slice(0, 120)) {
      lines.push(formatFieldLine(field))
    }
    if (fillable.length > 120) {
      lines.push(`… and ${fillable.length - 120} more fields`)
    }
  }

  if (addEntrySections.length) {
    lines.push("")
    lines.push("Add-entry sections (each item is a separate sub-form):")
    for (const section of addEntrySections) {
      lines.push(`- ${section.sectionLabel}:`)
      lines.push(`  Open (click this to show fields): ${section.addButtonSelector} ("${section.addButtonLabel}")`)
      lines.push(`  Save entry: ${section.submitSelector}`)
      if (section.cancelButtonSelector) {
        lines.push(`  Close/clear form: ${section.cancelButtonSelector} (click after saving if the form stays open)`)
      }
      lines.push(`  Form: ${section.formSelector}`)
      if (section.fieldLabels.length) {
        lines.push(`  Fields: ${section.fieldLabels.join(", ")}`)
      }
    }
  }

  const repeatable = pageContext.repeatableSections ?? []
  if (repeatable.length) {
    lines.push("")
    lines.push("Inline repeatable rows (click Add row, or use Row N - Column keys in fill mode):")
    for (const section of repeatable) {
      lines.push(`- "${section.addButtonLabel}" — ${section.rowCount} row(s) visible`)
    }
  }

  return lines.length ? `\n\n${lines.join("\n")}` : ""
}

export function buildCompactAddEntrySystemPrompt(
  pageContext: PageContext,
  userMessage?: string
): string {
  const sections = userMessage
    ? filterAddEntrySectionsForIntent(
        pageContext.addEntrySections ?? [],
        userMessage,
        pageContext.fields
      )
    : (pageContext.addEntrySections ?? [])

  const { promptBlock: fieldAliases } = buildFillFieldAliasRegistry(pageContext, userMessage)

  const sectionLines = sections
    .map(
      (section) =>
        `${section.sectionLabel}|open:${section.addButtonSelector}|save:${pickCssSelector(section.submitSelector)}`
    )
    .join("\n")

  return `AgentMan. Page: ${pageContext.url}
Return ONE JSON object per turn — never a JSON array.
Workflow: click section → fill_fields → auto-save → next entry.
Sections (label|open|save):
${sectionLines}
Field aliases (alias;type;options) — use alias as selector in fill_fields, or #element-id:
${fieldAliases}
Example: {"action":"fill_fields","fields":[{"selector":"work:title","value":"..."},{"selector":"#cvjob-company","value":"..."}]}`
}

export const ADD_ENTRY_TURN_HINT_PREFIX = "[Next step]"

export function buildAddEntryTurnHint(
  addEntryCounts: ReadonlyMap<string, number>,
  lastToolName: string | null,
  openSectionLabel: string | null = null
): string {
  const workCount = addEntryCounts.get("Work experience") ?? 0
  const educationCount = addEntryCounts.get("Education") ?? 0

  if (openSectionLabel) {
    return `${ADD_ENTRY_TURN_HINT_PREFIX} ${openSectionLabel} form is open. Return fill_fields with the NEXT ${openSectionLabel} item from the attachment — do NOT click Add again.`
  }

  if (!lastToolName) {
    return `${ADD_ENTRY_TURN_HINT_PREFIX} Return ONE JSON object only (not an array). First: {"action":"click","section":"Work experience"}`
  }

  if (lastToolName === "click") {
    return `${ADD_ENTRY_TURN_HINT_PREFIX} Form open. Return fill_fields using work:* / edu:* aliases (or #id) with values from the attachment. Do NOT click Add again.`
  }

  if (lastToolName === "fill_fields") {
    if (workCount === 0) {
      return `${ADD_ENTRY_TURN_HINT_PREFIX} Return ONE action: {"action":"click","section":"Work experience"} then fill_fields for the first work entry.`
    }
    if (educationCount === 0) {
      return `${ADD_ENTRY_TURN_HINT_PREFIX} Return ONE action: {"action":"click","section":"Education"} or fill_fields for the next work entry if more remain.`
    }
    return `${ADD_ENTRY_TURN_HINT_PREFIX} Return ONE action for the next unsaved entry, or {"action":"done","message":"..."} when all items are saved.`
  }

  return `${ADD_ENTRY_TURN_HINT_PREFIX} Return ONE JSON object for the immediate next step.`
}

export function buildAgentSystemPrompt(pageContext: PageContext, userMessage?: string): string {
  const base = `You are AgentMan, a browser assistant. Current page: ${pageContext.title} (${pageContext.url}).`
  const formNote = buildAgentFormContextNote(pageContext, userMessage)

  return `${base}
Use tools to complete multi-step browser tasks. Ask before submit/delete when uncertain.

Add-entry workflow (repeat for EACH item from the user's documents):
1. Complete ALL items in Work experience before opening Education. Only one section form can be open at a time.
2. Open a section: {"action":"click","section":"Work experience"} — then fill_fields for the FIRST item.
3. After each fill_fields, the extension auto-saves and reopens the form — read addEntry.nextStep and fill the NEXT item (different data).
4. When every work item from the attachment is saved, open Education and repeat for each education item.
5. Call done only after every section mentioned by the user has at least one saved entry AND no more items remain in the attachment.

Rules:
- One fill_fields per entry, then wait for auto-advance — do not call fill_fields multiple times for the same entry.
- For selects, use exact option values from the field list (e.g. IR not Iran). Never use Choose or -1.
- Education "Finished part" must be 3–6 (not 1 or 2). Education level must match the degree (e.g. 10106 for Master).
- Field selectors are listed below — do not call get_page_content unless a click or fill failed.
- Use attached file context in the user message for factual data.${formNote}`
}
