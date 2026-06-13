import type { AddEntrySavedEntry, AddEntrySectionDescriptor } from "~/lib/types"

const MAX_SUMMARIES_PER_SECTION = 12
const OVERFLOW_SHOW = 5

export function snapshotFingerprints(entries: AddEntrySavedEntry[]): Set<string> {
  return new Set(entries.map((entry) => entry.fingerprint))
}

export function diffSavedEntries(
  before: AddEntrySavedEntry[],
  after: AddEntrySavedEntry[]
): { entryAdded: boolean; newEntries: AddEntrySavedEntry[] } {
  const beforeSet = snapshotFingerprints(before)
  const newEntries = after.filter((entry) => !beforeSet.has(entry.fingerprint))
  const entryAdded = newEntries.length > 0 || after.length > before.length
  return { entryAdded, newEntries }
}

export function formatLastSavedSummary(entry: AddEntrySavedEntry | undefined): string | undefined {
  if (!entry?.summary) return undefined
  return entry.summary.length > 100 ? `${entry.summary.slice(0, 100)}…` : entry.summary
}

export function formatSectionSavedEntriesLine(section: AddEntrySectionDescriptor): string {
  const count = section.savedEntries?.length ?? section.entryCount ?? 0
  if (count === 0) return `${section.sectionLabel} (0): (none)`

  const entries = section.savedEntries ?? []
  if (entries.length <= MAX_SUMMARIES_PER_SECTION) {
    const quoted = entries.map((e) => `"${e.summary.replace(/"/g, "'")}"`).join("; ")
    return `${section.sectionLabel} (${count}): ${quoted}`
  }

  const shown = entries.slice(0, OVERFLOW_SHOW)
  const quoted = shown.map((e) => `"${e.summary.replace(/"/g, "'")}"`).join("; ")
  return `${section.sectionLabel} (${count} entries, showing first ${OVERFLOW_SHOW}): ${quoted}; …`
}

export function formatSavedEntriesBlock(sections: AddEntrySectionDescriptor[]): string {
  if (!sections.length) return ""
  const lines = sections.map(formatSectionSavedEntriesLine)
  return `Saved entries on page:\n${lines.join("\n")}\nOnly add attachment items not already represented above.`
}

export function getSectionSavedCount(section: AddEntrySectionDescriptor | undefined): number {
  if (!section) return 0
  return section.savedEntries?.length ?? section.entryCount ?? 0
}

export function findSectionByLabel(
  sections: AddEntrySectionDescriptor[],
  sectionLabel: string
): AddEntrySectionDescriptor | undefined {
  return sections.find((section) => section.sectionLabel === sectionLabel)
}
