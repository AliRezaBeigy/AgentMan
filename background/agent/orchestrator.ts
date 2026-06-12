import { devLog, devLogError } from "~/lib/dev-log"
import {
  buildFillInstruction,
  buildMissingFieldHints,
  extractJsonValue,
  fieldFillKey,
  getFillableFields,
  getMissingFillKeys,
  mergeFillObject,
  parseFillMappings
} from "~/lib/fill-parse"
import { buildPageContextNote, getLastUserMessage, pruneInvalidFillKeys } from "~/lib/fill-intent"
import {
  buildFlatRowKeyRetryMessage,
  detectDuplicateFlatKeysInRaw,
  getMaxRowIndexFromFillData,
  getRowColumnNames,
  normalizeFillResponse
} from "~/lib/fill-rows"
import { extractRowFieldKeys } from "~/lib/fill-values"
import { executeTool } from "~/background/tools/executor"
import { chat, type OllamaMessage } from "~/lib/ollama/client"
import { AGENT_TOOLS } from "~/lib/ollama/tools"
import { expandSnippetsInText } from "~/lib/snippets"
import { getSettings } from "~/lib/storage"
import { sendToPageTab } from "~/lib/tab-messaging"
import { MessageType, type ChatHistoryEntry } from "~/lib/messages"
import { buildStagedFilesContextNote } from "~/lib/staged-files"
import type {
  AgentState,
  ChatMode,
  PageContext,
  StagedFile
} from "~/lib/types"

export interface AgentContext {
  sessionId: string
  tabId: number
  mode: ChatMode
  getPageContext: () => Promise<PageContext>
  captureScreenshot: () => Promise<string>
  resolveStagedFilePath: (fileId: string) => Promise<string | null>
  onStream: (delta: string) => void
  onDone: (content: string) => void
  onError: (error: string) => void
}

class AgentController {
  private state: AgentState = { status: "idle", iteration: 0 }
  private abort = false
  private paused = false

  getState(): AgentState {
    return this.state
  }

  pause(): void {
    if (this.state.status === "running") {
      this.paused = true
      this.state = { ...this.state, status: "paused" }
      this.broadcastState()
    }
  }

  resume(): void {
    if (this.state.status === "paused") {
      this.paused = false
      this.state = { ...this.state, status: "running" }
      this.broadcastState()
    }
  }

  stop(): void {
    this.abort = true
    this.paused = false
    this.state = { status: "stopped", iteration: this.state.iteration }
    this.broadcastState()
  }

  private broadcastState(): void {
    chrome.runtime.sendMessage({
      type: MessageType.AGENT_STATE,
      payload: this.state
    })
  }

  async run(
    userContent: string,
    images: string[] | undefined,
    history: ChatHistoryEntry[] | undefined,
    ctx: AgentContext,
    stagedFiles: StagedFile[] = []
  ): Promise<void> {
    this.abort = false
    this.paused = false
    this.state = { status: "running", iteration: 0 }
    this.broadcastState()

    const settings = await getSettings()
    const model =
      ctx.mode === "fill"
        ? settings.fillModel
        : ctx.mode === "agent"
          ? settings.agentModel
          : settings.assistModel

    if (!model) {
      ctx.onError("No model configured for this mode. Open Settings and select a model.")
      this.state = { status: "idle", iteration: 0 }
      this.broadcastState()
      return
    }

    await chrome.tabs.sendMessage(ctx.tabId, { type: MessageType.SHOW_STOP_OVERLAY })

    try {
      const expanded = await expandSnippetsInText(userContent)
      const fileContext = buildStagedFilesContextNote(stagedFiles)
      const userWithContext = fileContext ? `${expanded}${fileContext}` : expanded
      const pageContext = await ctx.getPageContext()
      const historyMessages = await buildHistoryMessages(history)

      const messages: OllamaMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt(ctx.mode, pageContext)
        },
        ...historyMessages,
        {
          role: "user",
          content: userWithContext,
          images: images?.map(stripDataUrlPrefix)
        }
      ]

      if (ctx.mode === "fill") {
        await this.runFillMode(ctx, messages, model, settings.ollamaHost, pageContext)
        return
      }

      if (ctx.mode === "assist") {
        await this.runAssistMode(ctx, messages, model, settings.ollamaHost)
        return
      }

