import { describe, expect, it } from "vitest"

import {
  buildFillFieldsSignature,
  findAddEntrySectionForFilledFields
} from "~/lib/add-entry-workflow"
import type { PageContext } from "~/lib/types"

const pageContext: PageContext = {
  url: "https://example.com",
  title: "Apply",
  textSummary: "",
  fields: [
    {
      selector: '[data-agentman-field-key="Work experience - Title"]',
      label: "Work experience - Title",
      type: "text"
    },
    {
      selector: '[data-agentman-field-key="Work experience - Employer"]',
      label: "Work experience - Employer",
      type: "text"
    },
    {
      selector: '[data-agentman-field-key="Work experience - City"]',
      label: "Work experience - City",
      type: "text"
    }
  ],
  repeatableSections: [],
  addEntrySections: [
    {
      sectionLabel: "Work experience",
      addButtonSelector: "#add-experience",
      addButtonLabel: "Add work experience",
      formSelector: "#experience-form",
      submitSelector: "#experience-form button[type='submit']",
      fieldLabels: [
        "Work experience - Title",
        "Work experience - Employer",
        "Work experience - City"
      ],
      entryCount: 0,
      savedEntries: []
    }
  ],
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 }
}

describe("add-entry-workflow", () => {
  it("matches filled selectors to an add-entry section", () => {
    const section = findAddEntrySectionForFilledFields(
      [
        { selector: '[data-agentman-field-key="Work experience - Title"]', value: "Engineer" },
        { selector: '[data-agentman-field-key="Work experience - Employer"]', value: "Acme" },
        { selector: '[data-agentman-field-key="Work experience - City"]', value: "Tehran" }
      ],
      pageContext
    )
    expect(section?.sectionLabel).toBe("Work experience")
  })

  it("detects duplicate fill signatures", () => {
    const fields = [{ selector: "#a", value: "1" }]
    const sig = buildFillFieldsSignature(fields)
    expect(buildFillFieldsSignature(fields)).toBe(sig)
    expect(buildFillFieldsSignature([{ selector: "#b", value: "2" }])).not.toBe(sig)
  })
})
