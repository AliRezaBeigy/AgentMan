import { describe, expect, it } from "vitest"

import {
  buildAssistantHistoryMessage,
  pruneOldSkippedFillTurns
} from "~/lib/agent-history"
import type { OllamaMessage } from "~/lib/ollama/client"
import { buildAddEntryTurnHint, ADD_ENTRY_TURN_HINT_PREFIX } from "~/lib/page-form-context"
import type { AddEntrySectionDescriptor } from "~/lib/types"

describe("buildAssistantHistoryMessage", () => {
  it("includes tool_calls for native tool mode", () => {
    const message = buildAssistantHistoryMessage(
      "",
      [{ name: "fill", args: { selector: "work:title", value: "Engineer" } }],
      true,
      false
    )
    expect(message.content).toBe("")
    expect(message.tool_calls).toEqual([
      {
        function: {
          name: "fill",
          arguments: { selector: "work:title", value: "Engineer" }
        }
      }
    ])
  })

  it("omits tool_calls in text-action mode", () => {
    const message = buildAssistantHistoryMessage(
      '{"action":"fill","selector":"work:title"}',
      [{ name: "fill", args: { selector: "work:title", value: "Engineer" } }],
      true,
      true
    )
    expect(message.tool_calls).toBeUndefined()
    expect(message.content).toContain("work:title")
  })
})

describe("pruneOldSkippedFillTurns", () => {
  it("removes older skipped fill assistant+tool pairs", () => {
    const messages: OllamaMessage[] = [
      { role: "user", content: "fill form" },
      { role: "assistant", content: "", tool_calls: [{ function: { name: "fill", arguments: {} } }] },
      { role: "tool", tool_name: "fill", content: JSON.stringify({ skipped: true }) },
      { role: "assistant", content: "", tool_calls: [{ function: { name: "fill", arguments: {} } }] },
      { role: "tool", tool_name: "fill", content: JSON.stringify({ skipped: true, ok: true }) }
    ]

    pruneOldSkippedFillTurns(messages, 1)

    expect(messages).toHaveLength(3)
    expect(messages[1]?.role).toBe("assistant")
    expect(messages[2]?.role).toBe("tool")
    expect(JSON.parse(messages[2]!.content).ok).toBe(true)
  })
})

describe("buildAddEntryTurnHint", () => {
  const sections: AddEntrySectionDescriptor[] = [
    {
      sectionLabel: "Work experience",
      addButtonSelector: "#add",
      addButtonLabel: "Add work",
      formSelector: "#form",
      submitSelector: "#save",
      fieldLabels: ["Title"],
      entryCount: 0,
      savedEntries: []
    }
  ]

  it("tells the model to wait for auto-save when all required fields are filled", () => {
    const hint = buildAddEntryTurnHint(
      new Map([["Work experience", 0]]),
      "fill",
      "Work experience",
      sections,
      new Map(),
      false,
      "add work experience",
      new Map(),
      ["work:title", "work:employer"],
      null
    )

    expect(hint).toContain(ADD_ENTRY_TURN_HINT_PREFIX)
    expect(hint).toContain("All required fields")
    expect(hint).toContain("wait for auto-save")
    expect(hint).not.toContain("NEXT required field")
  })
})
