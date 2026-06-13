import { describe, expect, it } from "vitest"
import {
  compactToolResultForAgent,
  formatAgentToolResultMessage
} from "~/lib/agent-tool-messages"

describe("compactToolResultForAgent", () => {
  it("strips large fill_fields payload but keeps addEntry summary", () => {
    const compact = compactToolResultForAgent("fill_fields", {
      ok: true,
      result: {
        filled: 5,
        skipped: 1,
        results: Array.from({ length: 20 }, (_, i) => ({ ok: true, selector: `#f${i}` })),
        addEntry: {
          submitted: true,
          openedNext: true,
          sectionLabel: "Work experience",
          entryNumber: 2,
          nextStep: "Fill entry 2",
          entryAdded: true,
          savedCount: 2,
          sessionAdded: 1,
          lastSavedSummary: "Engineer @ Acme"
        }
      }
    })

    expect(compact).toEqual({
      ok: true,
      filled: 5,
      skipped: 1,
      error: undefined,
      addEntry: {
        submitted: true,
        openedNext: true,
        sectionLabel: "Work experience",
        entryNumber: 2,
        nextStep: "Fill entry 2",
        entryAdded: true,
        savedCount: 2,
        sessionAdded: 1,
        lastSavedSummary: "Engineer @ Acme",
        error: undefined
      }
    })
    expect(compact).not.toHaveProperty("results")
  })

  it("keeps click addEntryWait only", () => {
    const compact = compactToolResultForAgent("click", {
      ok: true,
      result: {
        clicked: true,
        selector: "button.add",
        addEntryWait: { ready: true, sectionLabel: "Education" }
      }
    })

    expect(compact).toEqual({
      ok: true,
      error: undefined,
      addEntryWait: { ready: true, sectionLabel: "Education" }
    })
  })

  it("returns saved entries note for get_page_content when sections present", () => {
    const compact = compactToolResultForAgent("get_page_content", {
      ok: true,
      result: {
        addEntrySections: [
          {
            sectionLabel: "Work experience",
            entryCount: 1,
            savedEntries: [{ fingerprint: "a", summary: "Engineer @ Acme" }]
          }
        ]
      }
    })

    expect(compact.note).toContain("Saved entries")
    expect(compact.savedEntries).toContain("Work experience")
  })

  it("returns default note for get_page_content without add-entry sections", () => {
    const compact = compactToolResultForAgent("get_page_content", {
      ok: true,
      result: { fields: [{ selector: "#a" }], textSummary: "long text" }
    })

    expect(compact.note).toContain("system prompt")
  })
})

describe("formatAgentToolResultMessage", () => {
  it("prefixes compact JSON with action label", () => {
    const msg = formatAgentToolResultMessage("click", { ok: false, error: "not found" })
    expect(msg).toBe('Action result (click): {"ok":false,"error":"not found"}')
  })
})
