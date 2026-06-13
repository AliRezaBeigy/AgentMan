import { cdpSession } from "~/background/cdp/session"
import { waitForAddEntryFormClosed, waitForAddEntryFormReady } from "~/background/add-entry-wait"
import { pickCssSelector } from "~/lib/add-entry-workflow"
import { devLog } from "~/lib/dev-log"
import type { AddEntrySectionDescriptor } from "~/lib/types"

const COLLAPSE_SETTLE_MS = 400
const OPEN_RETRY_DELAY_MS = 350

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function extractShowAddnewSkillType(section: AddEntrySectionDescriptor): string | null {
  const match = section.addButtonSelector.match(/showAddnewSkill\s*\(\s*['"](\w+)['"]/i)
  return match?.[1] ?? null
}

export function buildShowAddnewSkillOpenExpression(skillType: string, addButtonSelector: string): string {
  const buttonSelector = pickCssSelector(addButtonSelector)
  return `(() => {
    if (typeof showAddnewSkill === "function") {
      showAddnewSkill(${JSON.stringify(skillType)});
      return true;
    }
    const btn = document.querySelector(${JSON.stringify(buttonSelector)});
    if (btn && typeof btn.click === "function") {
      btn.click();
      return true;
    }
    return false;
  })()`
}

/** Open an add-entry sub-form; skips click when already visible. */
export async function openAddEntrySection(
  tabId: number,
  section: AddEntrySectionDescriptor,
  options: { timeoutMs?: number; waitForCloseMs?: number } = {}
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 10000
  const waitForCloseMs = options.waitForCloseMs ?? 4000

  await cdpSession.attach(tabId)

  if (await waitForAddEntryFormReady(tabId, section, 500)) {
    devLog("Add-entry form already open", { section: section.sectionLabel })
    return true
  }

  await waitForAddEntryFormClosed(tabId, section, waitForCloseMs)
  await sleep(COLLAPSE_SETTLE_MS)

  const skillType = extractShowAddnewSkillType(section)
  const addSelector = pickCssSelector(section.addButtonSelector)

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await sleep(OPEN_RETRY_DELAY_MS)
    }

    let invoked = false
    if (skillType) {
      invoked =
        (await cdpSession.evaluateJson<boolean>(
          buildShowAddnewSkillOpenExpression(skillType, section.addButtonSelector)
        )) === true
    }
    if (!invoked) {
      try {
        await cdpSession.clickSelectorDom(addSelector)
        invoked = true
      } catch (error) {
        devLog("Add-entry open click failed", {
          section: section.sectionLabel,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    if (!invoked) continue

    const ready = await waitForAddEntryFormReady(tabId, section, timeoutMs)
    if (ready) {
      devLog("Add-entry form opened", { section: section.sectionLabel, attempt: attempt + 1 })
      return true
    }
  }

  devLog("Add-entry form failed to open", { section: section.sectionLabel })
  return false
}
