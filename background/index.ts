import { agentController } from "~/background/agent/orchestrator"
import { cdpSession } from "~/background/cdp/session"
import { registerOllamaHeaderRules } from "~/background/ollama-dnr"
import { checkOllamaHealth, listModels } from "~/lib/ollama/client"
import { MessageType, type RuntimeMessage } from "~/lib/messages"
import { getSettings } from "~/lib/storage"
import { devLogError } from "~/lib/dev-log"
import { sendToPageTab } from "~/lib/tab-messaging"
import type { PageContext, StagedFile } from "~/lib/types"

const STAGED_FILES_KEY = "agentman_staged_files"

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab found")
  return tab.id
}

async function getPageContextFromTab(tabId: number): Promise<PageContext> {
  const response = await sendToPageTab<{ type: string; payload: PageContext }>(tabId, {
    type: MessageType.GET_PAGE_CONTEXT
  })

  if (!response?.payload) {
    devLogError("getPageContextFromTab: no payload", new Error("Missing page context"), {
      tabId,
      response
    })
    throw new Error(
      "Could not read fields on this page. Reload the tab and ensure AgentMan has access to the page."
    )
  }

  return response.payload
}

async function captureTabScreenshot(tabId?: number): Promise<string> {
  const targetTabId = tabId ?? (await getActiveTabId())
  const tab = await chrome.tabs.get(targetTabId)
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  })
  return dataUrl
}

async function getStagedFiles(): Promise<StagedFile[]> {
  const result = await chrome.storage.local.get(STAGED_FILES_KEY)
  return (result[STAGED_FILES_KEY] as StagedFile[] | undefined) ?? []
}

async function resolveStagedFilePath(fileId: string): Promise<string | null> {
  const files = await getStagedFiles()
  const file = files.find((f) => f.id === fileId)
  if (!file) return null
  // Extensions cannot access arbitrary paths from staged base64; return data URL marker
  return file.data
}

async function syncOllamaHeaderRules(host?: string) {
  const ollamaHost = host ?? (await getSettings()).ollamaHost
  await registerOllamaHeaderRules(ollamaHost)
}

void syncOllamaHeaderRules()

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  void syncOllamaHeaderRules()
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-sidepanel") return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId })
  }
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Background error"
    })
  })
  return true
})

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case MessageType.PING:
      return { type: MessageType.PONG }

    case MessageType.OLLAMA_REBUILD_RULES: {
      const host = (message as { payload?: { host?: string } }).payload?.host
      await syncOllamaHeaderRules(host)
      return { ok: true }
    }

    case MessageType.OLLAMA_HEALTH: {
      const settings = await getSettings()
      await syncOllamaHeaderRules(settings.ollamaHost)
      return {
        type: MessageType.OLLAMA_HEALTH,
        payload: await checkOllamaHealth(settings.ollamaHost)
      }
    }

    case MessageType.OLLAMA_MODELS: {
      const settings = await getSettings()
      await syncOllamaHeaderRules(settings.ollamaHost)
      const models = await listModels(settings.ollamaHost)
      return { type: MessageType.OLLAMA_MODELS, payload: { models } }
    }

    case MessageType.AGENT_PAUSE:
      agentController.pause()
      return { ok: true }

    case MessageType.AGENT_RESUME:
      agentController.resume()
      return { ok: true }

    case MessageType.AGENT_STOP:
      agentController.stop()
      await cdpSession.detach()
      return { ok: true }

    case MessageType.CAPTURE_SCREENSHOT: {
      const dataUrl = await captureTabScreenshot()
      const region = (message as { region?: { x: number; y: number; width: number; height: number } }).region
      let finalUrl = dataUrl
      if (region) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.id) {
          const cropped = await chrome.tabs.sendMessage(tab.id, {
            type: "AGENTMAN_CROP_SCREENSHOT",
            payload: { dataUrl, region }
          })
          if (cropped?.dataUrl) finalUrl = cropped.dataUrl
        }
      }
      chrome.runtime.sendMessage({
        type: MessageType.SCREENSHOT_CAPTURED,
        payload: { dataUrl: finalUrl, region }
      })
      return { ok: true }
    }

    case MessageType.CHAT_SEND:
    case MessageType.FILL_EXECUTE: {
      const { sessionId, mode, content, images, stagedFileIds, history } = message.payload
      const tabId = await getActiveTabId()
      const stagedFiles = stagedFileIds?.length
        ? (await getStagedFiles()).filter((f) => stagedFileIds.includes(f.id))
        : []

      void agentController.run(content, images, history, {
        sessionId,
        tabId,
        mode,
        getPageContext: () => getPageContextFromTab(tabId),
        captureScreenshot: () => captureTabScreenshot(tabId),
        resolveStagedFilePath,
        onStream: (delta) => {
          chrome.runtime.sendMessage({
            type: MessageType.CHAT_STREAM,
            payload: { sessionId, delta }
          })
        },
        onDone: (finalContent) => {
          chrome.runtime.sendMessage({
            type: MessageType.CHAT_DONE,
            payload: { sessionId, content: finalContent }
          })
        },
        onError: (error) => {
          chrome.runtime.sendMessage({
            type: MessageType.CHAT_ERROR,
            payload: { sessionId, error }
          })
        }
      }, stagedFiles)

      if (stagedFileIds?.length) {
        const files = await getStagedFiles()
        const remaining = files.filter((f) => !stagedFileIds.includes(f.id))
        await chrome.storage.local.set({ [STAGED_FILES_KEY]: remaining })
      }

      return { ok: true }
    }

    default:
      return { ok: false, error: "Unhandled message" }
  }
}

export {}
