import {
  buildAssistantHistoryMessage
} from "~/lib/agent-history"
import {
  buildThinkingStep,
  buildToolRunningStep,
  formatAgentToolStepLabel,
  thinkingStepId,
  toolStepId
} from "~/lib/agent-steps"
import {
  compactToolResultForAgent,
  formatAgentToolResultMessage,
  formatCompactAgentToolResultMessage
} from "~/lib/agent-tool-messages"
import { cdpSession } from "~/background/cdp/session"
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
  assistantTurnNeedsToolFollowUp,
  assistantClaimsTaskComplete,
  buildAgentContinuationNudge,
  buildFalseCompletionNudge,
  buildAgentSystemPrompt,
  buildCompactAddEntrySystemPrompt,
  buildAddEntryTurnHint,
  ADD_ENTRY_TURN_HINT_PREFIX,
  buildPrematureDoneRejection,
  estimateDelegatedAgentIterations,
  filterFieldsForIntent,
  shouldDelegateFillToAgent
} from "~/lib/page-form-context"
import {
  buildFlatRowKeyRetryMessage,
  detectDuplicateFlatKeysInRaw,
  getMaxRowIndexFromFillData,
  getRowColumnNames,
  normalizeFillResponse
} from "~/lib/fill-rows"
import {
  buildAddEntryAdvanceMessage,
  buildFillFieldsSignature,
  findAddEntrySectionForFilledFields,
  pickCssSelector,
  type FilledFieldRef
} from "~/lib/add-entry-workflow"
import {
  diffSavedEntries,
  formatLastSavedSummary,
  getSectionSavedCount
} from "~/lib/add-entry-saved-rows"
import { buildFillFieldAliasRegistry } from "~/lib/fill-field-aliases"
import {
  getSectionFillableFields,
  resolveFillFieldMappings,
  resolveFillFieldSelector
} from "~/lib/fill-selector-resolve"
import { extractRowFieldKeys } from "~/lib/fill-values"
import { normalizeToolArguments, parseFillFieldsArg } from "~/lib/tool-args"
import {
  formatCompletionDoneHint,
  getSectionEntryRemaining,
  isAddEntryTaskComplete
} from "~/lib/add-entry-completion"
import {
  buildDuplicateEntryMessage,
  findDuplicateSavedEntry
} from "~/lib/add-entry-duplicate"
import {
  buildRepeatFillMessage,
  buildFillContinuationMessage,
  getNextRequiredFillTarget,
  getSessionMissingRequiredFields,
  isFieldAlreadyFilled,
  seedFilledSelectorMap,
  selectorToFillAlias
} from "~/lib/fill-progress"
import {
  buildMissingRequiredMessage
} from "~/lib/required-field-detect"
import { submitAddEntryAndWait } from "~/background/add-entry-submit"
import { waitForAddEntryFormClosed, waitForAddEntryFormReady } from "~/background/add-entry-wait"
import { openAddEntrySection } from "~/lib/add-entry-open"
import { executeTool, fillFieldsSequential, type ToolResult } from "~/background/tools/executor"
import { resolveAgentClickArgs } from "~/lib/add-entry-timing"
import { chat, ChatAbortedError, OllamaToolsNotSupportedError, type OllamaMessage } from "~/lib/ollama/client"
import type { OllamaToolCall } from "~/lib/types"
import {
  appendTextActionInstructions,
  buildMultiActionRejectionMessage,
  buildTextActionJsonSchema,
  buildTextActionRetryMessageForContent,
  countTextActionsInContent,
  looksLikeActionArray,
  looksLikeFailedTextAction,
  looksLikeRootActionArrayStarting,
  textActionNeedsFollowUp,
  textActionToToolCalls
} from "~/lib/text-actions"
import { AGENT_TOOLS } from "~/lib/ollama/tools"
import { expandSnippetsInText } from "~/lib/snippets"
import { getSettings } from "~/lib/storage"
import {
  extractFillFieldsFromToolArguments,
  extractSingleFillFromToolArguments,
  markFieldFilled
} from "~/lib/fill-sequential"
import {
  extractCompleteFillFromStream,
  extractCompleteFillObjectEntriesFromStream,
  looksLikeFillFieldsStream,
  type StreamFillField
} from "~/lib/streaming-fill"
import { sendToPageTab } from "~/lib/tab-messaging"
import { MessageType, type ChatHistoryEntry } from "~/lib/messages"
import { buildStagedFilesContextNote } from "~/lib/staged-files"
import type {
  AddEntrySectionDescriptor,
  AgentState,
  ChatMode,
  PageContext,
  StagedFile,
  AgentActivityStep
} from "~/lib/types"

export interface AgentLoopOptions {
  addEntryMode?: boolean
  ollamaKeepAlive?: string | number
}

export interface AgentContext {
  sessionId: string
  tabId: number
  mode: ChatMode
  getPageContext: () => Promise<PageContext>
  captureScreenshot: () => Promise<string>
  resolveStagedFilePath: (fileId: string) => Promise<string | null>
  onStream: (delta: string) => void
  onAgentStep?: (step: AgentActivityStep) => void
  onDone: (content: string) => void
  onError: (error: string) => void
}

class AgentController {
  private state: AgentState = { status: "idle", iteration: 0 }
  private abort = false
  private paused = false
  private lastFillFieldsSignature: string | null = null
  private addEntryCounts = new Map<string, number>()
  private addEntryBaselineCounts = new Map<string, number>()
  private addEntrySessionCounts = new Map<string, number>()
  private addEntrySectionsSnapshot: AddEntrySectionDescriptor[] = []
  private lastAgentToolName: string | null = null
  private openAddEntrySectionLabel: string | null = null
  private addEntryUserMessage: string | null = null
  private fieldAliasMap: Map<string, string> | null = null
  /** Resolved selector → value for the current add-entry form (one fill per turn). */
  private addEntryPartialFills = new Map<string, string>()
  /** Models that returned "does not support tools" — use JSON text actions instead. */
  private readonly toolsSupportCache = new Map<string, boolean>()

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

