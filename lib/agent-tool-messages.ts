/** Compact tool results for agent chat history — keeps tokens small without summarizing. */

import { formatSavedEntriesBlock } from "~/lib/add-entry-saved-rows"
import type { AddEntrySectionDescriptor } from "~/lib/types"

export interface AgentToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

export function compactToolResultForAgent(
  toolName: string,
  toolResult: AgentToolResult
): Record<string, unknown> {
  const result =
    toolResult.result && typeof toolResult.result === "object"
      ? (toolResult.result as Record<string, unknown>)
      : undefined

  if (toolName === "fill_fields") {
    const addEntry = result?.addEntry as Record<string, unknown> | undefined
    return {
      ok: toolResult.ok,
      filled: result?.filled,
      skipped: result?.skipped,
            duplicateEntry: result?.duplicateEntry,
            missingRequired: result?.missingRequired,
      error: toolResult.error,
      addEntry: addEntry
        ? {
            submitted: addEntry.submitted,
            openedNext: addEntry.openedNext,
            sectionLabel: addEntry.sectionLabel,
            entryNumber: addEntry.entryNumber,
            nextStep: addEntry.nextStep,
            entryAdded: addEntry.entryAdded,
            savedCount: addEntry.savedCount,
            sessionAdded: addEntry.sessionAdded,
            lastSavedSummary: addEntry.lastSavedSummary,
            error: addEntry.error
          }
        : undefined
    }
  }

  if (toolName === "click") {
    return {
      ok: toolResult.ok,
      error: toolResult.error,
      addEntryWait: result?.addEntryWait
    }
  }

  if (toolName === "get_page_content") {
    const sections = result?.addEntrySections as AddEntrySectionDescriptor[] | undefined
    const savedBlock =
      sections?.length ? formatSavedEntriesBlock(sections) : undefined
    return {
      ok: toolResult.ok,
      error: toolResult.error,
      note: savedBlock
        ? "Saved entries on page (field aliases are in the system prompt)."
        : "Page fields are listed in the system prompt — use those selectors.",
      savedEntries: savedBlock
    }
  }

  if (toolName === "take_screenshot") {
    return { ok: toolResult.ok, error: toolResult.error, captured: toolResult.ok }
  }

  if (toolName === "fill") {
    const addEntry = result?.addEntry as Record<string, unknown> | undefined
    return {
      ok: toolResult.ok,
      error: toolResult.error,
      selector: result?.selector,
      value: result?.value,
      filled: result?.filled,
      skipped: result?.skipped,
      partialCount: result?.partialCount,
      duplicateEntry: result?.duplicateEntry,
      missingRequired: result?.missingRequired,
      nextField: result?.nextField,
      filledAliases: result?.filledAliases,
      addEntry: addEntry
        ? {
            submitted: addEntry.submitted,
            openedNext: addEntry.openedNext,
            sectionLabel: addEntry.sectionLabel,
            entryNumber: addEntry.entryNumber,
            nextStep: addEntry.nextStep,
            entryAdded: addEntry.entryAdded,
            savedCount: addEntry.savedCount,
            sessionAdded: addEntry.sessionAdded,
            lastSavedSummary: addEntry.lastSavedSummary,
            error: addEntry.error
          }
        : undefined
    }
  }

  if (result) {
    const compact: Record<string, unknown> = { ...result }
    delete compact.screenshot
    delete compact.textSummary
    if (Array.isArray(compact.fields)) {
      compact.fieldCount = compact.fields.length
      delete compact.fields
    }
    if (Array.isArray(compact.results) && compact.results.length > 4) {
      const rows = compact.results as Array<{ ok?: boolean }>
      compact.resultsSummary = {
        total: rows.length,
        ok: rows.filter((r) => r.ok).length,
        failed: rows.filter((r) => !r.ok).length
      }
      delete compact.results
    }
    return { ok: toolResult.ok, error: toolResult.error, ...compact }
  }

  return { ok: toolResult.ok, error: toolResult.error }
}

export function formatCompactAgentToolResultMessage(
  toolName: string,
  toolResult: AgentToolResult
): string {
  const compact = compactToolResultForAgent(toolName, toolResult)
  if (toolName === "fill" || toolName === "fill_fields") {
    const addEntry = compact.addEntry as Record<string, unknown> | undefined
    if (addEntry) {
      if (compact.duplicateEntry) {
        return String(compact.duplicateEntry)
      }
      if (addEntry.submitted === false && compact.missingRequired) {
        return String(compact.missingRequired)
      }
      if (addEntry.entryAdded === false) {
        return `Save failed — no new entry in list (${addEntry.savedCount ?? 0} on page). ${addEntry.error ?? addEntry.nextStep ?? ""}`.trim()
      }
      if (addEntry.submitted) {
        const summary =
          typeof addEntry.lastSavedSummary === "string"
            ? ` "${addEntry.lastSavedSummary}"`
            : ""
        return `Saved ${addEntry.sectionLabel} entry #${addEntry.entryNumber} (${addEntry.savedCount ?? addEntry.entryNumber} on page).${summary} ${addEntry.nextStep ?? ""}`.trim()
      }
      if (typeof addEntry.nextStep === "string" && addEntry.nextStep) {
        return addEntry.nextStep
      }
    }
    if (compact.skipped) {
      const addEntry = compact.addEntry as Record<string, unknown> | undefined
      if (typeof addEntry?.nextStep === "string" && addEntry.nextStep) {
        return addEntry.nextStep
      }
      if (compact.nextField) {
        return `Field already filled. Next: call fill with selector "${compact.nextField}".`
      }
      return "Field already filled."
    }
    return `Filled ${compact.filled ?? 1} field(s).`
  }
  if (toolName === "click") {
    const wait = compact.addEntryWait as Record<string, unknown> | undefined
    if (wait?.alreadyOpen && wait?.section) {
      return `${wait.section} form already open — use fill (one field at a time), do not click Add again.`
    }
    if (wait?.section) return `Opened ${wait.section}.`
    return compact.ok ? "Click ok." : `Click failed: ${compact.error ?? "unknown"}`
  }
  if (toolName === "done") return "Done."
  return compact.ok ? `${toolName} ok.` : `${toolName} failed: ${compact.error ?? "unknown"}`
}

export function formatAgentToolResultMessage(
  toolName: string,
  toolResult: AgentToolResult
): string {
  return `Action result (${toolName}): ${JSON.stringify(compactToolResultForAgent(toolName, toolResult))}`
}
