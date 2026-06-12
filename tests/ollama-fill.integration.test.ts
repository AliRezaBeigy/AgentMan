import { beforeAll, describe, expect, it } from "vitest"

import {
  buildFillInstruction,
  getFillableFields,
  parseFillMappings
} from "~/lib/fill-parse"
import { chat } from "~/lib/ollama/client"
import { contactFormFields } from "./fixtures/form-fields"
import { loadOllamaTestContext, OLLAMA_HOST, type OllamaTestContext } from "./helpers/ollama"

let ctx: OllamaTestContext

beforeAll(async () => {
  ctx = await loadOllamaTestContext()
})

async function requestFillValues(userPrompt: string): Promise<string> {
  const fillable = getFillableFields(contactFormFields)
  const system = buildFillInstruction(contactFormFields)

  const result = await chat({
    host: OLLAMA_HOST,
    model: ctx.model,
    stream: false,
    format: "json",
    options: { temperature: 0 },
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt }
    ]
  })

  return result.content
}

describe("Ollama fill pipeline", () => {
  it("fills the contact form from label-keyed JSON", async () => {
    if (!ctx.available) {
      console.warn(`Skipping: ${ctx.skipReason}`)
      return
    }

    const raw = await requestFillValues(
      "Fill this sales lead form with realistic random demo data for a software company."
    )

    const mappings = parseFillMappings(raw, contactFormFields)
    const fillable = getFillableFields(contactFormFields)
    const filledSelectors = new Set(mappings.map((m) => m.selector))

    for (const field of fillable) {
      expect(
        filledSelectors.has(field.selector),
        `missing value for "${field.label ?? field.selector}" — raw: ${raw.slice(0, 400)}`
      ).toBe(true)
    }

    const email = mappings.find((m) => m.selector === "#nc-email")?.value
    expect(String(email)).toMatch(/@/)
  })

  it("respects select options for Lead source", async () => {
    if (!ctx.available) return

    const raw = await requestFillValues(
      'Set Lead source to "Referral" and Priority to "High". Use placeholder values for other fields.'
    )

    const mappings = parseFillMappings(raw, contactFormFields)
    const leadSource = mappings.find((m) => m.selector === "#nc-source")?.value
    const priority = mappings.find((m) => m.selector === '[data-agentman-field-key="Priority"]')?.value

    expect(leadSource).toBe("referral")
    expect(priority).toBe("High")
  })
})
