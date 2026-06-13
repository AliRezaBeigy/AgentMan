import { cdpSession } from "~/background/cdp/session"
import { waitForAddEntryFormClosed } from "~/background/add-entry-wait"
import { pickCssSelector } from "~/lib/add-entry-workflow"
import { devLog } from "~/lib/dev-log"
import type { AddEntrySectionDescriptor } from "~/lib/types"

export interface SubmitAddEntryResult {
  ok: boolean
  error?: string
}
function buildSubmitExpression(formSelector: string, submitSelector: string): string {
  return `(() => {
    const form = document.querySelector(${JSON.stringify(formSelector)});
    const submit = document.querySelector(${JSON.stringify(submitSelector)});
    if (!form) return { ok: false, error: "form not found" };
    if (!submit) return { ok: false, error: "submit button not found" };
    submit.scrollIntoView({ block: "center", inline: "center" });
    try {
      submit.click();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  })()`
}

export async function submitAddEntryForm(
  tabId: number,
  section: AddEntrySectionDescriptor
): Promise<SubmitAddEntryResult> {
  await cdpSession.attach(tabId)
  const submitSelector = pickCssSelector(section.submitSelector)
  const expression = buildSubmitExpression(section.formSelector, submitSelector)
  const result = await cdpSession.evaluateJson<SubmitAddEntryResult>(expression)
  devLog("Add-entry submit attempt", { section: section.sectionLabel, result })
  if (!result) {
    return { ok: false, error: "submit evaluation failed" }
  }
  return result
}

export function formatSubmitFailureMessage(result: SubmitAddEntryResult): string {
  return result.error ?? "Submit failed"
}

/** Submit via DOM and wait for the panel to close; retries once if needed. */
export async function submitAddEntryAndWait(
  tabId: number,
  section: AddEntrySectionDescriptor,
  closeTimeoutMs = 8000
): Promise<{
  submitted: boolean
  formClosed: boolean
  error?: string
}> {
  let result = await submitAddEntryForm(tabId, section)
  if (!result.ok) {
    return {
      submitted: false,
      formClosed: false,
      error: formatSubmitFailureMessage(result)
    }
  }

  let formClosed = await waitForAddEntryFormClosed(tabId, section, closeTimeoutMs)
  if (!formClosed) {
    devLog("Add-entry submit retry", { section: section.sectionLabel })
    try {
      await cdpSession.evaluateJson(
        buildSubmitExpression(section.formSelector, pickCssSelector(section.submitSelector))
      )
    } catch (error) {
      devLog("Add-entry submit retry click failed", {
        section: section.sectionLabel,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    formClosed = await waitForAddEntryFormClosed(tabId, section, 4000)
  }

  if (!formClosed) {
    return {
      submitted: true,
      formClosed: false,
      error: "Submit clicked but the form did not close — check required select values (not Choose/-1)."
    }
  }

  return { submitted: true, formClosed: true }
}
