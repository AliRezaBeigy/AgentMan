import { describe, expect, it } from "vitest"

import {
  extractFillFieldsFromToolArguments,
  markFieldFilled
} from "~/lib/fill-sequential"

describe("fill-sequential", () => {
  it("extracts fields from native tool argument objects", () => {
    const args = {
      fields: [
        { selector: "work:title", value: "Engineer" },
        { selector: "work:employer", value: "Acme" }
      ]
    }
    const filled = new Map<string, string>()
    expect(extractFillFieldsFromToolArguments(args, filled)).toHaveLength(2)

    markFieldFilled(filled, "work:title", "[data-agentman-field-key=\"Work experience - Title\"]", "Engineer")
    expect(extractFillFieldsFromToolArguments(args, filled)).toHaveLength(1)
  })

  it("extracts fields from partial JSON strings", () => {
    const partial =
      '{"fields":[{"selector":"work:title","value":"Engineer"},{"selector":"work:employer","value":"Acme"}]}'
    expect(extractFillFieldsFromToolArguments(partial)).toHaveLength(2)
  })
})