    try {
      await chrome.tabs.sendMessage(ctx.tabId, { type: MessageType.HIDE_UI_FOR_SCREENSHOT })
    } catch {
      /* content script may not be ready */
    }

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

      await this.runAgentLoop(ctx, messages, model, settings.ollamaHost, settings.maxAgentIterations, {
        ollamaKeepAlive: settings.ollamaKeepAlive
      })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Agent failed"
      devLogError("Agent run failed", error, { mode: ctx.mode, tabId: ctx.tabId })
      ctx.onError(errMsg)
    } finally {
      try {
        await chrome.tabs.sendMessage(ctx.tabId, { type: MessageType.SHOW_UI_AFTER_SCREENSHOT })
      } catch {
        /* tab closed or content script unavailable */
      }
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
    const lastUserMessage = getLastUserMessage(messages)
    const delegateToAgent = shouldDelegateFillToAgent(pageContext, lastUserMessage)

    if (delegateToAgent) {
      devLog("Fill mode delegating to agent (multi-step Add-entry sections)", {
        url: pageContext.url,
        addEntrySections: pageContext.addEntrySections
      })
      const { aliasToSelector } = buildFillFieldAliasRegistry(pageContext, lastUserMessage)
      this.fieldAliasMap = aliasToSelector
      const agentMessages: OllamaMessage[] = [
        { role: "system", content: buildCompactAddEntrySystemPrompt(pageContext, lastUserMessage) },
        ...messages.filter((m) => m.role !== "system")
      ]
      const settings = await getSettings()
      const iterationBudget = estimateDelegatedAgentIterations(
        pageContext,
        lastUserMessage,
        settings.maxAgentIterations
      )
      devLog("Delegated agent iteration budget", { iterationBudget })
      await this.runAgentLoop(ctx, agentMessages, model, host, iterationBudget, {
        addEntryMode: true,
        ollamaKeepAlive: settings.ollamaKeepAlive
      })
      return
    }

    const pageContextNote = buildPageContextNote(pageContext)
    const scopedFields = filterFieldsForIntent(
      pageContext.fields,
      lastUserMessage,
      pageContext.addEntrySections ?? []
    )
    const allFillableCount = getFillableFields(pageContext.fields).length
    const useScopedFields =
      scopedFields.length > 0 && scopedFields.length < allFillableCount
    const targetFields = useScopedFields ? scopedFields : pageContext.fields

    const fillInstruction: OllamaMessage = {
      role: "system",
      content: buildFillInstruction(targetFields, pageContext.repeatableSections, {
        pageContextNote
      })
    }

    devLog("Fill mode fields", {
      url: pageContext.url,
      count: pageContext.fields.length,
      scopedCount: scopedFields.length,
      useScopedFields,
      addEntrySections: pageContext.addEntrySections,
      fields: targetFields.map((f) => ({ selector: f.selector, label: f.label, type: f.type }))
    })

    let fillable = getFillableFields(targetFields)
    let fillableCount = fillable.length
    let requiredKeys = fillable.map((f, i) => fieldFillKey(f, i))

    const accumulated = new Map<string, { selector: string; value: string | boolean }>()
    const appliedSelectors = new Set<string>()
    const mergedValues: Record<string, unknown> = {}
    const fillMessages: OllamaMessage[] = [...messages, fillInstruction]
    let lastRaw = ""

    const maxAttempts = 4
    const requiredKeySet = () => new Set(requiredKeys)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const applyPartialFill = async (partial: Record<string, unknown>) => {
        mergeFillObject(mergedValues, partial)
        pruneInvalidFillKeys(mergedValues)

        await this.ensureRowsForMergedValues(ctx.tabId, mergedValues)
        const freshFields = await this.refreshFillableFields(ctx.tabId)
        if (freshFields.length) {
          fillable = freshFields
          fillableCount = fillable.length
          requiredKeys = fillable.map((f, i) => fieldFillKey(f, i))
        }

        const attemptMappings = parseFillMappings(JSON.stringify(mergedValues), fillable)
        accumulated.clear()
        for (const mapping of attemptMappings) {
          accumulated.set(mapping.selector, mapping)
        }

        await this.applyFillMappingsIncremental(ctx.tabId, accumulated, appliedSelectors)
      }

      lastRaw = await this.requestFillJsonStreaming(
        host,
        model,
        fillMessages,
        requiredKeySet(),
        applyPartialFill
      )
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

  /** Stream fill JSON and invoke onPartial as each top-level key completes. */
  private async requestFillJsonStreaming(
    host: string,
    model: string,
    messages: OllamaMessage[],
    allowedKeys: ReadonlySet<string>,
    onPartial: (entries: Record<string, unknown>) => Promise<void>
  ): Promise<string> {
    let raw = ""
    const appliedKeys = new Set<string>()
    let applyChain = Promise.resolve()

    await chat({
      host,
      model,
      messages,
      stream: true,
      format: "json",
      options: { temperature: 0 },
      onChunk: (delta) => {
        raw += delta
        const entries = extractCompleteFillObjectEntriesFromStream(
          raw,
          appliedKeys,
          allowedKeys.size > 0 ? allowedKeys : undefined
        )
        if (!entries.length) return

        const partial: Record<string, unknown> = {}
        for (const entry of entries) {
          partial[entry.key] = entry.value
          appliedKeys.add(entry.key)
        }

        applyChain = applyChain.then(() => onPartial(partial))
      }
    })

    await applyChain
    return raw
  }

  private queueStreamFieldFills(
    ctx: AgentContext,
    fields: StreamFillField[],
    streamFilledSelectors: Map<string, string>,
    streamFillChain: { promise: Promise<void> },
    iteration: number,
    openSectionLabel: string | null
  ): void {
    for (const field of fields) {
      streamFillChain.promise = streamFillChain.promise.then(async () => {
        try {
          const pageContext = await ctx.getPageContext()
          const candidates = openSectionLabel
            ? getSectionFillableFields(pageContext, openSectionLabel)
            : pageContext.fields
          const selector =
            resolveFillFieldSelector(field.selector, candidates, this.fieldAliasMap ?? undefined) ??
            field.selector

          const results = await fillFieldsSequential(ctx.tabId, [
            { selector, value: field.value }
          ])
          const applied = results[0]
          if (!applied?.ok) {
            devLog("Stream fill failed", { field, selector, error: applied?.error })
            return
          }

          markFieldFilled(streamFilledSelectors, field.selector, selector, field.value)
          this.addEntryPartialFills.set(selector, field.value)
          this.state = {
            status: "running",
            iteration,
            currentAction: `Filling field (${streamFilledSelectors.size})`
          }
          this.broadcastState()
        } catch (error) {
          devLog("Stream fill failed", { field, error })
        }
      })
    }
  }

  private processStreamFillContent(
    ctx: AgentContext,
    content: string,
    streamFilledSelectors: Map<string, string>,
    streamFillChain: { promise: Promise<void> },
    iteration: number,
    openSectionLabel: string | null
  ): void {
    const field = extractCompleteFillFromStream(content, streamFilledSelectors)
    if (!field) return
    this.queueStreamFieldFills(
      ctx,
      [field],
      streamFilledSelectors,
      streamFillChain,
      iteration,
      openSectionLabel
    )
  }

  private processStreamFillToolCalls(
    ctx: AgentContext,
    toolCalls: OllamaToolCall[],
    streamFilledSelectors: Map<string, string>,
    streamFillChain: { promise: Promise<void> },
    iteration: number,
    openSectionLabel: string | null
  ): void {
    for (const call of toolCalls) {
      if (call.function.name === "fill_fields") {
        const batch = extractFillFieldsFromToolArguments(
          call.function.arguments,
          streamFilledSelectors
        )
        if (batch.length > 1) continue
        if (batch.length === 1) {
          this.queueStreamFieldFills(
            ctx,
            [batch[0]!],
            streamFilledSelectors,
            streamFillChain,
            iteration,
            openSectionLabel
          )
        }
        continue
      }

      if (call.function.name !== "fill") continue
      const field = extractSingleFillFromToolArguments(call.function.arguments)
      if (!field || streamFilledSelectors.get(field.selector) === field.value) continue
      devLog("Stream fill from tool call", { selector: field.selector })
      this.queueStreamFieldFills(
        ctx,
        [field],
        streamFilledSelectors,
        streamFillChain,
        iteration,
        openSectionLabel
      )
    }
  }

  private async runAgentLoop(
    ctx: AgentContext,
    messages: OllamaMessage[],
    model: string,
    host: string,
    maxIterations: number,
    options: AgentLoopOptions = {}
  ): Promise<void> {
    let finalContent = ""
    this.lastFillFieldsSignature = null
    this.addEntryCounts.clear()
    this.addEntryBaselineCounts.clear()
    this.addEntrySessionCounts.clear()
    this.addEntrySectionsSnapshot = []
    this.lastAgentToolName = null
    this.openAddEntrySectionLabel = null
    this.addEntryUserMessage = null
    this.addEntryPartialFills.clear()
    let continuationNudges = 0
    const maxContinuationNudges = 12
    let textActionMode = this.toolsSupportCache.get(model) === false
    const keepAlive =
      options.ollamaKeepAlive ?? (await getSettings()).ollamaKeepAlive

    if (options.addEntryMode) {
      this.addEntryUserMessage = getLastUserMessage(messages)
      const initialContext = await ctx.getPageContext()
      this.addEntrySectionsSnapshot = initialContext.addEntrySections ?? []
      for (const section of this.addEntrySectionsSnapshot) {
        const baseline = getSectionSavedCount(section)
        this.addEntryBaselineCounts.set(section.sectionLabel, baseline)
        this.addEntrySessionCounts.set(section.sectionLabel, 0)
        this.addEntryCounts.set(section.sectionLabel, baseline)
      }
    }

    if (textActionMode) {
      appendTextActionInstructions(messages, Boolean(options.addEntryMode))
    }

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

      const iteration = i + 1
      ctx.onAgentStep?.(buildThinkingStep(iteration))

      if (options.addEntryMode) {
        await this.injectAddEntryTurnHint(ctx, messages, textActionMode)
      }

      let stepContent = ""
      let thinkingTrace = ""
      const streamFillChain = { promise: Promise.resolve() as Promise<void> }
      const streamFilledSelectors = seedFilledSelectorMap(
        this.addEntryPartialFills,
        this.fieldAliasMap ?? undefined
      )
      let result: Awaited<ReturnType<typeof chat>>

      const appendThinkingTrace = (delta: string) => {
        if (!delta) return
        thinkingTrace += delta
        ctx.onAgentStep?.({
          id: thinkingStepId(iteration),
          label: `Step ${iteration}: Thinking…`,
          status: "running",
          detail: thinkingTrace
        })
      }

      try {
        result = await chat({
          host,
          model,
          messages,
          tools: textActionMode ? undefined : AGENT_TOOLS,
          stream: true,
          keepAlive,
          think: true,
          format: textActionMode ? buildTextActionJsonSchema() : undefined,
          shouldAbort: textActionMode
            ? (content) => looksLikeRootActionArrayStarting(content)
            : undefined,
          onThinkingChunk: appendThinkingTrace,
          onChunk: (delta) => {
            stepContent += delta
            if (textActionMode) {
              ctx.onStream(delta)
            } else {
              appendThinkingTrace(delta)
            }
            if (
              !textActionMode &&
              !options.addEntryMode &&
              !looksLikeFillFieldsStream(stepContent)
            ) {
              return
            }
            this.processStreamFillContent(
              ctx,
              stepContent,
              streamFilledSelectors,
              streamFillChain,
              i + 1,
              this.openAddEntrySectionLabel
            )
          },
          onToolCallDelta: (toolCalls) => {
            if (textActionMode) return
            this.processStreamFillToolCalls(
              ctx,
              toolCalls,
              streamFilledSelectors,
              streamFillChain,
              i + 1,
              this.openAddEntrySectionLabel
            )
          }
        })
        if (!textActionMode) {
          this.toolsSupportCache.set(model, true)
        }
      } catch (error) {
        if (error instanceof ChatAbortedError) {
          ctx.onStream("\n\n*Single action only — retrying…*\n\n")
          messages.push({ role: "assistant", content: '{"error":"root_action_array"}' })
          messages.push({ role: "user", content: buildMultiActionRejectionMessage() })
          i--
          continue
        }
        if (!textActionMode && error instanceof OllamaToolsNotSupportedError) {
          textActionMode = true
          this.toolsSupportCache.set(model, false)
          appendTextActionInstructions(messages, Boolean(options.addEntryMode))
          devLog("Switching agent to text-action mode", { model, error: error.message })
          ctx.onStream(
            "\n\n*This model does not support tools — switching to JSON action mode.*\n\n"
          )
          i--
          continue
        }
        throw error
      }

      await streamFillChain.promise

      const text = result.content || stepContent

      let toolCalls = textActionMode
        ? textActionToToolCalls(text)
        : result.toolCalls.map((call) => ({
            name: call.function.name,
            args: normalizeToolArguments(call.function.arguments ?? {})
          }))

      toolCalls = normalizeAgentToolCalls(toolCalls)

      let parsedTextActionFallback = false
      if (!toolCalls.length && !textActionMode) {
        const fallback = textActionToToolCalls(text)
        if (fallback.length) {
          parsedTextActionFallback = true
          toolCalls = normalizeAgentToolCalls(fallback)
          devLog("Parsed text action when native tool_calls were empty", {
            text: text.slice(0, 120),
            tool: fallback[0]?.name
          })
        }
      }

      if (textActionMode && looksLikeActionArray(text)) {
        messages.push({ role: "assistant", content: '{"error":"action_array"}' })
        messages.push({ role: "user", content: buildMultiActionRejectionMessage() })
        continue
      }

      if (!toolCalls.length) {
        if (textActionMode && looksLikeFailedTextAction(text)) {
          devLog("Text action parse failed", { text: text.slice(0, 200) })
          messages.push({ role: "assistant", content: text })
          messages.push({ role: "user", content: buildTextActionRetryMessageForContent(text) })
          continue
        }

        if (options.addEntryMode) {
          const pageContext = await ctx.getPageContext()
          const userMsg = this.addEntryUserMessage ?? getLastUserMessage(messages)
          if (
            isAddEntryTaskComplete(
              userMsg,
              pageContext.addEntrySections ?? [],
              pageContext.fields,
              this.addEntryBaselineCounts
            )
          ) {
            devLog("Add-entry task complete — accepting text-only finish", {
              text: text.slice(0, 120)
            })
            finalContent = text
            break
          }

          if (assistantClaimsTaskComplete(text)) {
            continuationNudges++
            devLog("Agent claimed complete but counts mismatch", { continuationNudges })
            messages.push({ role: "assistant", content: text })
            messages.push({
              role: "user",
              content: buildFalseCompletionNudge(
                userMsg,
                pageContext.addEntrySections ?? [],
                this.addEntryBaselineCounts,
                textActionMode
              )
            })
            continue
          }
        }

        if (
          options.addEntryMode &&
          continuationNudges < maxContinuationNudges &&
          (assistantTurnNeedsToolFollowUp(text) ||
            (textActionMode && textActionNeedsFollowUp(text)) ||
            !text.trim())
        ) {
          continuationNudges++
          devLog("Agent continuation nudge", { continuationNudges, text: text.slice(0, 120) })
          const pageContext = await ctx.getPageContext()
          const userMsg = this.addEntryUserMessage ?? getLastUserMessage(messages)
          messages.push({ role: "assistant", content: text })
          messages.push({
            role: "user",
            content: textActionMode
              ? `Return a JSON action object only. ${buildAgentContinuationNudge(
                  this.addEntryCounts,
                  userMsg,
                  pageContext.addEntrySections ?? [],
                  pageContext.fields,
                  this.addEntryBaselineCounts
                )}`
              : buildAgentContinuationNudge(
                  this.addEntryCounts,
                  userMsg,
                  pageContext.addEntrySections ?? [],
                  pageContext.fields,
                  this.addEntryBaselineCounts
                )
          })
          continue
        }
        finalContent = text
        break
      }

      if (textActionMode) {
        devLog("Text action parsed", { calls: toolCalls })
      }

      ctx.onAgentStep?.({
        id: thinkingStepId(iteration),
        label: toolCalls.length
          ? `Step ${iteration}: Planned next action`
          : `Step ${iteration}: Responding…`,
        status: "done",
        detail: thinkingTrace.trim() || undefined
      })

      const doneCall = toolCalls.find((c) => c.name === "done")
      if (doneCall) {
        if (options.addEntryMode) {
          const pageContext = await ctx.getPageContext()
          const rejection = buildPrematureDoneRejection(
            getLastUserMessage(messages),
            this.addEntryCounts,
            pageContext.addEntrySections ?? [],
            pageContext.fields,
            this.addEntryBaselineCounts
          )
          if (rejection) {
            devLog("Rejected premature done", {
              counts: Object.fromEntries(this.addEntryCounts),
              rejection: rejection.slice(0, 120)
            })
            messages.push({ role: "assistant", content: text })
            messages.push({ role: "user", content: rejection })
            continue
          }
        }
        finalContent = String(doneCall.args.message ?? text)
        break
      }

      if (i === 0 && text && !textActionMode) {
        ctx.onStream(`\n\n**Plan:** ${text}\n\n`)
      }

      messages.push(
        buildAssistantHistoryMessage(
          text,
          toolCalls,
          Boolean(options.addEntryMode),
          textActionMode
        )
      )

      for (let ti = 0; ti < toolCalls.length; ti++) {
        const call = toolCalls[ti]!
        if (this.abort) break
        const toolName = call.name
        const args = call.args
        ctx.onAgentStep?.(buildToolRunningStep(iteration, ti, toolName, args))
        this.state = {
          status: "running",
          iteration: i + 1,
          currentAction: `${toolName}(...)`
        }
        this.broadcastState()

        const toolResult = await this.executeAgentTool(ctx, toolName, args, {
          contentHint: textActionMode || parsedTextActionFallback ? text : undefined,
          streamFilled: streamFilledSelectors
        })

        const compactResult = compactToolResultForAgent(toolName, toolResult)
        const resultMessage =
          options.addEntryMode
            ? formatCompactAgentToolResultMessage(toolName, toolResult)
            : formatAgentToolResultMessage(toolName, toolResult)

        ctx.onAgentStep?.({
          id: toolStepId(iteration, ti),
          label: formatAgentToolStepLabel(toolName, args),
          status: toolResult.ok ? "done" : "error",
          detail: resultMessage
        })

        if (textActionMode) {
          messages.push({
            role: "user",
            content: resultMessage
          })
        } else {
          messages.push({
            role: "tool",
            tool_name: toolName,
            content: JSON.stringify(compactResult)
          })
        }
        this.lastAgentToolName = toolName
      }
    }

    if (this.state.iteration >= maxIterations && !finalContent) {
      ctx.onError(`Agent reached the maximum of ${maxIterations} iterations.`)
      return
    }

    ctx.onDone(finalContent || "Task completed.")
  }

  private async injectAddEntryTurnHint(
    ctx: AgentContext,
    messages: OllamaMessage[],
    textActionMode = false
  ): Promise<void> {
    const pageContext = await ctx.getPageContext()
    this.addEntrySectionsSnapshot = pageContext.addEntrySections ?? this.addEntrySectionsSnapshot
    for (const section of this.addEntrySectionsSnapshot) {
      this.addEntryCounts.set(section.sectionLabel, getSectionSavedCount(section))
    }

    let hint = buildAddEntryTurnHint(
      this.addEntryCounts,
      this.lastAgentToolName,
      this.openAddEntrySectionLabel,
      this.addEntrySectionsSnapshot,
      this.addEntrySessionCounts,
      textActionMode,
      this.addEntryUserMessage ?? undefined,
      this.addEntryBaselineCounts,
      this.buildPartialFilledAliases(pageContext),
      this.getNextFillAliasForOpenSection(pageContext)
    )

    const existingIndex = messages.findIndex(
      (message) =>
        message.role === "user" &&
        typeof message.content === "string" &&
        message.content.startsWith(ADD_ENTRY_TURN_HINT_PREFIX)
    )
    if (existingIndex >= 0) {
      messages.splice(existingIndex, 1)
    }
    messages.push({ role: "user", content: hint })
  }

  private async executeAgentTool(
    ctx: AgentContext,
    toolName: string,
    args: Record<string, unknown>,
    options: { contentHint?: string; streamFilled?: Map<string, string> } = {}
  ): Promise<ToolResult> {
    const toolContext = {
      getPageContext: ctx.getPageContext,
      captureScreenshot: ctx.captureScreenshot,
      resolveStagedFilePath: ctx.resolveStagedFilePath
    }

    if (toolName === "click") {
      const pageContext = await ctx.getPageContext()
      const sections = pageContext.addEntrySections ?? []
      const resolved = resolveAgentClickArgs(args, sections, options.contentHint ?? "")
      const clickTarget = resolved.clickTarget

      if (resolved.selector !== String(args.selector ?? "")) {
        devLog("Resolved add-entry click selector", {
          from: args.selector ?? args.section,
          to: resolved.selector
        })
      }

      if (clickTarget?.kind === "open") {
        await this.closeOtherAddEntrySections(
          ctx,
          clickTarget.section,
          sections,
          toolContext
        )
      }

      const clickArgs = { ...args, selector: resolved.selector }

      if (clickTarget?.kind === "open") {
        const addSelector = pickCssSelector(clickTarget.section.addButtonSelector)
        const alreadyOpen = await waitForAddEntryFormReady(ctx.tabId, clickTarget.section, 500)
        if (alreadyOpen) {
          this.openAddEntrySectionLabel = clickTarget.section.sectionLabel
          this.addEntryPartialFills.clear()
          return {
            ok: true,
            result: {
              clicked: false,
              alreadyOpen: true,
              addEntryWait: {
                formReady: true,
                alreadyOpen: true,
                section: clickTarget.section.sectionLabel,
                clicked: String(clickArgs.selector ?? ""),
                openSelector: addSelector
              }
            }
          }
        }

        const opened = await openAddEntrySection(ctx.tabId, clickTarget.section)
        if (opened) {
          this.openAddEntrySectionLabel = clickTarget.section.sectionLabel
          this.addEntryPartialFills.clear()
        } else {
          this.openAddEntrySectionLabel = null
        }

        return {
          ok: opened,
          error: opened
            ? undefined
            : `${clickTarget.section.sectionLabel} form did not open — click Open: ${addSelector}`,
          result: {
            clicked: opened,
            addEntryWait: {
              formReady: opened,
              section: clickTarget.section.sectionLabel,
              clicked: addSelector,
              openSelector: addSelector
            }
          }
        }
      }

      let toolResult = await executeTool(ctx.tabId, toolName, clickArgs, toolContext)

      if (!toolResult.ok) return toolResult
      if (!clickTarget) return toolResult

      const closed = await waitForAddEntryFormClosed(ctx.tabId, clickTarget.section)
      return {
        ...toolResult,
        result: {
          ...(typeof toolResult.result === "object" && toolResult.result
            ? (toolResult.result as Record<string, unknown>)
            : {}),
          addEntryWait: { formClosed: closed, section: clickTarget.section.sectionLabel }
        }
      }
    }

    if (toolName === "fill" || toolName === "fill_fields") {
      return this.executeFillTool(ctx, toolName, args, toolContext, options)
    }

    return executeTool(ctx.tabId, toolName, args, toolContext)
  }

  private async executeFillTool(
    ctx: AgentContext,
    toolName: string,
    args: Record<string, unknown>,
    toolContext: {
      getPageContext: () => Promise<PageContext>
      captureScreenshot: () => Promise<string>
      resolveStagedFilePath: (fileId: string) => Promise<string | null>
    },
    options: { contentHint?: string; streamFilled?: Map<string, string> } = {}
  ): Promise<ToolResult> {
    const streamFilled = options.streamFilled ?? new Map<string, string>()

    let rawFields: Array<{ selector: string; value: string }> = []
    if (toolName === "fill") {
      const selector = String(args.selector ?? "").trim()
      const value = String(args.value ?? "")
      if (selector && value) rawFields = [{ selector, value }]
    } else {
      rawFields = parseFillFieldsArg(args.fields)
      if (rawFields.length > 1) {
        return {
          ok: false,
          error:
            "Use fill with ONE selector and value per turn — do not batch multiple fields in fill_fields.",
          result: { rejectedBatch: true, fieldCount: rawFields.length }
        }
      }
    }

    if (!rawFields.length) {
      return {
        ok: false,
        error: "fill requires selector and value from the attachment.",
        result: { parseError: true }
      }
    }

    const pageContextBeforeFill = await ctx.getPageContext()
    const sectionLabel =
      this.openAddEntrySectionLabel ??
      findAddEntrySectionForFilledFields(rawFields, pageContextBeforeFill)?.sectionLabel ??
      null

    const resolved = resolveFillFieldMappings(
      rawFields,
      pageContextBeforeFill,
      sectionLabel,
      this.fieldAliasMap ?? undefined
    )
    const field = resolved[0]
    if (!field) {
      return {
        ok: false,
        error: "Could not resolve field selector.",
        result: { parseError: true }
      }
    }

    const sourceSelector = rawFields[0]!.selector
    const persistedFilled = seedFilledSelectorMap(
      this.addEntryPartialFills,
      this.fieldAliasMap ?? undefined
    )
    for (const [key, value] of streamFilled) persistedFilled.set(key, value)

    if (isFieldAlreadyFilled(sourceSelector, field.selector, field.value, persistedFilled)) {
      return this.buildFillProgressResult(ctx, field, sourceSelector, {
        filled: 0,
        skipped: true,
        repeatFill: true
      })
    }

    const results = await fillFieldsSequential(ctx.tabId, [field], (progress) => {
      this.state = {
        status: "running",
        iteration: this.state.iteration,
        currentAction: `Filling field ${progress.index}/${progress.total}`
      }
      this.broadcastState()
    })
    const applied = results[0]
    if (!applied?.ok) {
      return {
        ok: false,
        error: applied?.error ?? "Fill failed",
        result: { filled: 0, results }
      }
    }

    markFieldFilled(streamFilled, rawFields[0]!.selector, field.selector, field.value)
    this.addEntryPartialFills.set(field.selector, field.value)

    const sessionFields = Array.from(this.addEntryPartialFills.entries()).map(
      ([selector, value]) => ({ selector, value })
    )

    let toolResult: ToolResult = {
      ok: true,
      result: {
        filled: 1,
        selector: field.selector,
        value: field.value,
        partialCount: sessionFields.length
      }
    }

    const pageContext = await ctx.getPageContext()
    const section =
      (sectionLabel
        ? pageContext.addEntrySections?.find((item) => item.sectionLabel === sectionLabel)
        : null) ?? findAddEntrySectionForFilledFields(sessionFields, pageContext)

    if (!section) {
      return toolResult
    }

    const sectionFields = getSectionFillableFields(pageContext, section.sectionLabel)
    const missing = getSessionMissingRequiredFields(
      sectionFields,
      this.addEntryPartialFills,
      this.fieldAliasMap ?? undefined
    )

    if (missing.length) {
      const missingMsg = buildMissingRequiredMessage(missing)
      const next = getNextRequiredFillTarget(
        sectionFields,
        this.addEntryPartialFills,
        this.fieldAliasMap ?? undefined
      )
      toolResult = {
        ...toolResult,
        result: {
          ...(typeof toolResult.result === "object" && toolResult.result
            ? (toolResult.result as Record<string, unknown>)
            : {}),
          missingRequired: missingMsg,
          nextField: next?.alias,
          filledAliases: this.buildPartialFilledAliases(pageContext),
          addEntry: {
            submitted: false,
            openedNext: true,
            sectionLabel: section.sectionLabel,
            entryNumber: getSectionSavedCount(section),
            nextStep: next
              ? `Filled ${sessionFields.length} field(s). ${missingMsg}\nNext: call fill with selector "${next.alias}".`
              : `${missingMsg} Call fill for the next required field.`
          }
        }
      }
      return toolResult
    }

    const sectionDescriptor =
      pageContext.addEntrySections?.find((item) => item.sectionLabel === section.sectionLabel) ??
      section
    const duplicate = findDuplicateSavedEntry(
      sessionFields,
      pageContext,
      section.sectionLabel,
      sectionDescriptor.savedEntries ?? []
    )
    if (duplicate) {
      const duplicateMsg = buildDuplicateEntryMessage(section.sectionLabel, duplicate)
      return {
        ...toolResult,
        result: {
          ...(typeof toolResult.result === "object" && toolResult.result
            ? (toolResult.result as Record<string, unknown>)
            : {}),
          duplicateEntry: duplicateMsg,
          addEntry: {
            submitted: false,
            openedNext: true,
            sectionLabel: section.sectionLabel,
            entryNumber: getSectionSavedCount(sectionDescriptor),
            nextStep: duplicateMsg
          }
        }
      }
    }

    const signature = buildFillFieldsSignature(sessionFields)
    const isDuplicate =
      signature.length > 2 &&
      signature === this.lastFillFieldsSignature &&
      this.lastFillFieldsSignature !== null

    if (isDuplicate) {
      return {
        ok: true,
        result: {
          filled: 0,
          skipped: true,
          reason: "Same entry was already saved — open the next item or call done."
        }
      }
    }

    this.lastFillFieldsSignature = signature
    const advance = await this.advanceAddEntryAfterFill(
      ctx,
      sessionFields,
      pageContext,
      toolContext
    )
    this.addEntryPartialFills.clear()

    if (advance) {
      toolResult = {
        ...toolResult,
        ok: toolResult.ok && advance.submitted,
        result: {
          ...(typeof toolResult.result === "object" && toolResult.result
            ? (toolResult.result as Record<string, unknown>)
            : {}),
          addEntry: advance
        }
      }
    }

    return toolResult
  }

  private buildPartialFilledAliases(pageContext: PageContext): string[] {
    if (!this.fieldAliasMap?.size) {
      return Array.from(this.addEntryPartialFills.keys())
    }
    return Array.from(this.addEntryPartialFills.keys()).map(
      (selector) => selectorToFillAlias(selector, this.fieldAliasMap!) ?? selector
    )
  }

  private getNextFillAliasForOpenSection(pageContext: PageContext): string | null {
    if (!this.openAddEntrySectionLabel) return null
    const sectionFields = getSectionFillableFields(
      pageContext,
      this.openAddEntrySectionLabel
    )
    return (
      getNextRequiredFillTarget(
        sectionFields,
        this.addEntryPartialFills,
        this.fieldAliasMap ?? undefined
      )?.alias ?? null
    )
  }

  private async buildFillProgressResult(
    ctx: AgentContext,
    field: { selector: string; value: string },
    sourceSelector: string,
    opts: { filled: number; skipped?: boolean; repeatFill?: boolean }
  ): Promise<ToolResult> {
    const sessionFields = Array.from(this.addEntryPartialFills.entries()).map(
      ([selector, value]) => ({ selector, value })
    )
    const partialCount = sessionFields.length

    let toolResult: ToolResult = {
      ok: true,
      result: {
        filled: opts.filled,
        skipped: opts.skipped,
        selector: field.selector,
        value: field.value,
        partialCount
      }
    }

    const pageContext = await ctx.getPageContext()
    const section =
      (this.openAddEntrySectionLabel
        ? pageContext.addEntrySections?.find(
            (item) => item.sectionLabel === this.openAddEntrySectionLabel
          )
        : null) ?? findAddEntrySectionForFilledFields(sessionFields, pageContext)

    if (!section) return toolResult

    const sectionFields = getSectionFillableFields(pageContext, section.sectionLabel)
    const missing = getSessionMissingRequiredFields(
      sectionFields,
      this.addEntryPartialFills,
      this.fieldAliasMap ?? undefined
    )
    const next = getNextRequiredFillTarget(
      sectionFields,
      this.addEntryPartialFills,
      this.fieldAliasMap ?? undefined
    )

    const filledAlias =
      (this.fieldAliasMap
        ? selectorToFillAlias(field.selector, this.fieldAliasMap)
        : undefined) ?? sourceSelector

    const nextStep = opts.repeatFill
      ? buildRepeatFillMessage(filledAlias, next)
      : buildFillContinuationMessage(
          partialCount,
          missing,
          next,
          this.fieldAliasMap ?? undefined
        )

    return {
      ...toolResult,
      result: {
        ...(typeof toolResult.result === "object" && toolResult.result
          ? (toolResult.result as Record<string, unknown>)
          : {}),
        missingRequired: missing.length ? buildMissingRequiredMessage(missing) : undefined,
        nextField: next?.alias,
        filledAliases: this.buildPartialFilledAliases(pageContext),
        addEntry: {
          submitted: false,
          openedNext: true,
          sectionLabel: section.sectionLabel,
          entryNumber: getSectionSavedCount(section),
          nextStep
        }
      }
    }
  }

  private async closeOtherAddEntrySections(
    ctx: AgentContext,
    targetSection: AddEntrySectionDescriptor,
    sections: AddEntrySectionDescriptor[],
    toolContext: {
      getPageContext: () => Promise<PageContext>
      captureScreenshot: () => Promise<string>
      resolveStagedFilePath: (fileId: string) => Promise<string | null>
    }
  ): Promise<void> {
    for (const section of sections) {
      if (section.sectionLabel === targetSection.sectionLabel) continue
      if (!section.cancelButtonSelector) continue

      const open = await waitForAddEntryFormReady(ctx.tabId, section, 400)
      if (!open) continue

      devLog("Closing other add-entry section before switch", {
        closing: section.sectionLabel,
        opening: targetSection.sectionLabel
      })
      await executeTool(
        ctx.tabId,
        "click",
        { selector: pickCssSelector(section.cancelButtonSelector) },
        toolContext
      )
      await waitForAddEntryFormClosed(ctx.tabId, section, 4000)
      await sleep(300)
    }
  }

  private async advanceAddEntryAfterFill(
    ctx: AgentContext,
    fields: FilledFieldRef[],
    pageContext: PageContext,
    toolContext: {
      getPageContext: () => Promise<PageContext>
      captureScreenshot: () => Promise<string>
      resolveStagedFilePath: (fileId: string) => Promise<string | null>
    }
  ): Promise<{
    submitted: boolean
    openedNext: boolean
    sectionLabel: string
    entryNumber: number
    nextStep: string
    entryAdded?: boolean
    savedCount?: number
    sessionAdded?: number
    lastSavedSummary?: string
    error?: string
  } | null> {
    const section = findAddEntrySectionForFilledFields(fields, pageContext)
    if (!section) return null

    const pageBefore = await ctx.getPageContext()
    const sectionBefore =
      pageBefore.addEntrySections?.find((s) => s.sectionLabel === section.sectionLabel) ?? section
    const beforeEntries = sectionBefore.savedEntries ?? []

    const submitSelector = pickCssSelector(section.submitSelector)
    devLog("Add-entry auto advance", { section: section.sectionLabel, submitSelector })

    const submitOutcome = await submitAddEntryAndWait(ctx.tabId, section)

    if (!submitOutcome.submitted || !submitOutcome.formClosed) {
      return {
        submitted: false,
        openedNext: false,
        sectionLabel: section.sectionLabel,
        entryNumber: getSectionSavedCount(sectionBefore),
        nextStep: submitOutcome.error ?? `Click submit to save: ${submitSelector}`,
        entryAdded: false,
        savedCount: getSectionSavedCount(sectionBefore),
        sessionAdded: this.addEntrySessionCounts.get(section.sectionLabel) ?? 0,
        error: submitOutcome.error
      }
    }

    const pageAfter = await ctx.getPageContext()
    const sectionAfter =
      pageAfter.addEntrySections?.find((s) => s.sectionLabel === section.sectionLabel) ?? section
    const afterEntries = sectionAfter.savedEntries ?? []
    const { entryAdded, newEntries } = diffSavedEntries(beforeEntries, afterEntries)
    const savedCount = getSectionSavedCount(sectionAfter)
    const lastSavedSummary = formatLastSavedSummary(newEntries[newEntries.length - 1])

    if (!entryAdded) {
      this.openAddEntrySectionLabel = null
      const formReady = await openAddEntrySection(ctx.tabId, section)
      if (formReady) {
        this.openAddEntrySectionLabel = section.sectionLabel
      }
      return {
        submitted: true,
        openedNext: formReady,
        sectionLabel: section.sectionLabel,
        entryNumber: savedCount,
        nextStep: formReady
          ? `No new entry appeared in the saved list — fix required fields and call fill for each missing field. Form reopened.`
          : `No new entry appeared — click ${section.addButtonLabel} and retry with corrected values.`,
        entryAdded: false,
        savedCount,
        sessionAdded: this.addEntrySessionCounts.get(section.sectionLabel) ?? 0,
        error: "Submit closed form but no new entry appeared in the saved list."
      }
    }

    const sessionAdded =
      (this.addEntrySessionCounts.get(section.sectionLabel) ?? 0) + newEntries.length
    this.addEntrySessionCounts.set(section.sectionLabel, sessionAdded)
    this.addEntryCounts.set(section.sectionLabel, savedCount)

    this.openAddEntrySectionLabel = null

    const formReady = await openAddEntrySection(ctx.tabId, section)

    if (formReady) {
      this.openAddEntrySectionLabel = section.sectionLabel
    }

    this.lastFillFieldsSignature = null

    const advanceMsg = this.buildAdvanceNextStep(section, savedCount, formReady, lastSavedSummary)

    return {
      submitted: true,
      openedNext: formReady,
      sectionLabel: section.sectionLabel,
      entryNumber: savedCount,
      nextStep: advanceMsg,
      entryAdded: true,
      savedCount,
      sessionAdded,
      lastSavedSummary,
      error: formReady ? undefined : "Add clicked but the form did not open in time."
    }
  }

  private buildAdvanceNextStep(
    section: AddEntrySectionDescriptor,
    savedCount: number,
    formReady: boolean,
    lastSavedSummary?: string
  ): string {
    const summaryNote = lastSavedSummary ? ` Last saved: "${lastSavedSummary}".` : ""
    if (!formReady) {
      return `Click ${section.addButtonLabel} and wait for the form fields to appear before filling.`
    }

    const userMessage = this.addEntryUserMessage
    if (userMessage && this.addEntrySectionsSnapshot.length) {
      const remaining = getSectionEntryRemaining(
        userMessage,
        this.addEntrySectionsSnapshot,
        this.addEntryBaselineCounts
      )
      const sectionRemaining = remaining.find((item) => item.sectionLabel === section.sectionLabel)
      if (
        sectionRemaining &&
        sectionRemaining.expected > 0 &&
        sectionRemaining.remaining <= 0
      ) {
        if (
          isAddEntryTaskComplete(
            userMessage,
            this.addEntrySectionsSnapshot,
            [],
            this.addEntryBaselineCounts
          )
        ) {
          return `${formatCompletionDoneHint(remaining, false)}${summaryNote}`
        }
        return `All ${section.sectionLabel} items from attachment are saved (${sectionRemaining.onPage - sectionRemaining.baseline}/${sectionRemaining.expected}). Open the next section or call done — do NOT add duplicate entries.${summaryNote}`
      }
    }

    return `${buildAddEntryAdvanceMessage(section, savedCount)}${summaryNote}`
  }
}

function extractFilledCountFromToolResult(toolResult: ToolResult): number {
  if (typeof toolResult.result !== "object" || !toolResult.result) return 0
  const filled = (toolResult.result as Record<string, unknown>).filled
  return typeof filled === "number" ? filled : 0
}

function normalizeAgentToolCalls(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>
): Array<{ name: string; args: Record<string, unknown> }> {
  const normalized: Array<{ name: string; args: Record<string, unknown> }> = []
  for (const call of toolCalls) {
    if (call.name === "fill_fields") {
      const fields = parseFillFieldsArg(call.args.fields)
      if (fields.length === 1) {
        normalized.push({
          name: "fill",
          args: { selector: fields[0]!.selector, value: fields[0]!.value }
        })
        continue
      }
    }
    normalized.push(call)
  }
  return normalized
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
  return buildAgentSystemPrompt(pageContext)
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
