import { formatSavedEntriesBlock } from "~/lib/add-entry-saved-rows"
import { cdpSession } from "~/background/cdp/session"
import { MessageType } from "~/lib/messages"
import { parseFillFieldsArg } from "~/lib/tool-args"
import type { PageContext } from "~/lib/types"

export interface ToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

async function notifyCursor(tabId: number, x: number, y: number, caption: string) {
  await chrome.tabs.sendMessage(tabId, {
    type: MessageType.CURSOR_MOVE,
    payload: { x, y }
  })
  await chrome.tabs.sendMessage(tabId, {
    type: MessageType.CURSOR_CAPTION,
    payload: { text: caption }
  })
}

export async function executeTool(
  tabId: number,
  name: string,
  args: Record<string, unknown>,
  context: {
    getPageContext: () => Promise<PageContext>
    captureScreenshot: () => Promise<string>
    resolveStagedFilePath: (fileId: string) => Promise<string | null>
  }
): Promise<ToolResult> {
  await cdpSession.attach(tabId)

  try {
    switch (name) {
      case "click": {
        const caption = args.selector
          ? `Clicking ${args.selector}`
          : `Clicking (${args.x}, ${args.y})`
        if (typeof args.x === "number" && typeof args.y === "number") {
          await notifyCursor(tabId, args.x, args.y, caption)
          await cdpSession.clickAt(args.x, args.y)
        } else if (typeof args.selector === "string") {
          await chrome.tabs.sendMessage(tabId, {
            type: MessageType.CURSOR_CAPTION,
            payload: { text: caption }
          })
          await cdpSession.clickSelector(args.selector)
        } else {
          return { ok: false, error: "click requires selector or x/y coordinates" }
        }
        return { ok: true, result: { clicked: true } }
      }

      case "type": {
        const text = String(args.text ?? "")
        await chrome.tabs.sendMessage(tabId, {
          type: MessageType.CURSOR_CAPTION,
          payload: { text: `Typing: ${text.slice(0, 40)}` }
        })
        await cdpSession.typeText(text, typeof args.selector === "string" ? args.selector : undefined)
        return { ok: true, result: { typed: text.length } }
      }

      case "fill": {
        const selector = String(args.selector ?? "")
        const value = String(args.value ?? "")
        await chrome.tabs.sendMessage(tabId, {
          type: MessageType.CURSOR_CAPTION,
          payload: { text: `Filling ${selector}` }
        })
        await cdpSession.fillSelector(selector, value)
        return { ok: true, result: { selector, value } }
      }

      case "fill_fields": {
        const fields = parseFillFieldsArg(args.fields)
        if (!fields.length) {
          return {
            ok: false,
            error:
              'fill_fields could not parse any {selector, value} pairs. Pass fields as an array or valid JSON string.',
            result: { filled: 0, results: [], parseError: true }
          }
        }
        const results: Array<{ selector: string; ok: boolean; error?: string }> = []
        await chrome.tabs.sendMessage(tabId, {
          type: MessageType.CURSOR_CAPTION,
          payload: { text: `Filling ${fields.length} field(s)` }
        })
        const batchItems = fields
          .filter((item) => item.selector)
          .map((item) => ({ selector: item.selector, value: item.value }))
        results.push(...(await cdpSession.fillSelectorsBatch(batchItems)))
        const failed = results.filter((r) => !r.ok)
        return {
          ok: failed.length === 0,
          result: { filled: results.filter((r) => r.ok).length, results },
          error: failed.length ? `${failed.length} field(s) failed` : undefined
        }
      }

      case "navigate": {
        const url = String(args.url ?? "")
        await cdpSession.navigate(url)
        return { ok: true, result: { url } }
      }

      case "navigate_back": {
        await cdpSession.navigateBack()
        return { ok: true, result: { navigatedBack: true } }
      }

      case "browser_tabs": {
        const action = String(args.action ?? "list")
        if (action === "list") {
          const tabs = await chrome.tabs.query({})
          return {
            ok: true,
            result: tabs.map((t) => ({ id: t.id, title: t.title, url: t.url }))
          }
        }
        if (action === "switch" && typeof args.tabId === "number") {
          await chrome.tabs.update(args.tabId, { active: true })
          await cdpSession.attach(args.tabId)
          return { ok: true, result: { tabId: args.tabId } }
        }
        if (action === "create") {
          const tab = await chrome.tabs.create({
            url: typeof args.url === "string" ? args.url : undefined
          })
          return { ok: true, result: { tabId: tab.id } }
        }
        return { ok: false, error: "Invalid browser_tabs action" }
      }

      case "upload_file": {
        const selector = String(args.selector ?? "")
        let files: string[] = []
        if (typeof args.fileId === "string") {
          const path = await context.resolveStagedFilePath(args.fileId)
          if (!path) return { ok: false, error: "Staged file not found" }
          files = [path]
        } else if (typeof args.path === "string") {
          files = [args.path]
        } else {
          return { ok: false, error: "upload_file requires fileId or path" }
        }
        await cdpSession.uploadFile(selector, files)
        return { ok: true, result: { selector, files } }
      }

      case "take_screenshot": {
        const dataUrl = await context.captureScreenshot()
        return { ok: true, result: { screenshot: dataUrl } }
      }

      case "get_page_content": {
        const pageContext = await context.getPageContext()
        const sections = pageContext.addEntrySections ?? []
        const summary = pageContext.textSummary ?? ""
        const maxSummary = 3500
        const savedEntriesBlock = sections.length
          ? formatSavedEntriesBlock(sections)
          : undefined
        return {
          ok: true,
          result: {
            url: pageContext.url,
            title: pageContext.title,
            addEntrySections: sections.map((section) => ({
              sectionLabel: section.sectionLabel,
              entryCount: section.entryCount,
              savedEntries: section.savedEntries
            })),
            savedEntriesBlock,
            textSummary:
              summary.length > maxSummary ? `${summary.slice(0, maxSummary)}…` : summary
          }
        }
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (error) {
    const toolError = error instanceof Error ? error.message : "Tool execution failed"
    return {
      ok: false,
      error: toolError
    }
  }
}
