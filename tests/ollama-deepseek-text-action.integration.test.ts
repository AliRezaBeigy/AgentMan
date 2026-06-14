import { beforeAll, describe, expect, it } from "vitest"

import { buildAgentSystemPrompt } from "~/lib/page-form-context"
import {
  appendTextActionInstructions,
  parseTextAction,
  textActionToToolCalls
} from "~/lib/text-actions"
import { chat, checkOllamaHealth, listModels, OllamaToolsNotSupportedError } from "~/lib/ollama/client"
import { AGENT_TOOLS } from "~/lib/ollama/tools"
import {
  DEEPSEEK_LITE_MODEL,
  deepseekToolsNotSupportedError
} from "./fixtures/deepseek-text-actions"
import { OLLAMA_HOST } from "./helpers/ollama"
import type { PageContext } from "~/lib/types"
import type { OllamaMessage } from "~/lib/ollama/client"

interface DeepseekTestContext {
  available: boolean
  modelInstalled: boolean
  skipReason?: string
}

let ctx: DeepseekTestContext

const pageContext: PageContext = {
  url: "https://hhs.varbi.com/apply/position/878378/",
  title: "Research Assistants – House of Innovation",
  textSummary: "",
  fields: [
    {
      selector: "[data-agentman-field-key='Work experience - Title']",
      label: "Work experience - Title",
      type: "text"
    },
    {
      selector: "[data-agentman-field-key='Work experience - Employer']",
      label: "Work experience - Employer",
      type: "text"
    },
    {
      selector: "[data-agentman-field-key='Work experience - City']",
      label: "Work experience - City",
      type: "text"
    },
    {
      selector: "[data-agentman-field-key='Work experience - Country']",
      label: "Work experience - Country",
      type: "select"
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
      fieldLabels: [
        "Work experience - Title",
        "Work experience - Employer",
        "Work experience - City",
        "Work experience - Country"
      ],
      entryCount: 0,
      savedEntries: []
    },
    {
      sectionLabel: "Education",
      addButtonSelector: "button[onclick*=\"showAddnewSkill('cveducation')\"]",
      addButtonLabel: "Add education",
      formSelector: "#add-cveducation",
      submitSelector: "#add-cveducation button[type='submit']",
      cancelButtonSelector: "#add-cveducation button.btn-cancel",
      fieldLabels: ["Education - Education name", "Education - University / College"],
      entryCount: 0,
      savedEntries: []
    }
  ],
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 }
}

function buildTextActionMessages(userContent: string): OllamaMessage[] {
  const messages: OllamaMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt(pageContext, userContent)
    },
    { role: "user", content: userContent }
  ]
  appendTextActionInstructions(messages)
  return messages
}

async function loadDeepseekTestContext(): Promise<DeepseekTestContext> {
  const health = await checkOllamaHealth(OLLAMA_HOST)
  if (!health.ok) {
    return {
      available: false,
      modelInstalled: false,
      skipReason: health.error ?? "Ollama is not reachable"
    }
  }

  const models = await listModels(OLLAMA_HOST)
  const modelInstalled = models.some((m) => m === DEEPSEEK_LITE_MODEL || m.startsWith(`${DEEPSEEK_LITE_MODEL}:`))
  if (!modelInstalled) {
    return {
      available: true,
      modelInstalled: false,
      skipReason: `Model not installed — run \`ollama pull ${DEEPSEEK_LITE_MODEL}\``
    }
  }

  return { available: true, modelInstalled: true }
}

beforeAll(async () => {
  ctx = await loadDeepseekTestContext()
})

describe("Ollama deepseek-coder-v2:lite text-action integration", () => {
  it("rejects native tool calling with OllamaToolsNotSupportedError", async () => {
    if (!ctx.available || !ctx.modelInstalled) {
      console.warn(`Skipping: ${ctx.skipReason}`)
      return
    }

    await expect(
      chat({
        host: OLLAMA_HOST,
        model: DEEPSEEK_LITE_MODEL,
        stream: false,
        tools: AGENT_TOOLS,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: "You are a browser agent." },
          { role: "user", content: "Click the Add work experience button." }
        ]
      })
    ).rejects.toBeInstanceOf(OllamaToolsNotSupportedError)

    await expect(
      chat({
        host: OLLAMA_HOST,
        model: DEEPSEEK_LITE_MODEL,
        stream: false,
        tools: AGENT_TOOLS,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: "You are a browser agent." },
          { role: "user", content: "Click the Add work experience button." }
        ]
      })
    ).rejects.toThrow(/does not support tools/i)
  })

  it("returns a parseable click action without native tools", async () => {
    if (!ctx.available || !ctx.modelInstalled) return

    const messages = buildTextActionMessages(
      "Open the work experience form. Return only one JSON action to click the Add work experience button. Prefer selector #add-experience-btn if listed."
    )

    const result = await chat({
      host: OLLAMA_HOST,
      model: DEEPSEEK_LITE_MODEL,
      stream: false,
      options: { temperature: 0 },
      messages
    })

    expect(result.content.trim().length).toBeGreaterThan(0)
    expect(result.toolCalls).toHaveLength(0)

    const action = parseTextAction(result.content)
    expect(action, `unparsed response: ${result.content.slice(0, 400)}`).not.toBeNull()
    expect(action?.name).toBe("click")
    expect(String(action?.args.selector).length).toBeGreaterThan(0)

    const calls = textActionToToolCalls(result.content)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe("click")
  })

  it("returns a parseable fill action for one field", async () => {
    if (!ctx.available || !ctx.modelInstalled) return

    const messages = buildTextActionMessages(
      [
        "The work experience sub-form is already open.",
        "Fill ONE field with fill:",
        "- Title: Teaching Assistant (Advanced Programming)",
        "Use selectors from the field list. Return only one JSON action with a single selector and value."
      ].join("\n")
    )

    const result = await chat({
      host: OLLAMA_HOST,
      model: DEEPSEEK_LITE_MODEL,
      stream: false,
      options: { temperature: 0 },
      messages
    })

    const action = parseTextAction(result.content)
    expect(action, `unparsed response: ${result.content.slice(0, 500)}`).not.toBeNull()
    expect(action?.name).toBe("fill")
    expect(String(action?.args.selector).length).toBeGreaterThan(0)
    expect(String(action?.args.value)).toMatch(/teaching assistant/i)
  })

  it("matches the known tools-not-supported error message for this model", () => {
    expect(deepseekToolsNotSupportedError).toMatch(/deepseek-coder-v2:lite/)
    expect(deepseekToolsNotSupportedError).toMatch(/does not support tools/i)
  })
})
