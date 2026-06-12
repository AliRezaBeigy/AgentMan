import {
  canonicalizeShowAddnewSkillSelector,
  isBrokenSelector
} from "~/lib/add-entry-timing"
import { extractJsonValue } from "~/lib/fill-parse"
import type { OllamaMessage } from "~/lib/ollama/client"
import { parseFillFieldsArg } from "~/lib/tool-args"

export interface ParsedTextAction {
  name: string
  args: Record<string, unknown>
}

export function buildCompactTextActionSystemPrompt(): string {
  return `Return exactly ONE JSON object per turn (never a JSON array). Use a \`\`\`json fence.
Example: {"action":"click","section":"Work experience"}
fill_fields must use {"selector":"...","value":"data from attachment"} — never echo field definitions without values.
Wait for the action result before the next turn.`
}

export function buildTextActionSystemPrompt(): string {
  return `IMPORTANT: This model does NOT support native tool calling. Do not describe tools — return JSON actions only.

Return EXACTLY ONE JSON object per turn inside a \`\`\`json fence. No text before or after the fence.

Actions:
- {"action":"click","section":"Work experience"}
- {"action":"click","section":"Education"}
- {"action":"fill_fields","fields":[{"selector":"[data-agentman-field-key=\\"Work experience - Title\\"]","value":"..."}]}
- {"action":"get_page_content"}
- {"action":"done","message":"summary when finished"}

Rules:
- To OPEN a section, prefer {"action":"click","section":"Work experience"} — do NOT use onclick selectors.
- Copy field selectors exactly from the field list (do not guess ids like #cvjob-employer).
- Finish ALL work experience entries before {"action":"click","section":"Education"}.
- One fill_fields per entry; extension auto-saves and reopens the form.
- Call done only when every section has all items from the attachment saved.
- NEVER return a JSON array of actions — one object per turn only.`
}

export function buildTextActionJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["click", "fill_fields", "done", "get_page_content"]
      },
      section: { type: "string" },
      selector: { type: "string" },
      message: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            selector: { type: "string" },
            value: { type: "string" }
          },
          required: ["selector", "value"]
        }
      }
    },
    required: ["action"],
    additionalProperties: true
  }
}

function jsonCandidate(content: string): string | null {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*)/i)
  if (fenced) return fenced[1]
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed
  return null
}

/** True when streamed output starts a root-level JSON array (multi-step plan). */
export function looksLikeRootActionArrayStarting(content: string): boolean {
  const candidate = jsonCandidate(content)
  if (!candidate) return false
  return candidate.trimStart().startsWith("[")
}

/** Parse a single browser action from model text (non-tool models). */
export function parseTextAction(content: string): ParsedTextAction | null {
  const trimmed = content.trim()
  const parsed = extractJsonValue(trimmed)
  if (Array.isArray(parsed)) {
    return null
  }
  if (parsed && typeof parsed === "object") {
    const fromObject = actionFromRecord(parsed as Record<string, unknown>)
    if (fromObject) return fromObject
  }

  return parseTextActionLoose(trimmed)
}

export function countTextActionsInContent(content: string): number {
  const parsed = extractJsonValue(content.trim())
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        String((item as Record<string, unknown>).action ?? "").trim()
    ).length
  }
  return parseTextAction(content) ? 1 : 0
}

export function looksLikeActionArray(content: string): boolean {
  return countTextActionsInContent(content) > 1
}

export function fillFieldsActionHasValues(args: Record<string, unknown>): boolean {
  const fields = parseFillFieldsArg(args.fields)
  return fields.some((field) => field.value.trim().length > 0)
}

export function buildMultiActionRejectionMessage(): string {
  return `Do NOT return a JSON array of steps. Return ONE JSON object for the immediate next action only, then wait for the result.
Example next step: {"action":"click","section":"Work experience"}`
}

export function buildEmptyFillFieldsRejectionMessage(): string {
  return `fill_fields must include a "value" for each field from the user's attachment — not field labels/types/options.
Example: {"action":"fill_fields","fields":[{"selector":"[data-agentman-field-key=\\"Work experience - Title\\"]","value":"Teaching Assistant"}]}`
}

export function shouldSuppressActionArrayStream(content: string): boolean {
  return looksLikeRootActionArrayStarting(content)
}

function actionFromRecord(obj: Record<string, unknown>): ParsedTextAction | null {
  const name = String(obj.action ?? obj.tool ?? "").trim()
  if (!name) return null

  if (name === "done") {
    return {
      name: "done",
      args: { message: obj.message ?? obj.content ?? "" }
    }
  }

  if (name === "fill_fields") {
    const fields = parseFillFieldsArg(obj.fields)
    if (!fields.length) return null
    if (fields.every((field) => !field.value.trim())) return null
    return { name, args: { fields } }
  }

  if (name === "click" && obj.section) {
    return { name, args: { section: String(obj.section).trim() } }
  }

  if (name === "click" && typeof obj.selector === "string") {
    const selector = normalizeClickSelector(String(obj.selector), JSON.stringify(obj))
    return { name, args: { selector } }
  }

  const args = { ...obj }
  delete args.action
  delete args.tool
  return { name, args }
}

