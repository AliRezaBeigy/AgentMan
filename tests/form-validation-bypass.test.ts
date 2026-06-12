import { describe, expect, it } from "vitest"

import { buildAddEntrySubmitScript } from "~/lib/form-validation-bypass"

describe("form-validation-bypass", () => {
  it("suppresses alert/confirm and HTML5 required during submit", () => {
    const script = buildAddEntrySubmitScript("#add-cvjob", "#add-cvjob button[type='submit']")
    expect(script).toContain("window.alert = () => {}")
    expect(script).toContain("form.noValidate = true")
    expect(script).toContain("removeAttribute(\"required\")")
    expect(script).toContain("setCustomValidity")
  })
})