      await this.runAgentLoop(ctx, messages, model, settings.ollamaHost, settings.maxAgentIterations)
    } catch (error) {
      devLogError("Agent run failed", error, { mode: ctx.mode, tabId: ctx.tabId })
      ctx.onError(error instanceof Error ? error.message : "Agent failed")
    } finally {
      await chrome.tabs.sendMessage(ctx.tabId, { type: MessageType.HIDE_STOP_OVERLAY })
      await chrome.tabs.sendMessage(ctx.tabId, { type: MessageType.HIDE_UI_FOR_SCREENSHOT })
      this.state = { status: "idle", iteration: 0 }
      this.broadcastState()
    }
  }

  private async runAssistMode(
    ctx: AgentContext,
    messages: OllamaMessage[],
    model: string,
    host: string
  ): Promise<void> {
    let full = ""
    const result = await chat({
      host,
      model,
      messages,
      stream: true,
      onChunk: (delta) => {
        full += delta
        ctx.onStream(delta)
      }
    })
    ctx.onDone(result.content || full)
  }

  private async runFillMode(
    ctx: AgentContext,
    messages: OllamaMessage[],
    model: string,
    host: string,
    pageContext: PageContext
  ): Promise<void> {
    const pageContextNote = buildPageContextNote(pageContext)
    const lastUserMessage = getLastUserMessage(messages)

    const fillInstruction: OllamaMessage = {
      role: "system",
      content: buildFillInstruction(pageContext.fields, pageContext.repeatableSections, {
        pageContextNote
      })
    }

    devLog("Fill mode fields", {
      url: pageContext.url,
      count: pageContext.fields.length,
      fields: pageContext.fields.map((f) => ({ selector: f.selector, label: f.label, type: f.type }))
    })

    let fillable = getFillableFields(pageContext.fields)
    let fillableCount = fillable.length
    let requiredKeys = fillable.map((f, i) => fieldFillKey(f, i))

    const accumulated = new Map<string, { selector: string; value: string | boolean }>()
    const appliedSelectors = new Set<string>()
    const mergedValues: Record<string, unknown> = {}
    const fillMessages: OllamaMessage[] = [...messages, fillInstruction]
    let lastRaw = ""

    const maxAttempts = 4
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      lastRaw = await this.requestFillJson(host, model, fillMessages)
      const parsed = extractJsonValue(lastRaw)
      const normalized = normalizeFillResponse(parsed, fillable)

      const rowColumns = getRowColumnNames(fillable)
      const duplicatedFlat = detectDuplicateFlatKeysInRaw(lastRaw, rowColumns)
      const normalizedRowCount = normalized ? getMaxRowIndexFromFillData(normalized) : 0

      if (duplicatedFlat.length > 0 && normalizedRowCount <= 1) {
        devLog("Fill mode rejected flat duplicate row keys", {
          duplicatedFlat,
          normalizedRowCount
        })
        fillMessages.push(
          { role: "assistant", content: lastRaw },
          {
            role: "user",
            content: buildFlatRowKeyRetryMessage(duplicatedFlat, rowColumns, lastUserMessage)
          }
        )
        continue
      }

      if (normalized) {
        mergeFillObject(mergedValues, normalized)
      } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        mergeFillObject(mergedValues, parsed)
      }
      pruneInvalidFillKeys(mergedValues)

      await this.ensureRowsForMergedValues(ctx.tabId, mergedValues)
      const freshFields = await this.refreshFillableFields(ctx.tabId)
      if (freshFields.length) {
        fillable = freshFields
        fillableCount = fillable.length
        requiredKeys = fillable.map((f, i) => fieldFillKey(f, i))
      }

      const attemptMappings = parseFillMappings(
        JSON.stringify(mergedValues),
        fillable
      )
      accumulated.clear()
      for (const mapping of attemptMappings) {
        accumulated.set(mapping.selector, mapping)
      }

      await this.applyFillMappingsIncremental(ctx.tabId, accumulated, appliedSelectors)

      devLog(`Fill mode attempt ${attempt + 1}`, {
        raw: lastRaw,
        mergedValues,
        attemptMappings,
        accumulated: Array.from(accumulated.values()),
        applied: Array.from(appliedSelectors),
        requiredKeys,
        fillableCount
      })

      if (accumulated.size >= fillableCount) break

      const missingKeys = getMissingFillKeys(fillable, accumulated)
      if (attempt === maxAttempts - 1) break

      const isLastRetry = attempt === maxAttempts - 2
      const retryTemplate = isLastRetry
        ? Object.fromEntries(requiredKeys.map((k) => [k, "<value>"]))
        : Object.fromEntries(missingKeys.map((k) => [k, "<value>"]))
      const optionHints = buildMissingFieldHints(fillable, missingKeys)
      const userRequestReminder = lastUserMessage
        ? `\n\nUser request: "${lastUserMessage}". If they need more line items than rows on screen, include additional "Row N - …" keys in your JSON (e.g. Row 5 through Row 8). Row keys drive which section grows — do not use item1/item2 keys.`
        : ""

      fillMessages.push(
        { role: "assistant", content: lastRaw },
        {
          role: "user",
          content: isLastRetry
            ? `Still incomplete. Return ONE JSON object with ALL ${requiredKeys.length} keys (copy verbatim):
${JSON.stringify(retryTemplate, null, 2)}${optionHints}${userRequestReminder}`
            : `Still missing ${missingKeys.length} field(s). Return ONLY a JSON object with EXACTLY these keys (copy verbatim, no extras):
${JSON.stringify(retryTemplate, null, 2)}${optionHints}${userRequestReminder}`
        }
      )
    }

    const mappings = Array.from(accumulated.values())
    const missingKeys = getMissingFillKeys(fillable, accumulated)

    if (!mappings.length) {
      ctx.onError(
        "Could not apply fill data — the model did not return usable field mappings. Try again or switch to Agent mode."
      )
      return
    }

    await this.applyFillMappingsIncremental(ctx.tabId, accumulated, appliedSelectors, true)

    const applied = appliedSelectors.size
    const failed = mappings.length - applied

    if (missingKeys.length > 0) {
      ctx.onError(
        `Filled ${applied} field(s) live, but ${missingKeys.length} still missing after ${maxAttempts} attempts: ${missingKeys.join(", ")}. Try again or use Agent mode.`
      )
      return
    }

    if (applied === 0) {
      ctx.onError(`Found ${mappings.length} mapping(s) but could not set any field values on the page.`)
      return
    }

    const suffix = failed > 0 ? ` (${failed} field(s) could not be set on the page)` : ""
    ctx.onDone(`Filled ${applied} field(s) on ${pageContext.title || pageContext.url}${suffix}.`)
  }

  private async refreshPageContext(tabId: number): Promise<PageContext | null> {
    const response = await sendToPageTab<{ type: string; payload: PageContext }>(tabId, {
      type: MessageType.GET_PAGE_CONTEXT
    })
    return response?.payload ?? null
  }

  private async refreshFillableFields(tabId: number): Promise<import("~/lib/types").FormFieldDescriptor[]> {
    const context = await this.refreshPageContext(tabId)
    if (!context?.fields) return []
    return getFillableFields(context.fields)
  }

  private async ensureRowsForMergedValues(
    tabId: number,
    mergedValues: Record<string, unknown>
  ): Promise<void> {
    const keys = Object.keys(mergedValues)
    const minRows = getMaxRowIndexFromFillData(mergedValues)
    if (minRows <= 0) return

    const rowKeys = extractRowFieldKeys(keys)
    const result = await sendToPageTab<{ ok?: boolean; added?: number; rowCount?: number }>(
      tabId,
      {
        type: MessageType.ENSURE_REPEATABLE_ROWS,
        payload: { minRows, rowKeys }
      }
    )

    devLog("Fill mode ensure rows", { minRows, rowKeys, result })
  }

  private async applyFillMappingsIncremental(
    tabId: number,
    accumulated: Map<string, { selector: string; value: string | boolean }>,
    appliedSelectors: Set<string>,
    highlight = false
  ): Promise<void> {
    const pending = Array.from(accumulated.values()).filter((m) => !appliedSelectors.has(m.selector))
    if (!pending.length) return

    if (highlight) {
      await sendToPageTab(tabId, {
        type: MessageType.FILL_HIGHLIGHT,
        payload: { mappings: Array.from(accumulated.values()) }
      })
    }

    const applyRes = await sendToPageTab<{
      ok?: boolean
      results?: Array<{ ok: boolean; selector?: string; error?: string }>
    }>(tabId, {
      type: MessageType.FILL_APPLY,
      payload: { mappings: pending }
    })

    if (!applyRes?.results) {
      devLogError("Fill mode incremental apply failed", new Error("FILL_APPLY failed"), {
        tabId,
        pending
      })
      return
    }

    devLog("Fill mode incremental apply", applyRes.results)
    for (const result of applyRes.results) {
      if (result.ok && result.selector) {
        appliedSelectors.add(result.selector)
      }
    }
  }

  private async requestFillJson(
    host: string,
    model: string,
    messages: OllamaMessage[]
  ): Promise<string> {
    const result = await chat({
      host,
      model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0 }
    })
    return result.content
  }

  private async runAgentLoop(
    ctx: AgentContext,
    messages: OllamaMessage[],
    model: string,
    host: string,
    maxIterations: number
  ): Promise<void> {
    let finalContent = ""

    for (let i = 0; i < maxIterations; i++) {
      if (this.abort) break
      while (this.paused && !this.abort) {
        await sleep(200)
      }
      if (this.abort) break

      this.state = {
        status: "running",
        iteration: i + 1,
        currentAction: `Thinking (step ${i + 1})`
      }
      this.broadcastState()

      let stepContent = ""
      const result = await chat({
        host,
        model,
        messages,
        tools: AGENT_TOOLS,
        stream: true,
        onChunk: (delta) => {
          stepContent += delta
          ctx.onStream(delta)
        }
      })

      if (result.toolCalls.length === 0) {
        finalContent = result.content || stepContent
        break
      }

      if (i === 0 && (result.content || stepContent)) {
        ctx.onStream(`\n\n**Plan:** ${result.content || stepContent}\n\n`)
      }

      messages.push({
        role: "assistant",
        content: result.content || stepContent,
      })

      for (const call of result.toolCalls) {
        if (this.abort) break
        const toolName = call.function.name
        const args = call.function.arguments ?? {}
        this.state = {
          status: "running",
          iteration: i + 1,
          currentAction: `${toolName}(...)`
        }
        this.broadcastState()

        const toolResult = await executeTool(ctx.tabId, toolName, args, {
          getPageContext: ctx.getPageContext,
          captureScreenshot: ctx.captureScreenshot,
          resolveStagedFilePath: ctx.resolveStagedFilePath
        })

        messages.push({
          role: "tool",
          tool_name: toolName,
          content: JSON.stringify(toolResult)
        })
      }
    }

    if (this.state.iteration >= maxIterations && !finalContent) {
      ctx.onError(`Agent reached the maximum of ${maxIterations} iterations.`)
      return
    }

    ctx.onDone(finalContent || "Task completed.")
  }
}

