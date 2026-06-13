import { describe, expect, it } from "vitest"

import {
  assistantTurnNeedsToolFollowUp,
  assistantClaimsTaskComplete,
  buildAgentFormContextNote,
  buildPrematureDoneRejection,
  filterAddEntrySectionsForIntent,
  filterFieldsForIntent,
  shouldDelegateFillToAgent
} from "~/lib/page-form-context"
import type { FormFieldDescriptor, PageContext } from "~/lib/types"

const fields: FormFieldDescriptor[] = [
  { selector: "#job-title", label: "Work experience - Title", type: "text" },
  { selector: "#job-company", label: "Work experience - Employer", type: "text" },
  { selector: "#full-name", label: "Personal details - Full name", type: "text" }
]

const pageContext: PageContext = {
  url: "https://example.com/apply",
  title: "Apply",
  textSummary: "",
  fields,
  repeatableSections: [],
  addEntrySections: [
    {
      sectionLabel: "Work experience",
      addButtonSelector: "#add-experience-btn",
      addButtonLabel: "Add work experience",
      formSelector: "#experience-form",
      submitSelector: "#experience-form button[type='submit']",
      cancelButtonSelector: "#experience-form .btn-cancel",
      fieldLabels: ["Work experience - Title", "Work experience - Employer"],
      entryCount: 0,
      savedEntries: []
    },
    {
      sectionLabel: "Language",
      addButtonSelector: "#add-language-btn",
      addButtonLabel: "Add language",
      formSelector: "#language-form",
      submitSelector: "#language-form button[type='submit']",
      fieldLabels: [],
      entryCount: 0,
      savedEntries: []
    }
  ],
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 }
}

describe("page-form-context", () => {
  it("scopes fields to sections mentioned in the user message", () => {
    const scoped = filterFieldsForIntent(
      fields,
      "add the work experience from my CV",
      pageContext.addEntrySections
    )
    expect(scoped).toHaveLength(2)
    expect(scoped.every((f) => f.label?.startsWith("Work experience"))).toBe(true)
  })

  it("delegates fill to agent when Add-entry sections match a partial request", () => {
    expect(
      shouldDelegateFillToAgent(pageContext, "add the work experience\n\n[Attached: cv.txt]")
    ).toBe(true)
  })

  it("excludes unrelated add-entry sections from agent context", () => {
    const note = buildAgentFormContextNote(pageContext, "add the work and education")
    expect(note).toContain("Work experience")
    expect(note).not.toContain("Add language")
    expect(filterAddEntrySectionsForIntent(pageContext.addEntrySections, "add work", fields)).toHaveLength(1)
  })

  it("detects when the model narrates the next step without tools", () => {
    expect(
      assistantTurnNeedsToolFollowUp(
        "Now I'll continue with the third entry. Let me fill this in."
      )
    ).toBe(true)
    expect(assistantTurnNeedsToolFollowUp("All work and education entries have been added.")).toBe(
      false
    )
    expect(
      assistantClaimsTaskComplete(
        "I've successfully added all 7 work experience entries and both education entries from your application."
      )
    ).toBe(true)
    expect(
      assistantTurnNeedsToolFollowUp(
        "I've successfully added all 7 work experience entries and both education entries from your application."
      )
    ).toBe(false)
  })

  it("rejects done when targeted sections have no saved entries on page", () => {
    const workWithSaved = {
      ...pageContext.addEntrySections[0],
      entryCount: 1,
      savedEntries: [{ fingerprint: "w1", summary: "Engineer @ Acme" }]
    }
    const educationSection = {
      sectionLabel: "Education",
      addButtonSelector: "#add-education",
      addButtonLabel: "Add education",
      formSelector: "#education-form",
      submitSelector: "#education-form button[type='submit']",
      fieldLabels: ["Education - Title"],
      entryCount: 0,
      savedEntries: []
    }
    const sections = [workWithSaved, educationSection]
    const counts = new Map([["Work experience", 1]])

    const rejection = buildPrematureDoneRejection(
      "add the work and education",
      counts,
      sections,
      fields
    )
    expect(rejection).toContain("Education")
    expect(rejection).toContain("Do not call done")
  })

  it("does not delegate when the user targets the whole form", () => {
    const wholeForm = {
      ...pageContext,
      fields: fields.slice(0, 2)
    }
    expect(shouldDelegateFillToAgent(wholeForm, "fill work experience title and employer")).toBe(
      false
    )
  })
})
