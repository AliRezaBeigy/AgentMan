import { describe, expect, it } from "vitest"

import {
  buildFillInstruction,
  buildMissingFieldHints,
  extractJsonValue,
  fieldFillKey,
  getFillableFields,
  getMissingFillKeys,
  mergeFillObject,
  parseFillMappings
} from "~/lib/fill-parse"
import { contactFormFields, expenseFormFields } from "./fixtures/form-fields"

describe("fill-parse", () => {
  it("skips file inputs when listing fillable fields", () => {
    const fillable = getFillableFields(contactFormFields)
    expect(fillable.some((f) => f.isFileInput)).toBe(false)
    expect(fillable).toHaveLength(contactFormFields.length - 1)
  })

  it("uses label as fill key", () => {
    const field = contactFormFields[0]
    expect(fieldFillKey(field, 0)).toBe("Contact name")
  })

  it("extracts JSON from markdown fences", () => {
    const parsed = extractJsonValue('Here is data:\n```json\n{"Contact name":"Ada Lovelace"}\n```')
    expect(parsed).toEqual({ "Contact name": "Ada Lovelace" })
  })

  it("maps label-keyed JSON to selectors", () => {
    const mappings = parseFillMappings(
      JSON.stringify({
        "Contact name": "Ada Lovelace",
        Company: "Analytical Engines Ltd",
        "Job title": "Mathematician",
        Email: "ada@example.com",
        Phone: "555-0100",
        "Lead source": "Referral",
        Priority: "High",
        Notes: "Interested in collaboration"
      }),
      contactFormFields
    )

    const bySelector = new Map(mappings.map((m) => [m.selector, m.value]))
    expect(bySelector.get("#nc-name")).toBe("Ada Lovelace")
    expect(bySelector.get("#nc-email")).toBe("ada@example.com")
    expect(bySelector.get("#nc-source")).toBe("referral")
    expect(bySelector.get('[data-agentman-field-key="Priority"]')).toBe("High")
  })

  it("expands firstName/lastName into Contact name", () => {
    const mappings = parseFillMappings(
      JSON.stringify({
        firstName: "Grace",
        lastName: "Hopper",
        Email: "grace@example.com"
      }),
      contactFormFields
    )

    expect(mappings.find((m) => m.selector === "#nc-name")?.value).toBe("Grace Hopper")
  })

  it("strips dollar signs from amount fields", () => {
    const mappings = parseFillMappings(
      JSON.stringify({
        "Row 1 - Amount": "$42.50"
      }),
      expenseFormFields
    )

    expect(mappings.find((m) => m.selector.includes("Row 1 - Amount"))?.value).toBe("42.50")
  })

  it("accepts combobox values without option list", () => {
    const mappings = parseFillMappings(
      JSON.stringify({
        Department: "Engineering"
      }),
      expenseFormFields
    )

    expect(mappings.find((m) => m.selector === "#er-dept")?.value).toBe("Engineering")
  })

  it("merges partial objects across retry attempts", () => {
    const accumulated: Record<string, unknown> = {}
    mergeFillObject(accumulated, { "Contact name": "Ada" })
    mergeFillObject(accumulated, { Email: "ada@example.com" })
    expect(accumulated).toEqual({
      "Contact name": "Ada",
      Email: "ada@example.com"
    })
  })

  it("reports missing fill keys", () => {
    const fillable = getFillableFields(contactFormFields)
    const accumulated = new Map([["#nc-name", { selector: "#nc-name", value: "Ada" }]])
    const missing = getMissingFillKeys(fillable, accumulated)
    expect(missing).not.toContain("Contact name")
    expect(missing).toContain("Email")
  })

  it("builds hints for select fields with options", () => {
    const fillable = getFillableFields(contactFormFields)
    const hints = buildMissingFieldHints(fillable, ["Lead source", "Priority"])
    expect(hints).toContain("Lead source")
    expect(hints).toContain("Website")
    expect(hints).toContain("High")
  })

  it("includes exact property names in fill instruction", () => {
    const instruction = buildFillInstruction(contactFormFields)
    expect(instruction).toContain('"Contact name"')
    expect(instruction).toContain('"Lead source"')
    expect(instruction).toContain("JSON only")
  })

  it("tells the LLM that Row keys drive row creation, not parsed user counts", () => {
    const instruction = buildFillInstruction(
      expenseFormFields,
      [{ addButtonSelector: "[data-add]", addButtonLabel: "Add row", sectionSelector: ".x", rowCount: 4 }]
    )
    expect(instruction).toContain("YOU decide how many rows")
    expect(instruction).toContain("Extra DOM rows are created ONLY from your Row N keys")
    expect(instruction).toContain("Add row")
  })
})