function buildSystemPrompt(mode: ChatMode, pageContext: PageContext): string {
  const base = `You are AgentMan, a browser assistant. Current page: ${pageContext.title} (${pageContext.url}).`
  if (mode === "assist") {
    return `${base} Extract and summarize information from the page context. Return structured markdown tables or bullet lists when appropriate.`
  }
  if (mode === "fill") {
    const contextNote = buildPageContextNote(pageContext, 1200)
    return `${base} You fill web forms by returning JSON values for each field key provided in the instructions.${contextNote}`
  }
  return `${base} Use tools to complete multi-step browser tasks. Ask before submit/delete when uncertain.`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripDataUrlPrefix(dataUrl: string): string {
  const index = dataUrl.indexOf(",")
  return index >= 0 ? dataUrl.slice(index + 1) : dataUrl
}

async function buildHistoryMessages(
  history: ChatHistoryEntry[] | undefined
): Promise<OllamaMessage[]> {
  if (!history?.length) return []

  const messages: OllamaMessage[] = []
  for (const entry of history) {
    const content =
      entry.role === "user"
        ? await expandSnippetsInText(entry.content)
        : entry.content
    messages.push({
      role: entry.role,
      content,
      images: entry.images?.map(stripDataUrlPrefix)
    })
  }
  return messages
}

export const agentController = new AgentController()
