import { describe, expect, it } from "vitest"

import {
  extractCompleteFillFieldsFromStream,
  extractCompleteFillObjectEntriesFromStream,
  filterFieldsNotYetFilled
} from "~/lib/streaming-fill"

describe("streaming-fill", () => {
  it("extracts complete field pairs from a partial stream", () => {
    const partial = `\`\`\`json
{
  "action": "fill_fields",
  "fields": [
    {"selector": "[data-agentman-field-key=\\"Work experience - Title\\"]", "value": "TA"},
    {"selector": "[data-agentman-field-key=\\"Work experience - Employer\\"]", "value": "SSE"
`
    const filled = new Map<string, string>()
    const first = extractCompleteFillFieldsFromStream(partial, filled)
    expect(first).toHaveLength(1)
    expect(first[0].value).toBe("TA")

    filled.set(first[0].selector, first[0].value)
    const second = `\`\`\`json
{
  "action": "fill_fields",
  "fields": [
    {"selector": "[data-agentman-field-key=\\"Work experience - Title\\"]", "value": "TA"},
    {"selector": "[data-agentman-field-key=\\"Work experience - Employer\\"]", "value": "SSE"}
  ]
}`
    const next = extractCompleteFillFieldsFromStream(second, filled)
    expect(next).toHaveLength(1)
    expect(next[0].value).toBe("SSE")
  })

  it("skips fields already filled with the same value", () => {
    const content =
      '{"action":"fill_fields","fields":[{"selector":"#a","value":"1"},{"selector":"#a","value":"1"}]}'
    const filled = new Map([["#a", "1"]])
    expect(extractCompleteFillFieldsFromStream(content, filled)).toHaveLength(0)
  })

  it("filters remaining fields for batch fill", () => {
    const remaining = filterFieldsNotYetFilled(
      [
        { selector: "#a", value: "1" },
        { selector: "#b", value: "2" }
      ],
      new Map([["#a", "1"]])
    )
    expect(remaining).toEqual([{ selector: "#b", value: "2" }])
  })

  it("extracts complete flat object keys from a partial fill stream", () => {
    const partial = `{"Full name": "Ada Lovelace", "Email": "ada@`
    const applied = new Set<string>()
    const allowed = new Set(["Full name", "Email", "Company"])
    const first = extractCompleteFillObjectEntriesFromStream(partial, applied, allowed)
    expect(first).toEqual([{ key: "Full name", value: "Ada Lovelace" }])

    applied.add("Full name")
    const complete = `{"Full name": "Ada Lovelace", "Email": "ada@example.com"}`
    const second = extractCompleteFillObjectEntriesFromStream(complete, applied, allowed)
    expect(second).toEqual([{ key: "Email", value: "ada@example.com" }])
  })
})
