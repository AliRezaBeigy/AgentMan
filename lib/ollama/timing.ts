export interface OllamaChatTiming {
  promptEvalCount?: number
  promptEvalDurationMs?: number
  evalCount?: number
  evalDurationMs?: number
  totalDurationMs?: number
  loadDurationMs?: number
}

export function nsToMs(ns?: number): number | undefined {
  if (ns == null || !Number.isFinite(ns)) return undefined
  return Math.round(ns / 1_000_000)
}

export function timingFromOllamaChunk(chunk: {
  done?: boolean
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
  total_duration?: number
  load_duration?: number
}): OllamaChatTiming | null {
  if (!chunk.done) return null
  return {
    promptEvalCount: chunk.prompt_eval_count,
    promptEvalDurationMs: nsToMs(chunk.prompt_eval_duration),
    evalCount: chunk.eval_count,
    evalDurationMs: nsToMs(chunk.eval_duration),
    totalDurationMs: nsToMs(chunk.total_duration),
    loadDurationMs: nsToMs(chunk.load_duration)
  }
}
