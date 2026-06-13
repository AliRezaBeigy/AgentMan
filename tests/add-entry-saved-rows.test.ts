import { describe, expect, it } from "vitest"
import {
  diffSavedEntries,
  formatSavedEntriesBlock,
  formatLastSavedSummary,
  formatSectionSavedEntriesLine,
  snapshotFingerprints
} from "~/lib/add-entry-saved-rows"
import type { AddEntrySectionDescriptor } from "~/lib/types"

describe("add-entry-saved-rows", () => {
  const section: AddEntrySectionDescriptor = {
    sectionLabel: "Work experience",
    addButtonSelector: "button",
    addButtonLabel: "Add work experience",
    formSelector: "#form",
    submitSelector: "#form button[type=submit]",
    fieldLabels: [],
    entryCount: 2,
    savedEntries: [
      { fingerprint: "a", summary: "2020-2021 | Acme | Engineer" },
      { fingerprint: "b", summary: "2018-2019 | Beta | Intern" }
    ]
  }

  it("diffSavedEntries detects new fingerprints", () => {
    const before = section.savedEntries
    const after = [
      ...before,
      { fingerprint: "c", summary: "2022 | Gamma | Lead" }
    ]
    const diff = diffSavedEntries(before, after)
    expect(diff.entryAdded).toBe(true)
    expect(diff.newEntries).toHaveLength(1)
    expect(diff.newEntries[0].fingerprint).toBe("c")
  })

  it("diffSavedEntries reports no add when unchanged", () => {
    const diff = diffSavedEntries(section.savedEntries, section.savedEntries)
    expect(diff.entryAdded).toBe(false)
    expect(diff.newEntries).toHaveLength(0)
  })

  it("formats section line and block", () => {
    expect(formatSectionSavedEntriesLine(section)).toContain("Work experience (2)")
    expect(formatSectionSavedEntriesLine(section)).toContain("Acme")
    const block = formatSavedEntriesBlock([section])
    expect(block).toContain("Saved entries on page")
    expect(block).toContain("Only add attachment items")
  })

  it("snapshotFingerprints and formatLastSavedSummary", () => {
    expect(snapshotFingerprints(section.savedEntries)).toEqual(new Set(["a", "b"]))
    expect(formatLastSavedSummary(section.savedEntries[0])).toBe("2020-2021 | Acme | Engineer")
  })
})
