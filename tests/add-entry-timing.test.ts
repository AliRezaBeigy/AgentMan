// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  buildFormClosedCheckExpression,
  buildFormReadyCheckExpression,
  canonicalizeShowAddnewSkillSelector,
  evaluateAddEntryCheck,
  inferAddEntrySectionFromText,
  isBrokenSelector,
  resolveAddEntryClickTarget,
  resolveAddEntryOpenClickSelector,
  resolveAgentClickArgs
} from "~/lib/add-entry-timing"
import type { AddEntrySectionDescriptor } from "~/lib/types"
import { mountAddEntrySectionForm } from "./fixtures/add-entry-section-dom"

const section: AddEntrySectionDescriptor = {
  sectionLabel: "Work experience",
  addButtonSelector: "#add-experience-btn",
  addButtonLabel: "Add work experience",
  formSelector: "#experience-form",
  submitSelector: "#experience-form button[type='submit']",
  cancelButtonSelector: "#experience-form .btn-cancel",
  fieldLabels: ["Work experience - Title", "Work experience - Employer"],
  entryCount: 0
}

describe("add-entry-timing", () => {
  beforeEach(() => {
    mountAddEntrySectionForm()
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("resolves add-button, form, and submit click targets", () => {
    expect(resolveAddEntryClickTarget("#add-experience-btn", [section])?.kind).toBe("open")
    expect(resolveAddEntryClickTarget("#experience-form", [section])?.kind).toBe("open")
    expect(
      resolveAddEntryClickTarget("#experience-form button[type='submit']", [section])?.kind
    ).toBe("submit")
    expect(resolveAddEntryClickTarget("#full-name", [section])).toBeNull()
  })

  it("builds ready/closed expressions from section selectors", () => {
    const readyExpr = buildFormReadyCheckExpression(section)
    const closedExpr = buildFormClosedCheckExpression(section)

    expect(readyExpr).toContain("#experience-form")
    expect(readyExpr).toContain("button[type='submit']")
    expect(closedExpr).toContain("button[type='submit']")

    const collapse = document.querySelector(".collapse") as HTMLElement
    collapse.style.display = "none"
    expect(evaluateAddEntryCheck(document, closedExpr)).toBe(true)
  })

  it("detects broken onclick selectors", () => {
    expect(isBrokenSelector("button[onclick*='")).toBe(true)
    expect(isBrokenSelector("button[onclick*=\"showAddnewSkill('cvjob')\"]")).toBe(false)
  })

  it("canonicalizes showAddnewSkill from malformed text", () => {
    const canonical = canonicalizeShowAddnewSkillSelector(
      `"selector": "button[onclick*="showAddnewSkill('cvjob')"]"`
    )
    expect(canonical).toBe(`button[onclick*="showAddnewSkill('cvjob')"]`)
  })

  it("resolves section-based and broken click args to the Add button", () => {
    const varbiSections: AddEntrySectionDescriptor[] = [
      {
        ...section,
        sectionLabel: "Work experience",
        formSelector: "#add-cvjob",
        addButtonSelector: "button[onclick*=\"showAddnewSkill('cvjob')\"]",
        submitSelector: "#add-cvjob button[type='submit']"
      }
    ]

    const bySection = resolveAgentClickArgs({ section: "Work experience" }, varbiSections)
    expect(bySection.clickTarget?.kind).toBe("open")
    expect(bySection.selector).toContain("showAddnewSkill")

    const broken = resolveAgentClickArgs(
      { selector: "button[onclick*='" },
      varbiSections,
      `"selector": "button[onclick*="showAddnewSkill('cvjob')"]"`
    )
    expect(broken.selector).toContain("cvjob")
    expect(
      inferAddEntrySectionFromText("showAddnewSkill('cvjob')", varbiSections)?.sectionLabel
    ).toBe("Work experience")
  })

  it("redirects form id clicks to the real Add button", () => {
    const varbiSection: AddEntrySectionDescriptor = {
      ...section,
      formSelector: "#add-cvjob",
      addButtonSelector: "button[onclick*=\"showAddnewSkill('cvjob')\"]",
      submitSelector: "#add-cvjob button[type='submit']"
    }

    expect(resolveAddEntryOpenClickSelector("#add-cvjob", varbiSection)).toBe(
      "button[onclick*=\"showAddnewSkill('cvjob')\"]"
    )
    expect(resolveAddEntryOpenClickSelector("#add-experience-btn", section)).toBe(
      "#add-experience-btn"
    )
  })

  it("matches Varbi-style form id clicks as open actions", () => {
    const varbiSection: AddEntrySectionDescriptor = {
      ...section,
      formSelector: "#add-cvjob",
      addButtonSelector: "button[onclick*=\"showAddnewSkill('cvjob')\"]",
      submitSelector: "#add-cvjob button[type='submit']"
    }

    expect(resolveAddEntryClickTarget("#add-cvjob", [varbiSection])?.kind).toBe("open")
    expect(
      resolveAddEntryClickTarget("button[onclick*=\"showAddnewSkill('cvjob')\"]", [varbiSection])
        ?.kind
    ).toBe("open")
  })
})
