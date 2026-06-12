import { describe, expect, it } from "vitest"

import { normalizeToolArguments, parseFillFieldsArg } from "~/lib/tool-args"

describe("tool-args", () => {
  it("parses fill_fields when fields is a JSON string", () => {
    const raw = JSON.stringify([
      { selector: "#title", value: "Engineer" },
      { selector: "#company", value: "Acme" }
    ])
    const fields = parseFillFieldsArg(raw)
    expect(fields).toHaveLength(2)
    expect(fields[0].value).toBe("Engineer")
  })

  it("normalizes stringified tool arguments", () => {
    const args = normalizeToolArguments(
      JSON.stringify({ selector: "#title", value: "Engineer" })
    )
    expect(args.selector).toBe("#title")
  })

  it("parses qwen-style broken JSON with agentman field keys", () => {
    const raw = String.raw`[{"selector":"[data-agentman-field-key=\"Work experience - Title\"]","value":"Teaching Assistant (Advanced Programming)"},{"selector":"[data-agentman-field-key=\"Work experience - Employer\"]","value":"Dr. Azadeh Mansouri"},{"selector":"[data-agentman-field-key=\"Work experience - Country\"]","value\":\"SE\"}]`

    const fields = parseFillFieldsArg(raw)
    expect(fields.length).toBeGreaterThanOrEqual(2)
    expect(fields[0].selector).toContain("Work experience - Title")
    expect(fields[0].value).toContain("Teaching Assistant")
  })

  it("extracts pairs from exact qwen tool-call string payloads", () => {
    const raw =
      '[{"selector":"[data-agentman-field-key=\\"Work experience - Title\\"]","value":"Teaching Assistant (Advanced Programming)"},{"selector":"[data-agentman-field-key=\\"Work experience - City\\"]","value":"Tehran"},{"selector":"[data-agentman-field-key=\\"Work experience - Country\\"]","value\\":\\"SE\\"}]'

    const fields = parseFillFieldsArg(raw)
    expect(fields.length).toBeGreaterThanOrEqual(3)
    expect(fields.find((f) => f.value === "Tehran")?.selector).toContain("City")
  })
})
