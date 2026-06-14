import { describe, expect, it } from "vitest"

import { formatAgentToolStepLabel } from "~/lib/agent-steps"
import { stripLegacyAttachmentNote } from "~/lib/chat-display"

describe("stripLegacyAttachmentNote", () => {
  it("removes trailing attached suffix from stored content", () => {
    expect(
      stripLegacyAttachmentNote("add my works\n\n[Attached: application.md]")
    ).toBe("add my works")
  })

  it("leaves content without attachment suffix unchanged", () => {
    expect(stripLegacyAttachmentNote("hello")).toBe("hello")
  })
})

describe("formatAgentToolStepLabel", () => {
  it("formats fill steps with selector and value preview", () => {
    expect(
      formatAgentToolStepLabel("fill", {
        selector: "work:title",
        value: "Teaching Assistant"
      })
    ).toContain("work:title")
  })
})
