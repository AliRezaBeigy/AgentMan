import { formatSavedEntriesBlock, getSectionSavedCount } from "~/lib/add-entry-saved-rows"
import {
  formatCompletionDoneHint,
  formatRemainingEntriesHint,
  getSectionEntryRemaining,
  isAddEntryTaskComplete
} from "~/lib/add-entry-completion"
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
  // ~4 LLM turns per entry (open, fill per field, auto-save) × estimated entries per section
  const estimatedEntriesPerSection = 8
  const estimated = sections.length * estimatedEntriesPerSection * 3 + fieldsPerEntry
  return Math.max(baseLimit, Math.min(estimated, 150))
}

/** Model claims the add-entry task is finished (may be true or false). */
export function assistantClaimsTaskComplete(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false

  return (
    /\b(task complete|finished adding|no more entries|that completes|sections are now complete|entries are now saved|have been successfully saved|successfully saved to the form|successfully added)\b/.test(
      t
    ) ||
    /\b(all|every|both|\d+)\s+.*\b(entries|items|sections)\b.*\b(added|saved|complete|successfully)\b/.test(
      t
    ) ||
    /\b(all (entries|items|sections) (have been |are )?added)\b/.test(t)
  )
}

/** Model sometimes narrates the next step without calling tools — keep the loop going. */
export function assistantTurnNeedsToolFollowUp(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false

  if (assistantClaimsTaskComplete(t)) return false

  if (
    /\b(let me|i'll|now i|continue|next entry|fill (this|in)|adding|proceed with|i will)\b/.test(t)
  ) {
    return true
  }

  if (
    /\b(second|third|fourth|fifth|next|remaining|another)\b/.test(t) &&
    /\b(entry|entries|item|items|section|sections|field|fields|row|rows)\b/.test(t)
  ) {
    return true
  }

  return false
}

/** Reject done when targeted add-entry sections have no saved entries on the page. */
export function buildPrematureDoneRejection(
  userMessage: string,
  _addEntryCounts: ReadonlyMap<string, number>,
  addEntrySections: AddEntrySectionDescriptor[],
  fields: FormFieldDescriptor[],
  baselineCounts: ReadonlyMap<string, number> = new Map()
): string | null {
  const targeted = filterAddEntrySectionsForIntent(addEntrySections, userMessage, fields)
  if (!targeted.length) return null

  if (isAddEntryTaskComplete(userMessage, addEntrySections, fields, baselineCounts)) {
    return null
  }

  const missing = targeted
    .filter((section) => getSectionSavedCount(section) === 0)
    .map((section) => section.sectionLabel)

  if (missing.length) {
    const sectionOrder = targeted.map((section) => section.sectionLabel).join(" → ")
    return `Do not call done yet — no saved entries on page for: ${missing.join(", ")}. For each section: {"action":"click","section":"..."} then fill each required field one at a time per attachment item. Complete sections in order (${sectionOrder}). Only one section form can be open at a time.`
  }

  const pending = getSectionEntryRemaining(userMessage, addEntrySections, baselineCounts).filter(
    (item) => item.expected > 0 && item.remaining > 0
  )
  if (pending.length) {
    const detail = pending
      .map((item) => `${item.remaining} more ${item.sectionLabel} (${item.onPage - item.baseline}/${item.expected} saved)`)
      .join("; ")
    return `Do not call done yet — attachment still has unsaved items: ${detail}. Call fill for the next required field of the next unsaved item only.`
  }

  return null
}

export function buildFalseCompletionNudge(
  userMessage: string,
  sections: AddEntrySectionDescriptor[],
  baselineCounts: ReadonlyMap<string, number> = new Map(),
  textActionMode = false
): string {
  const remaining = getSectionEntryRemaining(userMessage, sections, baselineCounts)
  const pending = formatRemainingEntriesHint(remaining)
  const detail = pending || "more items from the attachment"
  if (textActionMode) {
    return `You said the task is complete but the attachment still needs ${detail}. Return fill for the next required field, or {"action":"done"} only when every expected item is saved.`
  }
  return `You said the task is complete but the attachment still needs ${detail}. Call fill for the next required field, or call done only when every expected item is saved.`
}

export function buildAgentContinuationNudge(
  addEntryCounts: ReadonlyMap<string, number>,
  userMessage?: string,
  addEntrySections: AddEntrySectionDescriptor[] = [],
  fields: FormFieldDescriptor[] = [],
  baselineCounts: ReadonlyMap<string, number> = new Map()
): string {
  const progress =
    addEntryCounts.size > 0
      ? ` Progress so far: ${Array.from(addEntryCounts.entries())
          .map(([section, count]) => `${section}=${count}`)
          .join(", ")}.`
      : ""

  if (
    userMessage &&
    addEntrySections.length &&
    isAddEntryTaskComplete(userMessage, addEntrySections, fields, baselineCounts)
  ) {
    return `You replied with text only but did not call any tools.${progress} All expected items from the attachment appear saved. Call the done tool now — do NOT add more entries.`
  }

  const pending = userMessage
    ? getSectionEntryRemaining(userMessage, addEntrySections, baselineCounts).filter(
        (item) => item.expected > 0 && item.remaining > 0
      )
    : []
  const pendingHint =
    pending.length > 0
      ? ` Still need: ${pending.map((item) => `${item.remaining} ${item.sectionLabel}`).join(", ")}.`
      : ""

  const sectionNames =
    addEntrySections.length > 0
      ? addEntrySections.map((section) => section.sectionLabel).join(" and ")
      : "expected"
  return `You replied with text only but did not call any tools.${progress}${pendingHint} Continue the user request now — use fill (one field at a time) for the next unsaved entry or click to open a section. Do not stop with narration; call tools until every ${sectionNames} item from the attachment is added.`
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
    lines.push("Form fields (use fill with selector alias):")
    for (const field of fillable.slice(0, 120)) {
      lines.push(formatFieldLine(field))
    }
    if (fillable.length > 120) {
      lines.push(`… and ${fillable.length - 120} more fields`)
    }
  }

  if (addEntrySections.length) {
    lines.push("")
    lines.push(formatSavedEntriesBlock(addEntrySections))
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

  const savedBlock = sections.length ? `\n${formatSavedEntriesBlock(sections)}\n` : ""
  const expectedBlock = userMessage
    ? formatExpectedEntriesBlock(userMessage, sections)
    : ""

  return `AgentMan. Page: ${pageContext.url}
Use click / fill / done tools — one tool call per turn (never a JSON array in content).
Workflow: click section → fill each required field one at a time → auto-save → next entry.
When a section form is open, call fill with ONE selector+value per turn so values appear immediately.
Sections (label|open|save):
${sectionLines}
${expectedBlock}${savedBlock}Field aliases (alias;type;REQUIRED;options;attachment hints):
${fieldAliases}
REQUIRED fields must have real values (selects: never -1/Choose). Lines with "attachment:" map attachment data under different names.
Example fill: {"selector":"work:title","value":"..."}
When every expected attachment item is saved, call done — never re-add entries already listed under "Saved entries on page".`
}

function formatExpectedEntriesBlock(
  userMessage: string,
  sections: AddEntrySectionDescriptor[]
): string {
  const remaining = getSectionEntryRemaining(userMessage, sections)
  const withExpected = remaining.filter((item) => item.expected > 0)
  if (!withExpected.length) return ""

  const lines = withExpected.map(
    (item) =>
      `${item.sectionLabel}: ${item.expected} in attachment (${Math.max(0, item.onPage - item.baseline)} saved this run)`
  )
  return `Expected from attachment:\n${lines.join("\n")}\n`
}

export const ADD_ENTRY_TURN_HINT_PREFIX = "[Next step]"

function formatClickSectionAction(sectionLabel: string, textActionMode: boolean): string {
  return textActionMode
    ? `{"action":"click","section":${JSON.stringify(sectionLabel)}}`
    : `Call the click tool with section ${sectionLabel}`
}

export function buildAddEntryTurnHint(
  addEntryCounts: ReadonlyMap<string, number>,
  lastToolName: string | null,
  openSectionLabel: string | null = null,
  sections: AddEntrySectionDescriptor[] = [],
  sessionCounts: ReadonlyMap<string, number> = new Map(),
  textActionMode = false,
  userMessage?: string,
  baselineCounts: ReadonlyMap<string, number> = new Map(),
  partialFilledAliases: string[] = [],
  nextFillAlias: string | null = null
): string {
  const progressParts = sections
    .map((section) => {
      const onPage = getSectionSavedCount(section)
      const sessionAdded = sessionCounts.get(section.sectionLabel) ?? 0
      return `${section.sectionLabel}: ${onPage} on page${sessionAdded > 0 ? `, +${sessionAdded} this run` : ""}`
    })
    .join("; ")
  const progressSuffix = progressParts ? ` (${progressParts}).` : ""

  const remaining = userMessage ? getSectionEntryRemaining(userMessage, sections, baselineCounts) : []
  const taskComplete =
    userMessage && sections.length
      ? isAddEntryTaskComplete(userMessage, sections, [], baselineCounts)
      : false

  if (taskComplete) {
    return `${ADD_ENTRY_TURN_HINT_PREFIX}${progressSuffix} ${formatCompletionDoneHint(remaining, textActionMode)}`
  }

  const firstSectionLabel = sections[0]?.sectionLabel
  const firstOpen = firstSectionLabel
    ? textActionMode
      ? `Return ONE JSON object only (not an array). First: ${formatClickSectionAction(firstSectionLabel, true)}`
      : `${formatClickSectionAction(firstSectionLabel, false)} (do not put JSON in content — use the tool).`
    : textActionMode
      ? "Return ONE JSON object only (not an array)."
      : "Call one tool for the immediate next step."

  if (openSectionLabel) {
    const sectionRemaining = remaining.find((item) => item.sectionLabel === openSectionLabel)
    if (sectionRemaining && sectionRemaining.expected > 0 && sectionRemaining.remaining <= 0) {
      const otherPending = remaining.some(
        (item) => item.sectionLabel !== openSectionLabel && item.expected > 0 && item.remaining > 0
      )
      if (otherPending) {
        return `${ADD_ENTRY_TURN_HINT_PREFIX} All ${openSectionLabel} items from attachment are saved.${progressSuffix} Open the next section or call done — do NOT add duplicate ${openSectionLabel} entries.`
      }
      return `${ADD_ENTRY_TURN_HINT_PREFIX}${progressSuffix} ${formatCompletionDoneHint(remaining, textActionMode)}`
    }

    const filledHint =
      partialFilledAliases.length > 0
        ? ` Already filled: ${partialFilledAliases.join(", ")}.`
        : ""
    const nextHint = nextFillAlias
      ? textActionMode
        ? ` Next: {"action":"fill","selector":"${nextFillAlias}","value":"..."} — do NOT repeat a filled field.`
        : ` Next: call fill with selector "${nextFillAlias}" — do NOT repeat a filled field.`
      : partialFilledAliases.length > 0
        ? textActionMode
          ? ` All required fields for this ${openSectionLabel} item are filled — wait for auto-save or call done. Do NOT re-fill: ${partialFilledAliases.join(", ")}.`
          : ` All required fields for this ${openSectionLabel} item are filled — wait for auto-save or call done. Do NOT re-fill fields already listed above.`
        : textActionMode
          ? ` Return {"action":"fill","selector":"<alias>","value":"..."} for the NEXT required field of the unsaved ${openSectionLabel} item — one field per turn. Do NOT click Add again or re-add entries already saved.`
          : ` Call fill (one field at a time) for the NEXT required field of the unsaved ${openSectionLabel} item. Do NOT click Add again or re-add entries already saved.`

    return `${ADD_ENTRY_TURN_HINT_PREFIX} ${openSectionLabel} form is open.${progressSuffix}${filledHint}${nextHint}`
  }

  if (!lastToolName) {
    return `${ADD_ENTRY_TURN_HINT_PREFIX} ${firstOpen}${progressSuffix}`
  }

  if (lastToolName === "click") {
    return `${ADD_ENTRY_TURN_HINT_PREFIX} Form open.${progressSuffix} ${
      textActionMode
        ? 'Return {"action":"fill","selector":"<field alias>","value":"<from attachment>"} for the first required field. Do NOT click Add again.'
        : "Call fill with the first required field alias and value from the attachment. Do NOT click Add again."
    }`
  }

  if (lastToolName === "fill" || lastToolName === "fill_fields") {
    const pending = remaining.filter((item) => item.expected > 0 && item.remaining > 0)
    if (!pending.length) {
      return `${ADD_ENTRY_TURN_HINT_PREFIX}${progressSuffix} ${formatCompletionDoneHint(remaining, textActionMode)}`
    }

    const next = pending[0]!
    if (next.onPage === 0) {
      return `${ADD_ENTRY_TURN_HINT_PREFIX} ${
        textActionMode
          ? `Return ONE action: ${formatClickSectionAction(next.sectionLabel, true)} then fill each required field for the first ${next.sectionLabel} entry.`
          : `Call click (${next.sectionLabel}) then fill each required field for the first ${next.sectionLabel} entry.`
      }${progressSuffix}`
    }

    return `${ADD_ENTRY_TURN_HINT_PREFIX} ${
      textActionMode
        ? `Return ONE action for the next unsaved ${next.sectionLabel} entry, or {"action":"done","message":"..."} when all items are saved.`
        : `Call fill for the next required field, or done when all ${next.sectionLabel} items are saved.`
    }${progressSuffix}`
  }

  return `${ADD_ENTRY_TURN_HINT_PREFIX} ${
    textActionMode
      ? "Return ONE JSON object for the immediate next step."
      : "Call one tool for the immediate next step."
  }${progressSuffix}`
}

export function buildAgentSystemPrompt(pageContext: PageContext, userMessage?: string): string {
  const base = `You are AgentMan, a browser assistant. Current page: ${pageContext.title} (${pageContext.url}).`
  const formNote = buildAgentFormContextNote(pageContext, userMessage)
  const sections = userMessage
    ? filterAddEntrySectionsForIntent(
        pageContext.addEntrySections ?? [],
        userMessage,
        pageContext.fields
      )
    : (pageContext.addEntrySections ?? [])
  const sectionOrder =
    sections.length > 0
      ? sections.map((section) => section.sectionLabel).join(" → ")
      : "each add-entry section"
  const firstSection = sections[0]?.sectionLabel ?? "the first section"

  return `${base}
Use tools to complete multi-step browser tasks. Ask before submit/delete when uncertain.

Add-entry workflow (repeat for EACH item from the user's documents):
1. Complete ALL items in one section before opening the next (${sectionOrder}). Only one section form can be open at a time.
2. Open a section: {"action":"click","section":${JSON.stringify(firstSection)}} — then fill each required field for the FIRST item (one fill per field).
3. After all required fields are filled, the extension auto-saves and reopens the form — read addEntry.nextStep and fill the NEXT item (different data).
4. When every item in the current section is saved, open the next section and repeat.
5. Call done when every expected attachment item is saved — never re-add entries already listed under "Saved entries on page".

Rules:
- One fill call per field — when all REQUIRED fields are filled, wait for auto-advance.
- For selects, use exact option values from the field list (e.g. IR not Iran). Never use Choose or -1.
- REQUIRED fields marked in the alias list; "attachment:" hints show where attachment data lives under a different name.
- Field selectors are listed below — do not call get_page_content unless a click or fill failed.
- Use attached file context in the user message for factual data.${formNote}`
}
