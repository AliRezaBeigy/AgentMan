import { describe, expect, it } from "vitest"
import { nsToMs, timingFromOllamaChunk } from "~/lib/ollama/timing"

describe("ollama timing", () => {
  it("converts nanoseconds to milliseconds", () => {
    expect(nsToMs(5_000_000)).toBe(5)
    expect(nsToMs(undefined)).toBeUndefined()
  })

  it("extracts timing from final stream chunk", () => {
    const timing = timingFromOllamaChunk({
      done: true,
      prompt_eval_count: 1200,
      prompt_eval_duration: 250_000_000,
      eval_count: 45,
      eval_duration: 1_500_000_000,
      total_duration: 2_000_000_000,
      load_duration: 100_000_000
    })

    expect(timing).toEqual({
      promptEvalCount: 1200,
      promptEvalDurationMs: 250,
      evalCount: 45,
      evalDurationMs: 1500,
      totalDurationMs: 2000,
      loadDurationMs: 100
    })
  })

  it("returns null for non-final chunks", () => {
    expect(timingFromOllamaChunk({ done: false, prompt_eval_count: 10 })).toBeNull()
  })
})
