import { describe, expect, it } from "vitest"

import {
  buildFillFieldAliasRegistry,
  resolveAliasSelector
} from "~/lib/fill-field-aliases"
import { resolveFillFieldMappings, resolveFillFieldSelector } from "~/lib/fill-selector-resolve"
import type { FormFieldDescriptor, PageContext } from "~/lib/types"

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
    name: "company",
    selector: '[data-agentman-field-key="Work experience - Employer"]',
    label: "Work experience - Employer"
  }
]

const pageContext: PageContext = {
  url: "https://example.com",
  title: "Test",
  fields: workFields,
  addEntrySections: [
    {
      sectionLabel: "Work experience",
      addButtonSelector: "button.add",
      addButtonLabel: "Add",
      formSelector: "#add-cvjob",
      submitSelector: "#add-cvjob button[type='submit']",
      fieldLabels: workFields.map((f) => f.label!)
    }
  ]
}

describe("fill-field-aliases", () => {
  it("builds compact aliases for prompt", () => {
    const { promptBlock, aliasToSelector } = buildFillFieldAliasRegistry(pageContext)
    expect(promptBlock).toContain("work:title;text")
    expect(promptBlock).toContain("work:employer;text")
    expect(aliasToSelector.get("work:title")).toBe(workFields[0].selector)
    expect(aliasToSelector.get("#cvjob-company")).toBe(workFields[1].selector)
  })

  it("resolves alias and id selectors before fill", () => {
    const { aliasToSelector } = buildFillFieldAliasRegistry(pageContext)
    expect(resolveAliasSelector("work:employer", aliasToSelector)).toBe(workFields[1].selector)
    expect(
      resolveFillFieldSelector("work:title", workFields, aliasToSelector)
    ).toBe(workFields[0].selector)
    expect(
      resolveFillFieldMappings(
        [{ selector: "work:employer", value: "Acme" }],
        pageContext,
        "Work experience",
        aliasToSelector
      )[0].selector
    ).toBe(workFields[1].selector)
  })
})
