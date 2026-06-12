import { beforeAll, describe, expect, it } from "vitest"

import { chat, checkOllamaHealth, listModels } from "~/lib/ollama/client"
import { loadOllamaTestContext, OLLAMA_HOST, type OllamaTestContext } from "./helpers/ollama"

let ctx: OllamaTestContext

beforeAll(async () => {
  ctx = await loadOllamaTestContext()
})

describe("Ollama integration", () => {
  it("reaches the local Ollama server", async () => {
    if (!ctx.available) {
      console.warn(`Skipping: ${ctx.skipReason}`)
      return
    }

    const health = await checkOllamaHealth(OLLAMA_HOST)
    expect(health.ok).toBe(true)
  })

  it("lists installed models", async () => {
    if (!ctx.available) return

    const models = await listModels(OLLAMA_HOST)
    expect(models.length).toBeGreaterThan(0)
    expect(models).toContain(ctx.model)
  })

  it("returns JSON when format=json is set", async () => {
    if (!ctx.available) return

    const result = await chat({
      host: OLLAMA_HOST,
      model: ctx.model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        {
          role: "user",
          content:
            'Return exactly this JSON object and nothing else: {"greeting":"hello","count":1}'
        }
      ]
    })

    expect(result.content.trim().length).toBeGreaterThan(0)

    const parsed = JSON.parse(result.content) as { greeting?: string; count?: number }
    expect(parsed.greeting).toBe("hello")
    expect(parsed.count).toBe(1)
  })
})
