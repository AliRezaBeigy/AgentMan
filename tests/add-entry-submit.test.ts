import { describe, expect, it } from "vitest"

import { formatSubmitFailureMessage } from "~/background/add-entry-submit"

describe("add-entry-submit", () => {
  it("formats validation errors for the agent", () => {
    const message = formatSubmitFailureMessage({
      ok: false,
      validationErrors: ["Finished part: Please select an item in the list."]
    })
    expect(message).toContain("Finished part")
    expect(message).toContain("fill_fields")
  })
})
