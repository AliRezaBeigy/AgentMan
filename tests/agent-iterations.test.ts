import { describe, expect, it } from "vitest"

import {
  clampAgentIterationLimit,
  formatAgentIterationLimit,
  isUnlimitedAgentIterations,
  UNLIMITED_AGENT_ITERATIONS
} from "~/lib/agent-iterations"
import { estimateDelegatedAgentIterations } from "~/lib/page-form-context"
import type { PageContext } from "~/lib/types"

describe("agent-iterations", () => {
  it("treats zero as unlimited", () => {
    expect(isUnlimitedAgentIterations(0)).toBe(true)
    expect(isUnlimitedAgentIterations(-1)).toBe(true)
    expect(isUnlimitedAgentIterations(100)).toBe(false)
  })

  it("formats limits for display", () => {
    expect(formatAgentIterationLimit(0)).toBe("Unlimited")
    expect(formatAgentIterationLimit(120)).toBe("120")
  })

  it("clamps finite limits", () => {
    expect(clampAgentIterationLimit(0)).toBe(UNLIMITED_AGENT_ITERATIONS)
    expect(clampAgentIterationLimit(500)).toBe(500)
    expect(clampAgentIterationLimit(0.5)).toBe(1)
    expect(clampAgentIterationLimit(999_999)).toBe(100_000)
  })
})

describe("estimateDelegatedAgentIterations unlimited", () => {
  it("returns unlimited when base limit is unlimited", () => {
    const pageContext: PageContext = {
      url: "https://example.com",
      title: "Test",
      textSummary: "",
      fields: [],
      repeatableSections: [],
      addEntrySections: [
        {
          sectionLabel: "Work experience",
          addButtonSelector: "#add",
          addButtonLabel: "Add",
          formSelector: "#form",
          submitSelector: "#save",
          fieldLabels: ["Work experience - Title"],
          entryCount: 0,
          savedEntries: []
        }
      ],
      viewport: { width: 1, height: 1, scrollX: 0, scrollY: 0 }
    }

    expect(estimateDelegatedAgentIterations(pageContext, "add work", 0)).toBe(0)
  })
})
