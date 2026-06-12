import { beforeAll, describe, expect, it } from "vitest"

import {
  buildFillInstruction,
  extractJsonValue,
  getFillableFields,
  parseFillMappings
} from "~/lib/fill-parse"
import { getMaxRowIndexFromKeys } from "~/lib/fill-values"
import { chat } from "~/lib/ollama/client"
import {
  buildExpenseFormFields,
  buildExpenseRepeatableSection,
  expenseRowFieldLabels
} from "./fixtures/expense-form-fields"
import { loadOllamaTestContext, OLLAMA_HOST, type OllamaTestContext } from "./helpers/ollama"

let ctx: OllamaTestContext

beforeAll(async () => {
  ctx = await loadOllamaTestContext()
})

describe("Ollama expense report — 8 random items", () => {
  it("returns Row 1–8 keys so fill mode adds four rows", async () => {
    if (!ctx.available) {
      console.warn(`Skipping: ${ctx.skipReason}`)
      return
    }

    const initialRowCount = 4
    const targetItems = 8
    const userPrompt = "fill the form with random data of eight item for receipt"
    const fieldsOnPage = buildExpenseFormFields(initialRowCount)
    const repeatableSections = buildExpenseRepeatableSection(initialRowCount)

    const system = buildFillInstruction(fieldsOnPage, repeatableSections)
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

    const parsed = extractJsonValue(result.content) as Record<string, unknown> | null
    expect(parsed).not.toBeNull()

    const keys = Object.keys(parsed!)
    const minRows = getMaxRowIndexFromKeys(keys)
    expect(minRows).toBeGreaterThanOrEqual(targetItems)

    const rowsToAdd = Math.max(0, minRows - initialRowCount)
    expect(rowsToAdd).toBe(4)

    const fieldsAfterAdd = buildExpenseFormFields(targetItems)
    const mappings = parseFillMappings(result.content, fieldsAfterAdd)
    const filledRowLabels = new Set(
      mappings.map((m) => fieldsAfterAdd.find((f) => f.selector === m.selector)?.label).filter(Boolean)
    )

    for (const label of expenseRowFieldLabels(targetItems)) {
      expect(
        filledRowLabels.has(label),
        `missing "${label}" — raw: ${result.content.slice(0, 500)}`
      ).toBe(true)
    }

    const fillable = getFillableFields(fieldsAfterAdd)
    expect(fillable).toHaveLength(3 + targetItems * 4)
  })
})
