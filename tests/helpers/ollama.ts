import { checkOllamaHealth, listModels } from "~/lib/ollama/client"

import { DEEPSEEK_LITE_MODEL } from "../fixtures/deepseek-text-actions"

export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434"
export { DEEPSEEK_LITE_MODEL }

export interface OllamaTestContext {
  available: boolean
  model: string
  skipReason?: string
}

export async function loadOllamaTestContext(): Promise<OllamaTestContext> {
  const health = await checkOllamaHealth(OLLAMA_HOST)
  if (!health.ok) {
    return {
      available: false,
      model: "",
      skipReason: health.error ?? "Ollama is not reachable"
    }
  }

  const envModel = process.env.OLLAMA_TEST_MODEL?.trim()
  if (envModel) {
    return { available: true, model: envModel }
  }

  const models = await listModels(OLLAMA_HOST)
  if (!models.length) {
    return {
      available: false,
      model: "",
      skipReason: "No models installed — run `ollama pull llama3.2`"
    }
  }

  const preferred = models.find((m) => /llama3\.2|qwen2\.5|gemma2|phi3|mistral/i.test(m))
  return { available: true, model: preferred ?? models[0] }
}
