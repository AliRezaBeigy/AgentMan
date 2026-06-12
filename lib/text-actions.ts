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
- Call done only when every section has all items from the attachment saved.`
}

/** Parse a single browser action from model text (non-tool models). */
export function parseTextAction(content: string): ParsedTextAction | null {
  const trimmed = content.trim()
  const parsed = extractJsonValue(trimmed)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const fromObject = actionFromRecord(parsed as Record<string, unknown>)
    if (fromObject) return fromObject
  }

  return parseTextActionLoose(trimmed)
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
    if (fields.length) return { name, args: { fields } }
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
      if (fields.length) return { name, args: { fields } }
    }
    const stringMatch = content.match(/"fields"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (stringMatch) {
      const fields = parseFillFieldsArg(unescapeJsonString(stringMatch[1]))
      if (fields.length) return { name, args: { fields } }
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
  return `Your JSON action could not be parsed. Return ONE valid action inside a \`\`\`json fence.
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
export function appendTextActionInstructions(messages: OllamaMessage[]): void {
  const addon = buildTextActionSystemPrompt()
  const system = messages.find((m) => m.role === "system")
  if (system) {
    if (!system.content.includes("does NOT support native tool calling")) {
      system.content = `${system.content}\n\n${addon}`
    }
    return
  }
  messages.unshift({ role: "system", content: addon })
}
