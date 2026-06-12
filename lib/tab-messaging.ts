import { devLogError } from "~/lib/dev-log"
import type { RuntimeMessage } from "~/lib/messages"

/** Prefer the main frame so all_frames content scripts do not race on sendResponse. */
export async function sendToPageTab<T = unknown>(
  tabId: number,
  message: RuntimeMessage
): Promise<T | undefined> {
  const type = message.type

  try {
    const response = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 })
    if (response !== undefined) return response as T
  } catch (error) {
    devLogError(`sendToPageTab frame 0 failed (${type})`, error, { tabId })
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, message)
    if (response !== undefined) return response as T
  } catch (error) {
    devLogError(`sendToPageTab fallback failed (${type})`, error, { tabId })
  }

  devLogError(`sendToPageTab no response (${type})`, new Error("Content script did not respond"), {
    tabId
  })
  return undefined
}
