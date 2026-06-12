import { cdpSession } from "~/background/cdp/session"
import { waitForAddEntryFormClosed } from "~/background/add-entry-wait"
import { pickCssSelector } from "~/lib/add-entry-workflow"
import { devLog } from "~/lib/dev-log"
import type { AddEntrySectionDescriptor } from "~/lib/types"

export interface SubmitAddEntryResult {
  ok: boolean
  validationErrors: string[]
  error?: string
}

const INVALID_FIELD_HELPER = `function collectInvalidFields(form) {
  const errors = [];
  for (const el of form.querySelectorAll("input, select, textarea")) {
    if (!el.willValidate || el.checkValidity()) continue;
    const label =
      el.labels?.[0]?.textContent?.replace(/\\s+/g, " ").trim() || el.name || el.id || "field";
    errors.push(label + ": " + (el.validationMessage || "invalid value"));
  }
  return errors;
}`

function buildSubmitExpression(formSelector: string, submitSelector: string): string {
  return `(() => {
    ${INVALID_FIELD_HELPER}
    const form = document.querySelector(${JSON.stringify(formSelector)});
    const submit = document.querySelector(${JSON.stringify(submitSelector)});
    if (!form) return { ok: false, validationErrors: [], error: "form not found" };
    if (!submit) return { ok: false, validationErrors: [], error: "submit button not found" };
    submit.scrollIntoView({ block: "center", inline: "center" });
    const validationErrors = collectInvalidFields(form);
    if (validationErrors.length) {
      return { ok: false, validationErrors, error: "validation failed" };
    }
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit(submit);
    } else {
      submit.click();
    }
    return { ok: true, validationErrors: [] };
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
    return { ok: false, validationErrors: [], error: "submit evaluation failed" }
  }
  return result
}

export function formatSubmitFailureMessage(result: SubmitAddEntryResult): string {
  if (result.validationErrors.length) {
    return `Submit blocked by required fields — fix with fill_fields: ${result.validationErrors.join("; ")}`
  }
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
  validationErrors: string[]
  error?: string
}> {
  let result = await submitAddEntryForm(tabId, section)
  if (!result.ok) {
    return {
      submitted: false,
      formClosed: false,
      validationErrors: result.validationErrors,
      error: formatSubmitFailureMessage(result)
    }
  }

  let formClosed = await waitForAddEntryFormClosed(tabId, section, closeTimeoutMs)
  if (!formClosed) {
    devLog("Add-entry submit retry", { section: section.sectionLabel })
    try {
      await cdpSession.clickSelectorDom(pickCssSelector(section.submitSelector))
    } catch (error) {
      devLog("Add-entry submit retry click failed", {
        section: section.sectionLabel,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    formClosed = await waitForAddEntryFormClosed(tabId, section, 4000)
  }

  if (!formClosed) {
    const recheck = await submitAddEntryForm(tabId, section)
    if (!recheck.ok && recheck.validationErrors.length) {
      return {
        submitted: false,
        formClosed: false,
        validationErrors: recheck.validationErrors,
        error: formatSubmitFailureMessage(recheck)
      }
    }
    return {
      submitted: true,
      formClosed: false,
      validationErrors: [],
      error: "Submit clicked but the form did not close — check required select values (not Choose/-1)."
    }
  }

  return { submitted: true, formClosed: true, validationErrors: [] }
}
