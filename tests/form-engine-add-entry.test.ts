// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest"

import { detectAddEntrySections, detectFormFields } from "~/contents/lib/form-engine"
import { mountAddEntrySectionForm } from "./fixtures/add-entry-section-dom"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("generic add-entry sections", () => {
  it("detects Add-button sub-forms from page structure", () => {
    mountAddEntrySectionForm()
    const sections = detectAddEntrySections()
    expect(sections).toHaveLength(1)
    expect(sections[0].sectionLabel).toBe("Work experience")
    expect(sections[0].addButtonLabel).toContain("Add work experience")
    expect(sections[0].formSelector).toBe("#experience-form")
    expect(sections[0].cancelButtonSelector).toContain("btn-cancel")
  })

  it("prefixes field labels with the nearest section heading", () => {
    mountAddEntrySectionForm()
    const form = document.querySelector("#experience-form")!
    const fields = detectFormFields(form)
    expect(fields.find((f) => f.id === "job-title")?.label).toBe("Work experience - Title")
  })

  it("detects saved entries already on the page", () => {
    mountAddEntrySectionForm()
    const sections = detectAddEntrySections()
    expect(sections).toHaveLength(1)
    expect(sections[0].entryCount).toBe(2)
    expect(sections[0].savedEntries).toHaveLength(2)
    expect(sections[0].savedEntries[0].fingerprint).toBe("exp-1")
    expect(sections[0].savedEntries[0].summary).toContain("Acme Corp")
    expect(sections[0].entriesListSelector).toBe("#experience-list")
  })
})
