import { cdpSession } from "~/background/cdp/session"
import {
  buildFormClosedCheckExpression,
  buildFormReadyCheckExpression
} from "~/lib/add-entry-timing"
import { devLog } from "~/lib/dev-log"
import type { AddEntrySectionDescriptor } from "~/lib/types"

const DEFAULT_TIMEOUT_MS = 8000
const POLL_INTERVAL_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForAddEntryFormReady(
  tabId: number,
  section: AddEntrySectionDescriptor,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  await cdpSession.attach(tabId)
  const expression = buildFormReadyCheckExpression(section)
  devLog("Waiting for add-entry form ready", { section: section.sectionLabel, timeoutMs })
  const ready = await cdpSession.waitUntil(expression, { timeoutMs, intervalMs: POLL_INTERVAL_MS })
  devLog("Add-entry form ready", { section: section.sectionLabel, ready })
  return ready
}

export async function waitForAddEntryFormClosed(
  tabId: number,
  section: AddEntrySectionDescriptor,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  await cdpSession.attach(tabId)
  const expression = buildFormClosedCheckExpression(section)
  devLog("Waiting for add-entry form closed", { section: section.sectionLabel, timeoutMs })
  const closed = await cdpSession.waitUntil(expression, { timeoutMs, intervalMs: POLL_INTERVAL_MS })
  devLog("Add-entry form closed", { section: section.sectionLabel, closed })
  return closed
}