function parseTextActionLoose(content: string): ParsedTextAction | null {
  const actionMatch = content.match(/"action"\s*:\s*"([a-z_]+)"/i)
  if (!actionMatch) return null

  const name = actionMatch[1].toLowerCase()

  if (name === "done") {
    const messageMatch = content.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    return {
      name: "done",
      args: { message: messageMatch ? unescapeJsonString(messageMatch[1]) : "" }
    }
  }

  if (name === "click") {
    const sectionMatch = content.match(/"section"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
    if (sectionMatch) {
      return {
        name: "click",
        args: { section: unescapeJsonString(sectionMatch[1]) }
      }
    }

    const selector = extractClickSelector(content)
    if (!selector) return null
    return { name: "click", args: { selector } }
  }

  if (name === "fill") {
    const selector = extractClickSelector(content)
    if (!selector) return null
    const args: Record<string, unknown> = { selector }
    if (name === "fill") {
      const valueMatch = content.match(/"value"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (valueMatch) args.value = unescapeJsonString(valueMatch[1])
    }
    return { name, args }
  }

  if (name === "fill_fields") {
    const arrayMatch = content.match(/"fields"\s*:\s*(\[[\s\S]*\])/)
    if (arrayMatch) {
      const fields = parseFillFieldsArg(arrayMatch[1])
      if (fields.length && fields.some((field) => field.value.trim())) {
        return { name, args: { fields } }
      }
    }
    const stringMatch = content.match(/"fields"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (stringMatch) {
      const fields = parseFillFieldsArg(unescapeJsonString(stringMatch[1]))
      if (fields.length && fields.some((field) => field.value.trim())) {
        return { name, args: { fields } }
      }
    }
  }

  if (name === "get_page_content") {
    return { name, args: {} }
  }

  return null
}

function extractJsonStringValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`"${key}"\\s*:\\s*`, "i"))
  if (!match || match.index === undefined) return null

  let index = match.index + match[0].length
  while (index < content.length && /\s/.test(content[index])) index++

  const quote = content[index]
  if (quote !== '"' && quote !== "'") return null
  index++

  let value = ""
  while (index < content.length) {
    const ch = content[index]
    if (ch === "\\") {
      index++
      if (index < content.length) {
        value += content[index]
        index++
      }
      continue
    }
    if (ch === quote) break
    value += ch
    index++
  }

  return value || null
}

function extractClickSelector(content: string): string | null {
  const canonical = canonicalizeShowAddnewSkillSelector(content)
  if (canonical) return canonical

  const fromJson = extractJsonStringValue(content, "selector")
  if (fromJson && !isBrokenSelector(fromJson)) {
    return normalizeClickSelector(fromJson, content)
  }

  const idMatch = content.match(/"selector"\s*:\s*"([^"]*#[-#\w]+[^"]*)"/i)
  if (idMatch?.[1] && !isBrokenSelector(idMatch[1])) {
    return idMatch[1]
  }

  if (fromJson) return normalizeClickSelector(fromJson, content)
  return canonical
}

function normalizeClickSelector(selector: string, hint: string): string {
  const canonical = canonicalizeShowAddnewSkillSelector(`${selector}\n${hint}`)
  if (canonical && (isBrokenSelector(selector) || !selector.includes("showAddnewSkill"))) {
    return canonical
  }
  return selector.trim()
}

function unescapeJsonString(fragment: string): string {
  try {
    return JSON.parse(`"${fragment}"`)
  } catch {
    return fragment.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\")
  }
}

export function looksLikeFailedTextAction(content: string): boolean {
  return /"action"\s*:/.test(content) && !parseTextAction(content)
}

export function textActionNeedsFollowUp(content: string): boolean {
  if (parseTextAction(content)) return false
  if (looksLikeFailedTextAction(content)) return true
  const t = content.trim().toLowerCase()
  if (!t) return true
  if (/\b(done|complete|finished)\b/.test(t) && t.length < 200) return false
  return !/\{/.test(content)
}

export function buildTextActionRetryMessage(): string {
  return `Return ONE JSON object (not an array) inside a \`\`\`json fence.
To open a section: {"action":"click","section":"Work experience"}
To fill: {"action":"fill_fields","fields":[{"selector":"#cvjob-position","value":"Engineer"}]}`
}

/** Convert model text into executable tool calls (non-tool models). */
export function textActionToToolCalls(
  content: string
): Array<{ name: string; args: Record<string, unknown> }> {
  const action = parseTextAction(content)
  if (!action || action.name === "done") {
    return action?.name === "done" ? [{ name: "done", args: action.args }] : []
  }
  return [{ name: action.name, args: action.args }]
}

/** Append JSON-action instructions to the agent system prompt. */
export function appendTextActionInstructions(
  messages: OllamaMessage[],
  compact = false
): void {
  const addon = compact ? buildCompactTextActionSystemPrompt() : buildTextActionSystemPrompt()
  const system = messages.find((m) => m.role === "system")
  if (system) {
    if (!system.content.includes("JSON object per turn")) {
      system.content = `${system.content}\n\n${addon}`
    }
    return
  }
  messages.unshift({ role: "system", content: addon })
}
