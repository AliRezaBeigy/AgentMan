import { describe, expect, it } from "vitest"

import { formatSubmitFailureMessage } from "~/background/add-entry-submit"

describe("add-entry-submit", () => {
  it("formats submit failure for the agent", () => {
    const message = formatSubmitFailureMessage({
      ok: false,
      error: "Submit clicked but the form did not close."
    })
    expect(message).toContain("form did not close")
  })
})
