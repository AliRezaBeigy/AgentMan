// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest"

import {
  restorePageValidation,
  suppressPageValidation
} from "~/contents/lib/validation-suppress"

afterEach(() => {
  restorePageValidation()
  restorePageValidation()
})

describe("validation-suppress", () => {
  it("noops alert and confirm while suppressed", () => {
    suppressPageValidation()
    expect(() => window.alert("missing city")).not.toThrow()
    expect(window.confirm("required?")).toBe(true)
    restorePageValidation()
  })
})
