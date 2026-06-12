import { describe, expect, it } from "vitest"

import { pruneInvalidFillKeys } from "~/lib/fill-intent"

describe("fill-intent", () => {
  it("prunes item1..itemN keys from merged values", () => {
    const merged = {
      "Report name": "Test",
      item1: "Headphones",
      item2: "Case",
      "Row 1 - Date": "2024-01-01"
    }
    pruneInvalidFillKeys(merged)
    expect(merged).toEqual({
      "Report name": "Test",
      "Row 1 - Date": "2024-01-01"
    })
  })
})
