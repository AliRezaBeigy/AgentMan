import { describe, expect, it } from "vitest"

import {
  getNextRequiredFillTarget,
  getSessionMissingRequiredFields,
  isFieldAlreadyFilled,
  seedFilledSelectorMap,
  buildRepeatFillMessage
} from "~/lib/fill-progress"
import type { FormFieldDescriptor } from "~/lib/types"

const sectionFields: FormFieldDescriptor[] = [
  {
    selector: "#title",
    label: "Work experience - Title",
    type: "text",
    required: true
  },
  {
    selector: "#employer",
    label: "Work experience - Employer",
    type: "text",
    required: true
  }
]

const aliasToSelector = new Map([
  ["work:title", "#title"],
  ["work:employer", "#employer"]
])

describe("fill-progress", () => {
  it("seeds alias keys from partial fills", () => {
    const map = seedFilledSelectorMap(new Map([["#title", "Engineer"]]), aliasToSelector)
    expect(map.get("#title")).toBe("Engineer")
    expect(map.get("work:title")).toBe("Engineer")
  })

  it("detects already-filled fields by alias or resolved selector", () => {
    const filled = seedFilledSelectorMap(new Map([["#title", "Engineer"]]), aliasToSelector)
    expect(isFieldAlreadyFilled("work:title", "#title", "Engineer", filled)).toBe(true)
    expect(isFieldAlreadyFilled("work:employer", "#employer", "Acme", filled)).toBe(false)
  })

  it("returns the next required unfilled alias", () => {
    const partial = new Map([["#title", "Engineer"]])
    const next = getNextRequiredFillTarget(sectionFields, partial, aliasToSelector)
    expect(next?.alias).toBe("work:employer")
  })

  it("ignores stale DOM values when picking the next session field", () => {
    const fieldsWithDomEmployer: FormFieldDescriptor[] = [
      { ...sectionFields[0]! },
      { ...sectionFields[1]!, value: "Old employer from DOM" }
    ]
    const partial = new Map([["#title", "Engineer"]])
    const missing = getSessionMissingRequiredFields(
      fieldsWithDomEmployer,
      partial,
      aliasToSelector
    )
    expect(missing).toHaveLength(1)
    expect(missing[0]?.selector).toBe("#employer")
    expect(getNextRequiredFillTarget(fieldsWithDomEmployer, partial, aliasToSelector)?.alias).toBe(
      "work:employer"
    )
  })

  it("builds a repeat-fill message pointing at the next alias", () => {
    const msg = buildRepeatFillMessage("work:title", {
      alias: "work:employer",
      label: "Work experience - Employer"
    })
    expect(msg).toContain("work:title")
    expect(msg).toContain("work:employer")
  })
})
