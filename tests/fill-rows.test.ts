import { describe, expect, it } from "vitest"

import {
  detectDuplicateFlatKeysInRaw,
  getMaxRowIndexFromFillData,
  normalizeFillResponse
} from "~/lib/fill-rows"
import { buildExpenseFormFields } from "./fixtures/expense-form-fields"

const fields = buildExpenseFormFields(4)

describe("fill-rows", () => {
  it("expands line_items array into Row N keys", () => {
    const normalized = normalizeFillResponse(
      {
        "Report name": "Q3 Expenses",
        line_items: [
          {
            Date: "2024-07-15",
            Description: "Supplies",
            Category: "Office",
            Amount: "$10"
          },
          {
            Date: "2024-07-16",
            Description: "Lunch",
            Category: "Meals",
            Amount: "$20"
          }
        ]
      },
      fields
    )

    expect(normalized?.["Row 1 - Date"]).toBe("2024-07-15")
    expect(normalized?.["Row 2 - Description"]).toBe("Lunch")
    expect(getMaxRowIndexFromFillData(normalized!)).toBe(2)
  })

  it("expands eight line_items to Row 8 for receipt fill", () => {
    const lineItems = Array.from({ length: 8 }, (_, i) => ({
      Date: `2024-07-${String(i + 1).padStart(2, "0")}`,
      Description: `Item ${i + 1}`,
      Category: "Meals",
      Amount: `${(i + 1) * 10}.00`
    }))

    const normalized = normalizeFillResponse(
      { "Report name": "Receipts", line_items: lineItems },
      fields
    )

    expect(getMaxRowIndexFromFillData(normalized!)).toBe(8)
    expect(normalized?.["Row 8 - Description"]).toBe("Item 8")
  })

  it("detects repeated bare Date keys in raw JSON", () => {
    const raw = `{
      "Date": "2024-07-15",
      "Description": "A",
      "Date": "2024-07-16",
      "Description": "B"
    }`
    expect(detectDuplicateFlatKeysInRaw(raw, ["Date", "Description", "Category", "Amount"])).toContain(
      "Date"
    )
  })

  it("promotes single bare column set to Row 1", () => {
    const normalized = normalizeFillResponse(
      {
        Date: "2024-07-15",
        Description: "One item",
        Amount: "12.00"
      },
      fields
    )

    expect(normalized?.["Row 1 - Date"]).toBe("2024-07-15")
    expect(normalized?.Date).toBeUndefined()
  })
})
