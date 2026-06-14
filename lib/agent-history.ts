import type { OllamaMessage } from "~/lib/ollama/client"
import type { OllamaToolCall } from "~/lib/types"

export interface AgentToolCallRecord {
  name: string
  args: Record<string, unknown>
}

export function buildAssistantHistoryMessage(
  text: string,
  toolCalls: AgentToolCallRecord[],
  addEntryMode: boolean,
  textActionMode: boolean
): OllamaMessage {
  const content = compactAssistantTurnContent(text, toolCalls, addEntryMode, textActionMode)
  const message: OllamaMessage = { role: "assistant", content }
  if (toolCalls.length && !textActionMode) {
    message.tool_calls = toolCalls.map(
      (call): OllamaToolCall => ({
        function: { name: call.name, arguments: call.args }
      })
    )
  }
  return message
}

function compactAssistantTurnContent(
  text: string,
  toolCalls: AgentToolCallRecord[],
  addEntryMode: boolean,
  textActionMode: boolean
): string {
  if (!addEntryMode || !textActionMode) return text

  const fillCall = toolCalls.find((call) => call.name === "fill" || call.name === "fill_fields")
  if (fillCall?.name === "fill") {
    return `{"action":"fill","selector":"${String(fillCall.args.selector ?? "")}"}`
  }
  if (fillCall?.name === "fill_fields") {
    const fields = fillCall.args.fields
    const count = Array.isArray(fields) ? fields.length : 0
    return `{"action":"fill_fields","fields":${count}}`
  }

  const clickCall = toolCalls.find((call) => call.name === "click")
  if (clickCall) {
    if (clickCall.args.section) {
      return `{"action":"click","section":"${String(clickCall.args.section)}"}`
    }
    return `{"action":"click","selector":"${String(clickCall.args.selector ?? "")}"}`
  }

  const doneCall = toolCalls.find((call) => call.name === "done")
  if (doneCall) {
    return `{"action":"done","message":"${String(doneCall.args.message ?? "").slice(0, 80)}"}`
  }

  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

/** Drop older skipped-fill assistant+tool pairs; the [Next step] hint carries current state. */
export function pruneOldSkippedFillTurns(messages: OllamaMessage[], keepLatest = 0): void {
  const skippedToolIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    if (message.role !== "tool" || message.tool_name !== "fill") continue
    try {
      const body = JSON.parse(message.content) as { skipped?: boolean }
      if (body.skipped === true) skippedToolIndices.push(i)
    } catch {
      /* ignore malformed tool payloads */
    }
  }

  const toRemove = skippedToolIndices.slice(0, Math.max(0, skippedToolIndices.length - keepLatest))
  for (let r = toRemove.length - 1; r >= 0; r--) {
    const toolIdx = toRemove[r]!
    const assistantIdx = toolIdx - 1
    if (assistantIdx >= 0 && messages[assistantIdx]?.role === "assistant") {
      messages.splice(assistantIdx, 2)
    }
  }
}

export function isSkippedFillToolMessage(message: OllamaMessage): boolean {
  if (message.role !== "tool" || message.tool_name !== "fill") return false
  try {
    const body = JSON.parse(message.content) as { skipped?: boolean }
    return body.skipped === true
  } catch {
    return false
  }
}
