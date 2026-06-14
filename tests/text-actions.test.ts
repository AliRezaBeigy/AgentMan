import { describe, expect, it } from "vitest"

import {
  appendTextActionInstructions,
  countTextActionsInContent,
  looksLikeActionArray,
  looksLikeBatchFillFields,
  looksLikeRootActionArrayStarting,
  looksLikeFailedTextAction,
  parseTextAction,
  textActionToToolCalls
} from "~/lib/text-actions"
import type { OllamaMessage } from "~/lib/ollama/client"
import {
  deepseekBrokenAction,
  deepseekBrokenOnclickQuotes,
  deepseekClickBySection,
  deepseekClickWorkExperience,
  deepseekDone,
  deepseekFillFieldsWorkExperience,
  deepseekFillFieldsWithIds,
  deepseekFillSingleField
} from "./fixtures/deepseek-text-actions"

describe("text-actions", () => {
  it("parses click action from JSON text", () => {
    const action = parseTextAction('{"action":"click","selector":"#add-cvjob button[type=submit]"}')
    expect(action?.name).toBe("click")
    expect(action?.args.selector).toBe("#add-cvjob button[type=submit]")
  })

  it("parses click when JSON breaks on nested double quotes", () => {
    const action = parseTextAction(deepseekBrokenOnclickQuotes)
    expect(action?.name).toBe("click")
    expect(action?.args.selector).toContain("showAddnewSkill")
    expect(action?.args.selector).toContain("cvjob")
  })

  it("parses section-based click actions", () => {
    const action = parseTextAction(deepseekClickBySection)
    expect(action?.name).toBe("click")
    expect(action?.args.section).toBe("Work experience")
  })

  it("parses click from deepseek-style fenced JSON with escaped quotes", () => {
    const content = ` \`\`\`json
{
  "action": "click",
  "selector": "button[onclick*='showAddnewSkill(\\'cvjob\\')']"
}
\`\`\``
    const action = parseTextAction(content)
    expect(action?.name).toBe("click")
    expect(action?.args.selector).toContain("showAddnewSkill")
  })

  it("detects failed action JSON", () => {
    expect(looksLikeFailedTextAction('{"action": "click", "selector": broken')).toBe(true)
    expect(looksLikeFailedTextAction('{"action":"click","selector":"#x"}')).toBe(false)
  })

  it("converts single-field fill_fields to fill", () => {
    const action = parseTextAction(
      '```json\n{"action":"fill_fields","fields":[{"selector":"#title","value":"Engineer"}]}\n```'
    )
    expect(action?.name).toBe("fill")
    expect(action?.args.selector).toBe("#title")
    expect(action?.args.value).toBe("Engineer")
  })

  it("rejects batch fill_fields with multiple fields", () => {
    expect(parseTextAction(deepseekFillFieldsWorkExperience)).toBeNull()
    expect(looksLikeBatchFillFields(deepseekFillFieldsWorkExperience)).toBe(true)
    expect(looksLikeFailedTextAction(deepseekFillFieldsWorkExperience)).toBe(true)
  })

  it("parses fill action directly", () => {
    const action = parseTextAction(deepseekFillSingleField)
    expect(action?.name).toBe("fill")
    expect(action?.args.selector).toBe("#job-title")
    expect(action?.args.value).toContain("Teaching Assistant")
  })

  it("parses done action", () => {
    const action = parseTextAction('{"action":"done","message":"All entries added."}')
    expect(action?.name).toBe("done")
    expect(action?.args.message).toBe("All entries added.")
  })

  it("converts deepseek responses to tool calls via textActionToToolCalls", () => {
    expect(textActionToToolCalls(deepseekClickWorkExperience)[0].name).toBe("click")
    expect(textActionToToolCalls(deepseekFillSingleField)[0].name).toBe("fill")
    expect(textActionToToolCalls(deepseekFillFieldsWorkExperience)).toHaveLength(0)
    expect(textActionToToolCalls(deepseekDone)[0].name).toBe("done")
    expect(textActionToToolCalls(deepseekBrokenAction)).toHaveLength(0)
  })

  it("appendTextActionInstructions adds guidance without duplication", () => {
    const messages: OllamaMessage[] = [{ role: "system", content: "Base prompt" }]
    appendTextActionInstructions(messages)
    appendTextActionInstructions(messages)
    expect(messages[0].content).toContain("does NOT support native tool calling")
    expect(messages[0].content.split("does NOT support native tool calling")).toHaveLength(2)
  })

  it("parses only the first action from a JSON array", () => {
    const content = `\`\`\`json
[
  {"action":"click","section":"Work experience"},
  {"action":"fill","selector":"#a","value":"b"}
]
\`\`\``
    expect(parseTextAction(content)).toBeNull()
    expect(countTextActionsInContent(content)).toBe(2)
    expect(looksLikeActionArray(content)).toBe(true)
    expect(looksLikeRootActionArrayStarting(content)).toBe(true)
  })

  it("allows single-field fill_fields but not root action array", () => {
    const content = '{"action":"fill_fields","fields":[{"selector":"#a","value":"b"}]}'
    expect(looksLikeRootActionArrayStarting(content)).toBe(false)
    expect(parseTextAction(content)?.name).toBe("fill")
  })

  it("rejects multi-field fill_fields", () => {
    expect(parseTextAction(deepseekFillFieldsWithIds)).toBeNull()
    expect(looksLikeBatchFillFields(deepseekFillFieldsWithIds)).toBe(true)
  })

  it("rejects fill_fields that echo field metadata without values", () => {
    const content = `{"action":"fill_fields","fields":[{"selector":"#a","label":"Title","type":"text"}]}`
    expect(parseTextAction(content)).toBeNull()
    expect(looksLikeFailedTextAction(content)).toBe(true)
  })
})
