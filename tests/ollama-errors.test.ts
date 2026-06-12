import { describe, expect, it } from "vitest"

import {
  isToolsNotSupportedMessage,
  OllamaToolsNotSupportedError
} from "~/lib/ollama/errors"

describe("ollama errors", () => {
  it("detects tools-not-supported messages", () => {
    expect(
      isToolsNotSupportedMessage(
        "registry.ollama.ai/library/deepseek-coder-v2:lite does not support tools"
      )
    ).toBe(true)
    expect(isToolsNotSupportedMessage("connection refused")).toBe(false)
  })

  it("exposes OllamaToolsNotSupportedError", () => {
    const err = new OllamaToolsNotSupportedError("model does not support tools")
    expect(err.name).toBe("OllamaToolsNotSupportedError")
  })
})
