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
Example: {"action":"click","section":"<section label from form>"}
fill must use {"selector":"...","value":"data from attachment"} — one field per turn, never batch multiple fields.
Wait for the action result before the next turn.`
}

export function buildTextActionSystemPrompt(): string {
  return `IMPORTANT: This model does NOT support native tool calling. Do not describe tools — return JSON actions only.

Return EXACTLY ONE JSON object per turn inside a \`\`\`json fence. No text before or after the fence.

Actions:
- {"action":"click","section":"<section label>"}
- {"action":"fill","selector":"<field alias or selector>","value":"<value from attachment>"}
- {"action":"get_page_content"}
- {"action":"done","message":"summary when finished"}

Rules:
- To OPEN a section, use {"action":"click","section":"<exact section label>"} — do NOT use onclick selectors.
- Copy field selectors exactly from the field list (do not guess ids).
- Finish ALL items in one section before opening the next.
- One fill per field — call fill again for each remaining required field; extension auto-saves when all required fields are filled.
- Call done only when every section has all items from the attachment saved.
- NEVER return a JSON array of actions — one object per turn only.
- NEVER batch multiple fields in one action — use fill once per field.`
}

export function buildTextActionJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["click", "fill", "done", "get_page_content"]
      },
      section: { type: "string" },
      selector: { type: "string" },
      value: { type: "string" },
      message: { type: "string" }
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

export function fillActionHasValue(args: Record<string, unknown>): boolean {
  const selector = String(args.selector ?? "").trim()
  const value = String(args.value ?? "")
  if (selector && value.trim()) return true
  const fields = parseFillFieldsArg(args.fields)
  return fields.some((field) => field.value.trim().length > 0)
}

/** @deprecated Use fillActionHasValue */
export const fillFieldsActionHasValues = fillActionHasValue

export function buildMultiActionRejectionMessage(): string {
  return `Do NOT return a JSON array of steps. Return ONE JSON object for the immediate next action only, then wait for the result.
Example next step: {"action":"click","section":"<section label>"}`
}

export function buildEmptyFillRejectionMessage(): string {
  return `fill must include "selector" and "value" from the user's attachment — not field labels/types/options.
Example: {"action":"fill","selector":"<field alias>","value":"<value from attachment>"}`
}

/** @deprecated Use buildEmptyFillRejectionMessage */
export const buildEmptyFillFieldsRejectionMessage = buildEmptyFillRejectionMessage

export function buildBatchFillRejectionMessage(): string {
  return `Do NOT batch multiple fields in one action. Call fill once per field:
{"action":"fill","selector":"<first field alias>","value":"<value from attachment>"}
Then wait for the result and call fill again for the next field.`
}

export function shouldSuppressActionArrayStream(content: string): boolean {
  return looksLikeRootActionArrayStarting(content)
}

function fillActionFromFields(
  fields: Array<{ selector: string; value: string }>
): ParsedTextAction | null {
  if (!fields.length || fields.every((field) => !field.value.trim())) return null
  if (fields.length > 1) return null
  return {
    name: "fill",
    args: { selector: fields[0]!.selector, value: fields[0]!.value }
  }
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

  if (name === "fill") {
    const selector = String(obj.selector ?? "").trim()
    const value = String(obj.value ?? "")
    if (!selector || !value.trim()) return null
    return { name: "fill", args: { selector, value } }
  }

  if (name === "fill_fields") {
    return fillActionFromFields(parseFillFieldsArg(obj.fields))
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
    const selector = extractJsonStringValue(content, "selector")
    const valueMatch = content.match(/"value"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (!selector || !valueMatch) return null
    return {
      name: "fill",
      args: { selector, value: unescapeJsonString(valueMatch[1]) }
    }
  }

  if (name === "fill_fields") {
    const arrayMatch = content.match(/"fields"\s*:\s*(\[[\s\S]*\])/)
    if (arrayMatch) {
      return fillActionFromFields(parseFillFieldsArg(arrayMatch[1]))
    }
    const stringMatch = content.match(/"fields"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (stringMatch) {
      return fillActionFromFields(parseFillFieldsArg(unescapeJsonString(stringMatch[1])))
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

export function looksLikeBatchFillFields(content: string): boolean {
  const parsed = extractJsonValue(content.trim())
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false
  const action = String((parsed as Record<string, unknown>).action ?? "").trim()
  if (action !== "fill_fields") return false
  return parseFillFieldsArg((parsed as Record<string, unknown>).fields).length > 1
}

export function looksLikeFailedTextAction(content: string): boolean {
  if (looksLikeBatchFillFields(content)) return true
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
To open a section: {"action":"click","section":"<section label>"}
To fill ONE field: {"action":"fill","selector":"<field alias>","value":"<value from attachment>"}`
}

export function buildTextActionRetryMessageForContent(content: string): string {
  if (looksLikeBatchFillFields(content)) {
    return buildBatchFillRejectionMessage()
  }
  return buildTextActionRetryMessage()
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
