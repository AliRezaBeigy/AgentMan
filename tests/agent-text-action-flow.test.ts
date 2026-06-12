import { describe, expect, it } from "vitest"

import { parseFillFieldsArg } from "~/lib/tool-args"
import {
  appendTextActionInstructions,
  buildTextActionSystemPrompt,
  looksLikeFailedTextAction,
  parseTextAction,
  textActionNeedsFollowUp,
  textActionToToolCalls
} from "~/lib/text-actions"
import { buildAgentSystemPrompt } from "~/lib/page-form-context"
import type { OllamaMessage } from "~/lib/ollama/client"
import type { PageContext } from "~/lib/types"
import {
  deepseekBrokenAction,
  deepseekClickWorkExperience,
  deepseekClickWithId,
  deepseekDone,
  deepseekFillFieldsWithIds,
  deepseekFillFieldsWorkExperience,
  deepseekNarrationOnly
} from "./fixtures/deepseek-text-actions"

const pageContext: PageContext = {
  url: "https://hhs.varbi.com/apply/position/878378/",
  title: "Research Assistants – House of Innovation",
  textSummary: "",
  fields: [
    {
      selector: "#job-title",
      label: "Work experience - Title",
      type: "text"
    },
    {
      selector: "#job-company",
      label: "Work experience - Employer",
      type: "text"
    }
  ],
  repeatableSections: [],
  addEntrySections: [
    {
      sectionLabel: "Work experience",
      addButtonSelector: "button[onclick*=\"showAddnewSkill('cvjob')\"]",
      addButtonLabel: "Add work experience",
      formSelector: "#add-cvjob",
      submitSelector: "#add-cvjob button[type='submit']",
      cancelButtonSelector: "#add-cvjob button.btn-cancel",
      fieldLabels: ["Work experience - Title", "Work experience - Employer"],
      entryCount: 0
    }
  ],
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 }
}

describe("agent text-action flow (deepseek-coder-v2:lite)", () => {
  it("appends text-action instructions to the agent system prompt once", () => {
    const messages: OllamaMessage[] = [
      {
        role: "system",
        content: buildAgentSystemPrompt(pageContext, "add the work and education")
      },
      { role: "user", content: "add the work and education" }
    ]

    appendTextActionInstructions(messages)
    appendTextActionInstructions(messages)

    expect(messages[0].content).toContain("does NOT support native tool calling")
    expect(messages[0].content).toContain("Add-entry workflow")
    expect(
      (messages[0].content.match(/does NOT support native tool calling/g) ?? []).length
    ).toBe(1)
  })

  it("converts deepseek click response into a click tool call", () => {
    const calls = textActionToToolCalls(deepseekClickWorkExperience)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe("click")
    expect(String(calls[0].args.selector)).toContain("showAddnewSkill")
  })

  it("converts deepseek fill_fields response into executable field mappings", () => {
    const calls = textActionToToolCalls(deepseekFillFieldsWorkExperience)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe("fill_fields")

    const fields = parseFillFieldsArg(calls[0].args.fields)
    expect(fields.length).toBeGreaterThanOrEqual(4)
    expect(fields.find((f) => f.value.includes("Teaching Assistant"))).toBeTruthy()
    expect(fields.find((f) => f.value === "Tehran")).toBeTruthy()
  })

  it("handles id-based selectors from the retry guidance", () => {
    const clickCalls = textActionToToolCalls(deepseekClickWithId)
    expect(clickCalls[0].args.selector).toBe("#add-experience-btn")

    const fillCalls = textActionToToolCalls(deepseekFillFieldsWithIds)
    const fields = parseFillFieldsArg(fillCalls[0].args.fields)
    expect(fields).toHaveLength(2)
    expect(fields[0].selector).toBe("#job-title")
  })

  it("recognizes done action and stops the loop", () => {
    const calls = textActionToToolCalls(deepseekDone)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe("done")
    expect(String(calls[0].args.message)).toContain("work experience")
  })

  it("flags broken JSON for retry and narration-only turns for continuation", () => {
    expect(looksLikeFailedTextAction(deepseekBrokenAction)).toBe(true)
    expect(parseTextAction(deepseekBrokenAction)).toBeNull()

    expect(textActionToToolCalls(deepseekNarrationOnly)).toHaveLength(0)
    expect(textActionNeedsFollowUp(deepseekNarrationOnly)).toBe(true)
  })

  it("simulates a multi-turn add-entry workflow from deepseek responses", () => {
    const turns = [
      { input: deepseekClickWorkExperience, expectedTool: "click" },
      { input: deepseekFillFieldsWorkExperience, expectedTool: "fill_fields" },
      { input: deepseekFillFieldsWithIds, expectedTool: "fill_fields" },
      { input: deepseekDone, expectedTool: "done" }
    ]

    for (const turn of turns) {
      const calls = textActionToToolCalls(turn.input)
      expect(calls[0]?.name).toBe(turn.expectedTool)
    }
  })

  it("includes add-entry selectors in the text-action system prompt", () => {
    const prompt = buildTextActionSystemPrompt()
    expect(prompt).toContain("fill_fields")
    expect(prompt).toContain('"section":"Work experience"')
    expect(prompt).toContain('{"action":"done"')
  })
})
