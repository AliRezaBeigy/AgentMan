import { describe, expect, it } from "vitest"

import {
  allFieldsBelongToSection,
  getSectionFillableFields,
  resolveFillFieldMappings,
  resolveFillFieldSelector
} from "~/lib/fill-selector-resolve"
import type { FormFieldDescriptor, PageContext } from "~/lib/types"

const educationFields: FormFieldDescriptor[] = [
  {
    tag: "input",
    type: "text",
    id: "education_field",
    selector: '[data-agentman-field-key="Education - Field of education"]',
    label: "Education - Field of education"
  },
  {
    tag: "input",
    type: "text",
    id: "education-name",
    selector: '[data-agentman-field-key="Education - Education name"]',
    label: "Education - Education name"
  },
  {
    tag: "select",
    type: "select",
    id: "education-country",
    selector: '[data-agentman-field-key="Education - Country"]',
    label: "Education - Country"
  }
]

const pageContext: PageContext = {
  url: "https://example.com",
  title: "Test",
  fields: educationFields,
  addEntrySections: [
    {
      sectionLabel: "Education",
      addButtonSelector: "button.add-edu",
      addButtonLabel: "Add education",
      formSelector: "#add-cveducation",
      submitSelector: "#add-cveducation button[type='submit']",
      fieldLabels: educationFields.map((f) => f.label!),
      entryCount: 0,
      savedEntries: []
    }
  ]
}

const workFields: FormFieldDescriptor[] = [
  {
    tag: "input",
    type: "text",
    id: "cvjob-position",
    selector: '[data-agentman-field-key="Work experience - Title"]',
    label: "Work experience - Title"
  },
  {
    tag: "input",
    type: "text",
    id: "cvjob-company",
    selector: '[data-agentman-field-key="Work experience - Employer"]',
    label: "Work experience - Employer"
  },
  {
    tag: "input",
    type: "text",
    id: "cvjob-town",
    selector: '[data-agentman-field-key="Work experience - City"]',
    label: "Work experience - City"
  }
]

const workPageContext: PageContext = {
  url: "https://example.com",
  title: "Test",
  fields: workFields,
  addEntrySections: [
    {
      sectionLabel: "Work experience",
      addButtonSelector: "button.add-work",
      addButtonLabel: "Add work experience",
      formSelector: "#add-cvjob",
      submitSelector: "#add-cvjob button[type='submit']",
      fieldLabels: workFields.map((f) => f.label!),
      entryCount: 0,
      savedEntries: []
    }
  ]
}

describe("fill-selector-resolve", () => {
  it("keeps canonical data-agentman selectors", () => {
    expect(
      resolveFillFieldSelector(educationFields[0].selector, educationFields)
    ).toBe(educationFields[0].selector)
  })

  it("maps guessed education ids to canonical selectors", () => {
    expect(resolveFillFieldSelector("#education_field", educationFields)).toBe(
      educationFields[0].selector
    )
    expect(resolveFillFieldSelector("#cveducation-fieldofstudy", educationFields)).toBe(
      educationFields[0].selector
    )
  })

  it("does not remap work selectors into education section", () => {
    const resolved = resolveFillFieldMappings(
      [{ selector: "#cvjob-position", value: "Engineer" }],
      pageContext,
      "Education"
    )
    expect(resolved[0].selector).toBe("#cvjob-position")
  })

  it("maps guessed element ids to canonical selectors via label matching", () => {
    expect(resolveFillFieldSelector("#cvjob-employer", workFields)).toBe(
      workFields[1].selector
    )
    expect(resolveFillFieldSelector("#cvjob-city", workFields)).toBe(workFields[2].selector)
  })

  it("requires all resolved fields to belong to section", () => {
    const mixed = resolveFillFieldMappings(
      [
        { selector: "#cvjob-position", value: "Engineer" },
        { selector: "#cvjob-employer", value: "Acme" }
      ],
      workPageContext,
      "Work experience"
    )
    expect(allFieldsBelongToSection(mixed, "Work experience", workPageContext)).toBe(true)
  })

  it("lists section fields for hints", () => {
    expect(getSectionFillableFields(pageContext, "Education")).toHaveLength(3)
  })
})
