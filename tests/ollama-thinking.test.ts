import { describe, expect, it } from "vitest"

import {
  AGENT_CHAT_THINK,
  AGENT_TOOL_NUM_PREDICT,
  agentChatOptions
} from "~/lib/ollama/thinking"

describe("ollama thinking config", () => {
  it("disables thinking for agent tool loops by default", () => {
    expect(AGENT_CHAT_THINK).toBe(false)
  })

  it("caps num_predict for tool-only turns", () => {
    expect(agentChatOptions()).toEqual({ num_predict: AGENT_TOOL_NUM_PREDICT })
  })
})
