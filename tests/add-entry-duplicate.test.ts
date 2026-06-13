import { describe, expect, it } from "vitest"

import {
  buildDuplicateEntryMessage,
  findDuplicateSavedEntry,
  savedEntryMatchesFillTokens
} from "~/lib/add-entry-duplicate"
import type { AddEntrySavedEntry, FormFieldDescriptor, PageContext } from "~/lib/types"

const workFields: FormFieldDescriptor[] = [
  {
    selector: "#title",
    tag: "input",
    type: "text",
    label: "Work experience - Title",
    id: "title"
  },
  {
    selector: "#company",
    tag: "input",
    type: "text",
    label: "Work experience - Employer",
    id: "company"
  }
]

const pageContext: PageContext = {
  url: "https://example.com",
  title: "Apply",
  fields: workFields,
  addEntrySections: []
}

const saved: AddEntrySavedEntry[] = [
  {
    fingerprint: "1",
    summary: "2019 - 2019 Web Developer Basirat Research Center Tehran IR Edit"
  },
  {
    fingerprint: "2",
    summary: "2018 - 2022 Bachelor Kharazmi University Tehran IR Edit"
  }
]

describe("add-entry-duplicate", () => {
  it("matches saved rows by employer and title tokens", () => {
    expect(
      savedEntryMatchesFillTokens(saved[0], ["web developer", "basirat research center"])
    ).toBe(true)
  })

  it("blocks fill that duplicates an existing saved entry", () => {
    const duplicate = findDuplicateSavedEntry(
      [
        { selector: "#title", value: "Web Developer" },
        { selector: "#company", value: "Basirat Research Center" }
      ],
      pageContext,
      "Work experience",
      saved
    )
    expect(duplicate?.summary).toContain("Basirat")
    expect(buildDuplicateEntryMessage("Work experience", duplicate!)).toContain("Duplicate")
  })

  it("allows fill when tokens do not match saved rows", () => {
    const duplicate = findDuplicateSavedEntry(
      [
        { selector: "#title", value: "New Role" },
        { selector: "#company", value: "New Corp" }
      ],
      pageContext,
      "Work experience",
      saved
    )
    expect(duplicate).toBeNull()
  })
})
