import { devLog, devLogRequest, devLogResponse } from "~/lib/dev-log"
import { timingFromOllamaChunk, type OllamaChatTiming } from "~/lib/ollama/timing"
import {
  extractOllamaErrorBody,
  isToolsNotSupportedMessage,
  OllamaToolsNotSupportedError
} from "~/lib/ollama/errors"
import type { OllamaToolCall } from "~/lib/types"

export { OllamaToolsNotSupportedError } from "~/lib/ollama/errors"

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  images?: string[]
  tool_name?: string
}

export interface OllamaTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatOptions {
  host: string
  model: string
  messages: OllamaMessage[]
  tools?: OllamaTool[]
  stream?: boolean
  format?: "json"
  /** Keep model in VRAM between requests — enables Ollama KV prefix cache. */
  keepAlive?: string | number
  options?: Record<string, unknown>
  onChunk?: (delta: string) => void
}

export interface ChatResult {
  content: string
  toolCalls: OllamaToolCall[]
  timing?: OllamaChatTiming
}

export type { OllamaChatTiming } from "~/lib/ollama/timing"

function ollamaErrorMessage(status: number): string {
  if (status === 403) {
    return "Ollama blocked the request (403). Reload the extension after updating, or start Ollama with: OLLAMA_ORIGINS=* ollama serve"
  }
  return `Ollama returned ${status}`
}

export async function checkOllamaHealth(host: string): Promise<{ ok: boolean; error?: string }> {
  const url = `${host.replace(/\/$/, "")}/api/tags`
  try {
    devLogRequest("Ollama health", "GET", url)
    const res = await fetch(url, { credentials: "include" })
    if (!res.ok) {
      const result = { ok: false as const, error: ollamaErrorMessage(res.status) }
      devLogResponse("Ollama health", res.status, result)
      return result
    }
    devLogResponse("Ollama health", res.status, { ok: true })
    return { ok: true }
  } catch (error) {
    const result = {
      ok: false as const,
      error: error instanceof Error ? error.message : "Cannot reach Ollama"
    }
    devLogResponse("Ollama health", 0, result)
    return result
  }
}

export async function listModels(host: string): Promise<string[]> {
  const url = `${host.replace(/\/$/, "")}/api/tags`
  devLogRequest("Ollama models", "GET", url)
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) {
    devLogResponse("Ollama models", res.status, { error: ollamaErrorMessage(res.status) })
    throw new Error(ollamaErrorMessage(res.status))
  }
  const data = (await res.json()) as { models?: Array<{ name: string }> }
  const models = (data.models ?? []).map((m) => m.name)
  devLogResponse("Ollama models", res.status, { models })
  return models
}

export async function chat(chatOptions: ChatOptions): Promise<ChatResult> {
  const {
    host,
    model,
    messages,
    tools,
    stream = true,
    format,
    keepAlive,
    options: ollamaOptions,
    onChunk
  } = chatOptions
  const body: Record<string, unknown> = {
    model,
    messages,
    stream
  }
  if (keepAlive !== undefined) {
    body.keep_alive = keepAlive
  }
  if (tools?.length) {
    body.tools = tools
  }
  if (format) {
    body.format = format
  }
  if (ollamaOptions) {
    body.options = ollamaOptions
  }

  const url = `${host.replace(/\/$/, "")}/api/chat`
  devLogRequest("Ollama chat", "POST", url, body)

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include"
  })

  if (!res.ok) {
    const errorBody = await readOllamaErrorResponse(res)
    devLogResponse("Ollama chat", res.status, errorBody ?? { error: ollamaErrorMessage(res.status) })
    throwOllamaChatError(errorBody, ollamaErrorMessage(res.status))
  }

  if (!stream) {
    const data = await res.json()
    const apiError = extractOllamaErrorBody(data)
    if (apiError) throwOllamaChatError(data, apiError)
    const result = {
      ...parseChatResponse(data),
      timing: timingFromOllamaChunk(data as { done?: boolean }) ?? undefined
    }
    logChatTiming(result.timing)
    devLogResponse("Ollama chat", res.status, result)
    return result
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error("No response body from Ollama")
  }

  const decoder = new TextDecoder()
  let content = ""
  const toolCalls: OllamaToolCall[] = []
  let buffer = ""
  let timing: OllamaChatTiming | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      const chunk = JSON.parse(line) as {
        error?: string
        done?: boolean
        prompt_eval_count?: number
        prompt_eval_duration?: number
        eval_count?: number
        eval_duration?: number
        total_duration?: number
        load_duration?: number
        message?: {
          content?: string
          tool_calls?: OllamaToolCall[]
        }
      }
      if (chunk.error) {
        throwOllamaChatError(chunk, chunk.error)
      }
      const chunkTiming = timingFromOllamaChunk(chunk)
      if (chunkTiming) timing = chunkTiming
      const delta = chunk.message?.content ?? ""
      if (delta) {
        content += delta
        onChunk?.(delta)
      }
      if (chunk.message?.tool_calls?.length) {
        toolCalls.push(...chunk.message.tool_calls)
      }
    }
  }

  const result = { content, toolCalls, timing }
  logChatTiming(timing)
  devLogResponse("Ollama chat (stream)", res.status, {
    content: result.content.slice(0, 200),
    toolCalls: result.toolCalls,
    timing: result.timing
  })
  return result
}

function logChatTiming(timing?: OllamaChatTiming): void {
  if (!timing) return
  devLog("Ollama prompt eval", timing)
}

function parseChatResponse(data: {
  message?: { content?: string; tool_calls?: OllamaToolCall[] }
}): ChatResult {
  return {
    content: data.message?.content ?? "",
    toolCalls: data.message?.tool_calls ?? []
  }
}

async function readOllamaErrorResponse(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    try {
      return { error: await res.text() }
    } catch {
      return null
    }
  }
}

function throwOllamaChatError(body: unknown, fallback: string): never {
  const message = extractOllamaErrorBody(body) ?? fallback
  if (isToolsNotSupportedMessage(message)) {
    throw new OllamaToolsNotSupportedError(message)
  }
  throw new Error(message)
}
