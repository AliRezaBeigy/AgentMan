import { describe, expect, it } from "vitest"
import {
  buildShowAddnewSkillOpenExpression,
  extractShowAddnewSkillType
} from "~/lib/add-entry-open"
import type { AddEntrySectionDescriptor } from "~/lib/types"

describe("add-entry-open", () => {
  const section: AddEntrySectionDescriptor = {
    sectionLabel: "Work experience",
    addButtonLabel: "Add work experience",
    addButtonSelector: 'button[onclick*="showAddnewSkill(\'cvjob\')"]',
    submitSelector: '#add-cvjob button[type="submit"]',
    cancelButtonSelector: '#add-cvjob button[type="button"]',
    formReadySelector: "#add-cvjob:not(.hidden)",
    formClosedSelector: "#add-cvjob.hidden"
  }

  it("extracts showAddnewSkill type from add button selector", () => {
    expect(extractShowAddnewSkillType(section)).toBe("cvjob")
    expect(
      extractShowAddnewSkillType({
        ...section,
        addButtonSelector: 'button[onclick*="showAddnewSkill(\'cveducation\')"]'
      })
    ).toBe("cveducation")
  })

  it("builds open expression that prefers showAddnewSkill", () => {
    const expr = buildShowAddnewSkillOpenExpression("cvjob", section.addButtonSelector)
    expect(expr).toContain('showAddnewSkill("cvjob")')
    expect(expr).toContain("document.querySelector")
  })
})
