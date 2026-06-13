import { describe, expect, it } from "vitest"

import { isAddEntryTaskComplete, getSectionEntryRemaining } from "~/lib/add-entry-completion"
import type { AddEntrySectionDescriptor } from "~/lib/types"

const sampleMessage = `
add work and education

[Attached: cv.md]
## Work Experience
### Job 1
### Job 2
## Education
### Master
### Bachelor
`

const sections: AddEntrySectionDescriptor[] = [
  {
    sectionLabel: "Work experience",
    addButtonSelector: "#add-work",
    addButtonLabel: "Add",
    formSelector: "#work-form",
    submitSelector: "#work-form button[type='submit']",
    fieldLabels: [],
    entryCount: 0,
    savedEntries: [
      { fingerprint: "w1", summary: "Job 1" },
      { fingerprint: "w2", summary: "Job 2" }
    ]
  },
  {
    sectionLabel: "Education",
    addButtonSelector: "#add-edu",
    addButtonLabel: "Add",
    formSelector: "#edu-form",
    submitSelector: "#edu-form button[type='submit']",
    fieldLabels: [],
    entryCount: 0,
    savedEntries: [
      { fingerprint: "e1", summary: "Master at Uni" },
      { fingerprint: "e2", summary: "Bachelor at School" }
    ]
  }
]

describe("add-entry-completion", () => {
  it("detects task complete when saved counts match attachment", () => {
    expect(isAddEntryTaskComplete(sampleMessage, sections)).toBe(true)
  })

  it("reports remaining items when under target", () => {
    const partial = [
      {
        ...sections[0],
        savedEntries: [{ fingerprint: "w1", summary: "Job 1" }]
      },
      sections[1]
    ]
    const remaining = getSectionEntryRemaining(sampleMessage, partial)
    expect(remaining.find((item) => item.sectionLabel === "Work experience")?.remaining).toBe(1)
    expect(isAddEntryTaskComplete(sampleMessage, partial)).toBe(false)
  })
})
