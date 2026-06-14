import { describe, expect, it } from "vitest"

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
  deepseekFillSingleField,
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
      entryCount: 0,
      savedEntries: []
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

  it("converts single-field fill response into fill tool call", () => {
    const calls = textActionToToolCalls(deepseekFillSingleField)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe("fill")
    expect(calls[0].args.selector).toBe("#job-title")
    expect(String(calls[0].args.value)).toContain("Teaching Assistant")
  })

  it("rejects batch fill_fields responses", () => {
    expect(textActionToToolCalls(deepseekFillFieldsWorkExperience)).toHaveLength(0)
    expect(textActionToToolCalls(deepseekFillFieldsWithIds)).toHaveLength(0)
    expect(looksLikeFailedTextAction(deepseekFillFieldsWorkExperience)).toBe(true)
  })

  it("handles id-based selectors from the retry guidance", () => {
    const clickCalls = textActionToToolCalls(deepseekClickWithId)
    expect(clickCalls[0].args.selector).toBe("#add-experience-btn")
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
      { input: deepseekFillSingleField, expectedTool: "fill" },
      { input: deepseekDone, expectedTool: "done" }
    ]

    for (const turn of turns) {
      const calls = textActionToToolCalls(turn.input)
      expect(calls[0]?.name).toBe(turn.expectedTool)
    }
  })

  it("includes add-entry selectors in the text-action system prompt", () => {
    const prompt = buildTextActionSystemPrompt()
    expect(prompt).toContain('"action":"fill"')
    expect(prompt).toContain('"section":"<section label>"')
    expect(prompt).toContain('{"action":"done"')
  })
})
