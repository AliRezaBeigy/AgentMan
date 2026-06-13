import { estimateAttachmentEntryCounts } from "~/lib/attachment-entry-estimate"
import { getSectionSavedCount } from "~/lib/add-entry-saved-rows"
import { filterAddEntrySectionsForIntent } from "~/lib/page-form-context"
import type { AddEntrySectionDescriptor, FormFieldDescriptor } from "~/lib/types"

export interface SectionEntryRemaining {
  sectionLabel: string
  expected: number
  onPage: number
  baseline: number
  remaining: number
}

export function getSectionEntryRemaining(
  userMessage: string,
  sections: AddEntrySectionDescriptor[],
  baselineCounts: ReadonlyMap<string, number> = new Map()
): SectionEntryRemaining[] {
  const targeted = filterAddEntrySectionsForIntent(sections, userMessage, [])
  const expectedCounts = estimateAttachmentEntryCounts(
    userMessage,
    targeted.map((section) => section.sectionLabel)
  )

  return targeted.map((section) => {
    const expected = expectedCounts.get(section.sectionLabel) ?? 0
    const onPage = getSectionSavedCount(section)
    const baseline = baselineCounts.get(section.sectionLabel) ?? 0
    const added = Math.max(0, onPage - baseline)
    const remaining = expected > 0 ? Math.max(0, expected - added) : 0
    return { sectionLabel: section.sectionLabel, expected, onPage, baseline, remaining }
  })
}

export function isAddEntryTaskComplete(
  userMessage: string,
  sections: AddEntrySectionDescriptor[],
  fields: FormFieldDescriptor[] = [],
  baselineCounts: ReadonlyMap<string, number> = new Map()
): boolean {
  const targeted = filterAddEntrySectionsForIntent(sections, userMessage, fields)
  if (!targeted.length) return false

  const remaining = getSectionEntryRemaining(userMessage, sections, baselineCounts)
  const withExpectations = remaining.filter((item) => item.expected > 0)
  if (!withExpectations.length) return false

  return withExpectations.every((item) => item.remaining <= 0)
}

export function formatRemainingEntriesHint(remaining: SectionEntryRemaining[]): string {
  const pending = remaining.filter((item) => item.expected > 0 && item.remaining > 0)
  if (!pending.length) return ""
  return pending
    .map((item) => `${item.remaining} more ${item.sectionLabel}`)
    .join(", ")
}

export function formatCompletionDoneHint(
  remaining: SectionEntryRemaining[],
  textActionMode: boolean
): string {
  const summary = remaining
    .filter((item) => item.expected > 0)
    .map((item) => `${item.sectionLabel}: ${item.onPage - item.baseline}/${item.expected}`)
    .join("; ")

  if (textActionMode) {
    return `All expected attachment items appear saved (${summary}). Return {"action":"done","message":"..."} — do NOT add more entries.`
  }
  return `All expected attachment items appear saved (${summary}). Call the done tool now — do NOT add more entries.`
}
