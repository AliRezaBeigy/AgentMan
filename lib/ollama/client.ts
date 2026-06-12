import { devLogRequest, devLogResponse } from "~/lib/dev-log"
import type { OllamaToolCall } from "~/lib/types"

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
  options?: Record<string, unknown>
  onChunk?: (delta: string) => void
}

export interface ChatResult {
  content: string
  toolCalls: OllamaToolCall[]
}

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
    options: ollamaOptions,
    onChunk
  } = chatOptions
  const body: Record<string, unknown> = {
    model,
    messages,
    stream
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
    devLogResponse("Ollama chat", res.status, { error: ollamaErrorMessage(res.status) })
    throw new Error(ollamaErrorMessage(res.status))
  }

  if (!stream) {
    const data = await res.json()
    const result = parseChatResponse(data)
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      const chunk = JSON.parse(line) as {
        message?: {
          content?: string
          tool_calls?: OllamaToolCall[]
        }
      }
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

  const result = { content, toolCalls }
  devLogResponse("Ollama chat (stream)", res.status, result)
  return result
}

function parseChatResponse(data: {
  message?: { content?: string; tool_calls?: OllamaToolCall[] }
}): ChatResult {
  return {
    content: data.message?.content ?? "",
    toolCalls: data.message?.tool_calls ?? []
  }
}
