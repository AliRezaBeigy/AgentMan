import type { PlasmoCSConfig } from "plasmo"

import {
  applyFieldMappings,
  clearHighlights,
  detectAddEntrySections,
  detectFormFields,
  detectRepeatableSections,
  ensureRepeatableRows,
  getTextSummary,
  highlightFields
} from "~/contents/lib/form-engine"
import {
  cropDataUrl,
  hideAgentUi,
  moveCursor,
  setCaption,
  startScreenshotSelection
} from "~/contents/lib/overlay"
import {
  restorePageValidation,
  suppressPageValidation
} from "~/contents/lib/validation-suppress"
import { MessageType, type RuntimeMessage } from "~/lib/messages"
import type { PageContext } from "~/lib/types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true,
  run_at: "document_idle"
}

function buildPageContext(): PageContext {
  const fields = detectFormFields()
  const addEntrySections = detectAddEntrySections()
  const ctx: PageContext = {
    url: location.href,
    title: document.title,
    textSummary: getTextSummary(),
    fields,
    repeatableSections: detectRepeatableSections(),
    addEntrySections,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    }
  }

  return ctx
}

function countInteractiveFields(root: Document | Element = document): number {
  return root.querySelectorAll(
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="image"]), textarea, select, [role="combobox"]'
  ).length
}

function shouldHandleFormMessages(): boolean {
  const count = countInteractiveFields()
  if (count === 0) return false
  if (window.top === window) return true

  try {
    const topCount = window.top?.document ? countInteractiveFields(window.top.document) : 0
    return count > topCount
  } catch {
    return true
  }
}

const FORM_MESSAGE_TYPES = new Set<string>([
  MessageType.GET_PAGE_CONTEXT,
  MessageType.FILL_HIGHLIGHT,
  MessageType.FILL_APPLY,
  MessageType.ENSURE_REPEATABLE_ROWS
])

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (FORM_MESSAGE_TYPES.has(message.type) && !shouldHandleFormMessages()) {
    return false
  }

  switch (message.type) {
    case MessageType.PING:
      sendResponse({ type: MessageType.PONG })
      return true

    case MessageType.GET_PAGE_CONTEXT:
      sendResponse({ type: MessageType.PAGE_CONTEXT, payload: buildPageContext() })
      return true

    case MessageType.FILL_HIGHLIGHT: {
      highlightFields(message.payload.mappings.map((m) => m.selector))
      sendResponse({ ok: true })
      return true
    }

    case MessageType.FILL_APPLY: {
      void applyFieldMappings(message.payload.mappings).then((results) => {
        setTimeout(clearHighlights, 1200)
        sendResponse({ ok: true, results })
      })
      return true
    }

    case MessageType.ENSURE_REPEATABLE_ROWS: {
      void ensureRepeatableRows(message.payload.minRows, message.payload.rowKeys ?? []).then(
        (result) => {
          sendResponse({ ok: true, ...result })
        }
      )
      return true
    }

    case MessageType.CURSOR_MOVE:
      moveCursor(message.payload.x, message.payload.y)
      sendResponse({ ok: true })
      return true

    case MessageType.CURSOR_CAPTION:
      setCaption(message.payload.text)
      sendResponse({ ok: true })
      return true

    case MessageType.HIDE_UI_FOR_SCREENSHOT:
      hideAgentUi()
      sendResponse({ ok: true })
      return true

    case MessageType.SUPPRESS_PAGE_VALIDATION:
      suppressPageValidation()
      sendResponse({ ok: true })
      return true

    case MessageType.RESTORE_PAGE_VALIDATION:
      restorePageValidation()
      sendResponse({ ok: true })
      return true

    case "AGENTMAN_CROP_SCREENSHOT": {
      const payload = (message as { payload: { dataUrl: string; region: { x: number; y: number; width: number; height: number } } }).payload
      void cropDataUrl(payload.dataUrl, payload.region).then((dataUrl) => {
        sendResponse({ dataUrl })
      })
      return true
    }

    case MessageType.START_SCREENSHOT_SELECTION:
      startScreenshotSelection(
        async (region) => {
          chrome.runtime.sendMessage({
            type: MessageType.CAPTURE_SCREENSHOT,
            region
          })
        },
        () => {
          chrome.runtime.sendMessage({ type: MessageType.CANCEL_SCREENSHOT_SELECTION })
        }
      )
      sendResponse({ ok: true })
      return true

    default:
      return false
  }
})

