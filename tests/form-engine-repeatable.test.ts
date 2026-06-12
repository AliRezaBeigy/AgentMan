// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  detectRepeatableSections,
  ensureRepeatableRows
} from "~/contents/lib/form-engine"
import { getMaxRowIndexFromKeys } from "~/lib/fill-values"
import { mountExpenseReportForm } from "./fixtures/expense-report-dom"

afterEach(() => {
  document.body.innerHTML = ""
  vi.useRealTimers()
})

describe("expense report repeatable rows", () => {
  it("detects Add row with 4 existing rows", () => {
    mountExpenseReportForm(4)

    const sections = detectRepeatableSections()
    expect(sections).toHaveLength(1)
    expect(sections[0].addButtonLabel).toBe("Add row")
    expect(sections[0].rowCount).toBe(4)
  })

  it("clicks Add row four times when LLM returns Row 8 keys", async () => {
    const form = mountExpenseReportForm(4)
    expect(form.getRowCount()).toBe(4)

    const llmRowKeys = [
      "Row 1 - Date",
      "Row 8 - Date",
      "Row 8 - Description",
      "Row 8 - Amount"
    ]

    vi.useFakeTimers()
    const promise = ensureRepeatableRows(8, llmRowKeys)

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(250)
    }

    const result = await promise

    expect(result.added).toBe(4)
    expect(result.rowCount).toBe(8)
    expect(form.getAddRowClickCount()).toBe(4)
    expect(form.getRowCount()).toBe(8)
  })

  it("derives minRows only from LLM Row keys, not the user message", () => {
    const llmKeys = ["Report name", "Row 1 - Date", "Row 8 - Amount"]
    expect(getMaxRowIndexFromKeys(llmKeys)).toBe(8)
    expect(getMaxRowIndexFromKeys(["Report name", "Row 4 - Amount"])).toBe(4)
  })
})
