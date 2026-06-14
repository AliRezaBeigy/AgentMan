import { cleanFieldLabel } from "~/lib/field-labels"
import { findSectionLabel } from "~/lib/field-sections"
import { detectFieldRequired } from "~/lib/required-field-detect"
import type {
  AddEntrySavedEntry,
  AddEntrySectionDescriptor,
  FormFieldDescriptor,
  RepeatableSectionDescriptor
} from "~/lib/types"

export function detectFormFields(root: Document | Element = document): FormFieldDescriptor[] {
  const fields: FormFieldDescriptor[] = []
  const seenSelectors = new Set<string>()

  const elements = root.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select, [contenteditable='true']")

  elements.forEach((el, index) => {
    if (el instanceof HTMLInputElement && ["hidden", "submit", "button", "image"].includes(el.type)) {
      return
    }

    if (el instanceof HTMLInputElement && el.type === "file" && el.classList.contains("hidden")) {
      return
    }

    const container = findFieldContainer(el)
    const rawLabel = findLabel(el, container)
    const label = rawLabel ? buildContextualFieldKey(el, rawLabel) : undefined
    const selector = buildSelector(el, index, label)

    if (seenSelectors.has(selector)) return
    seenSelectors.add(selector)

    if (el instanceof HTMLSelectElement) {
      const combobox = container?.querySelector("[role='combobox']")
      const triggerId = combobox?.id || el.id || undefined
      const options = getSelectOptions(el)

      fields.push({
        selector,
        tag: "select",
        type: "select",
        name: el.name || undefined,
        id: triggerId || el.id || undefined,
        label,
        value: el.value,
        options,
        required: detectFieldRequired(el, label),
        widget: combobox ? "combobox" : undefined,
        triggerSelector: triggerId ? `#${CSS.escape(triggerId)}` : undefined
      })
      return
    }

    if (el instanceof HTMLTextAreaElement) {
      fields.push({
        selector,
        tag: "textarea",
        type: "textarea",
        name: el.name || undefined,
        id: el.id || undefined,
        label,
        placeholder: el.placeholder || undefined,
        value: el.value,
        required: detectFieldRequired(el, label)
      })
      return
    }

    if (el instanceof HTMLInputElement) {
      fields.push({
        selector,
        tag: "input",
        type: el.type || "text",
        name: el.name || undefined,
        id: el.id || undefined,
        label,
        placeholder: el.placeholder || undefined,
        value: el.type === "checkbox" ? String(el.checked) : el.value,
        required: detectFieldRequired(el, label),
        isFileInput: el.type === "file",
        accept: el.accept || undefined
      })
      return
    }

    fields.push({
      selector,
      tag: "contenteditable",
      type: "contenteditable",
      label,
      value: el.textContent ?? ""
    })
  })

  fields.push(...detectStandaloneComboboxes(root, seenSelectors, fields))
  fields.push(...detectButtonGroups(root, seenSelectors))
  fields.push(...detectPdfJsFields(root))
  return dedupeFieldsBySelector(fields)
}

function dedupeFieldsBySelector(fields: FormFieldDescriptor[]): FormFieldDescriptor[] {
  const seen = new Set<string>()
  return fields.filter((field) => {
    if (seen.has(field.selector)) return false
    seen.add(field.selector)
    return true
  })
}

function buildContextualFieldKey(el: Element, rawLabel: string): string {
  const label = cleanFieldLabel(rawLabel)
  const section = findSectionLabel(el)
  if (section) return `${section} - ${label}`

  const name = el.getAttribute("name")
  if (name?.startsWith("question[")) return name

  if (el.id === "year" || el.id === "month" || el.id === "day") {
    if (el.closest("#section-birthdate, [class*='birthdate']")) {
      return `Date of birth - ${el.id}`
    }
  }

  return label
}

function fieldFillKey(field: FormFieldDescriptor): string {
  return field.label?.trim() || field.name?.trim() || field.placeholder?.trim() || field.selector
}

function detectStandaloneComboboxes(
  root: Document | Element,
  seenSelectors: Set<string>,
  existing: FormFieldDescriptor[]
): FormFieldDescriptor[] {
  const linkedTriggers = new Set(
    existing.map((f) => f.triggerSelector).filter((s): s is string => !!s)
  )

  const fields: FormFieldDescriptor[] = []

  root.querySelectorAll<HTMLElement>("[role='combobox']").forEach((combobox, index) => {
    const container = findFieldContainer(combobox)
    const label = findLabel(combobox, container) ?? `Select ${index + 1}`
    const selector = buildSelector(combobox, index + 5000, label)

    if (seenSelectors.has(selector) || linkedTriggers.has(selector)) return

    const options = getComboboxOptions(combobox, container)

    seenSelectors.add(selector)
    if (!combobox.id) {
      combobox.setAttribute("data-agentman-combobox", String(index))
    }

    fields.push({
      selector,
      tag: "combobox",
      type: "select",
      id: combobox.id || undefined,
      label,
      value: combobox.querySelector("[data-slot='select-value']")?.textContent?.trim(),
      options,
      widget: "combobox",
      triggerSelector: selector
    })
  })

  return fields
}

function getComboboxOptions(
  combobox: Element,
  container: HTMLElement | null
): Array<{ value: string; label: string }> {
  const select = container?.querySelector("select")
  if (select) return getSelectOptions(select)

  const controlsId = combobox.getAttribute("aria-controls")
  if (controlsId) {
    const listbox = document.getElementById(controlsId)
    if (listbox) {
      return Array.from(listbox.querySelectorAll("[role='option']"))
        .map((opt) => {
          const text = opt.textContent?.trim() || ""
          return { value: text, label: text }
        })
        .filter((o) => o.value && o.value !== "Category" && o.value !== "Select")
    }
  }

  const known = new Set<string>()
  document.querySelectorAll("[data-slot='select-value']").forEach((span) => {
    const text = span.textContent?.trim()
    if (text && text !== "Category" && text !== "Select") known.add(text)
  })

  return Array.from(known).map((value) => ({ value, label: value }))
}

function detectButtonGroups(
  root: Document | Element,
  seenSelectors: Set<string>
): FormFieldDescriptor[] {
  const fields: FormFieldDescriptor[] = []
  const containers = root.querySelectorAll<HTMLElement>(
    ".space-y-1\\.5, [class*='space-y-1']"
  )

  containers.forEach((container) => {
    if (container.querySelector("[role='combobox'], select, input, textarea")) return

    const labelEl = container.querySelector("label")
    const buttons = Array.from(container.querySelectorAll("button[type='button']")).filter(
      (btn) => !btn.closest("[role='combobox']") && btn.textContent?.trim()
    )

    if (!labelEl || buttons.length < 2) return

    const label = labelEl.textContent!.trim()
    container.dataset.agentmanWidget = "button-group"
    container.dataset.agentmanLabel = label
    const selector = `[data-agentman-widget="button-group"][data-agentman-label="${escapeAttrValue(label)}"]`

    if (seenSelectors.has(selector)) return
    seenSelectors.add(selector)

    const options = buttons.map((btn) => {
      const text = btn.textContent!.trim()
      return { value: text, label: text }
    })

    fields.push({
      selector,
      tag: "button-group",
      type: "button-group",
      label,
      options,
      widget: "button-group"
    })
  })

  return fields
}

function detectPdfJsFields(root: Document | Element): FormFieldDescriptor[] {
  const pdfInputs = root.querySelectorAll<HTMLInputElement>(
    ".annotationLayer input, .annotationLayer textarea, .annotationLayer select"
  )

  return Array.from(pdfInputs).map((el, index) => ({
    selector: buildSelector(el, index + 1000),
    tag: el.tagName.toLowerCase(),
    type: el instanceof HTMLInputElement ? el.type : "text",
    name: el.name || undefined,
    id: el.id || undefined,
    label: el.getAttribute("aria-label") || el.name || undefined,
    value:
      el instanceof HTMLInputElement && el.type === "checkbox"
        ? String(el.checked)
        : (el as HTMLInputElement).value,
    isPdfField: true
  }))
}

function findFieldContainer(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>(".space-y-1\\.5, .space-y-1_5, [class*='space-y-']")
}

function getSelectOptions(select: HTMLSelectElement): Array<{ value: string; label: string }> {
  return Array.from(select.options)
    .filter((opt) => opt.value.trim() !== "")
    .map((opt) => ({
      value: opt.value,
      label: opt.text.trim() || opt.value
    }))
}

function buildSelector(el: Element, index: number, label?: string): string {
  if (label && (label.includes(" - ") || /^Row \d+ -/.test(label))) {
    el.setAttribute("data-agentman-field-key", label)
    return `[data-agentman-field-key="${escapeAttrValue(label)}"]`
  }
  if (el.id) return `#${CSS.escape(el.id)}`
  const name = el.getAttribute("name")
  if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`
  el.setAttribute("data-agentman-field", String(index))
  return `[data-agentman-field="${index}"]`
}

function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function findRepeatingGridLabel(el: Element): string | undefined {
  const row = el.closest<HTMLElement>("div[class*='grid-cols']")
  if (!row || !row.querySelector('input[type="date"]')) return undefined

  const parent = row.parentElement
  if (!parent) return undefined

  const rows = Array.from(parent.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.className.includes("grid-cols") &&
      !!child.querySelector('input[type="date"]')
  )

  const rowIndex = rows.indexOf(row) + 1
  if (rowIndex < 1) return undefined

  const headers = getGridColumnHeaders(parent)
  const colName = inferColumnName(el, headers, row)
  return `Row ${rowIndex} - ${colName}`
}

function getGridColumnHeaders(parent: HTMLElement): string[] {
  const header = Array.from(parent.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.className.includes("grid-cols") &&
      !child.querySelector("input, textarea, select, [role='combobox']")
  )
  if (!header) return []

  return Array.from(header.querySelectorAll("span"))
    .map((span) => span.textContent?.trim())
    .filter((text): text is string => !!text)
}

function inferColumnName(el: Element, headers: string[], row: HTMLElement): string {
  const cells = Array.from(row.children)
  let cellIndex = -1

  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === el || cells[i].contains(el)) {
      cellIndex = i
      break
    }
  }

  if (cellIndex >= 0 && headers[cellIndex]) return headers[cellIndex]

  if (el instanceof HTMLInputElement) {
    if (el.type === "date") return "Date"
    if (el.type === "number") return "Amount"
    return "Description"
  }

  if (el.getAttribute("role") === "combobox" || el.closest("[role='combobox']")) {
    return "Category"
  }

  return "Field"
}

function findLabel(el: Element, container?: HTMLElement | null): string | undefined {
  const gridLabel = findRepeatingGridLabel(el)
  if (gridLabel) return gridLabel

  const id = el.getAttribute("id")
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent?.trim()) return cleanFieldLabel(label.textContent)
  }

  const root = container ?? findFieldContainer(el)
  if (root) {
    const combobox = root.querySelector("[role='combobox']")
    if (combobox?.id) {
      const label = document.querySelector(`label[for="${CSS.escape(combobox.id)}"]`)
      if (label?.textContent?.trim()) return cleanFieldLabel(label.textContent)
    }

    const containerLabel = root.querySelector("label[data-slot='label'], label")
    if (containerLabel?.textContent?.trim()) {
      return cleanFieldLabel(containerLabel.textContent)
    }
  }

  const parentLabel = el.closest("label")
  if (parentLabel?.textContent?.trim()) {
    return cleanFieldLabel(parentLabel.textContent)
  }

  const aria = el.getAttribute("aria-label")
  if (aria) return cleanFieldLabel(aria)

  const placeholder = el.getAttribute("placeholder")
  if (placeholder) return cleanFieldLabel(placeholder)

  return undefined
}

export function detectAddEntrySections(
  root: Document | Element = document
): AddEntrySectionDescriptor[] {
  const sections: AddEntrySectionDescriptor[] = []
  const seen = new Set<string>()

  root.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    const addLabel = btn.textContent?.replace(/\s+/g, " ").trim() ?? ""
    if (!/\badd\b/i.test(addLabel)) return
    if (btn.type === "submit") return

    const form = findFormForAddButton(btn)
    if (!form) return

    const submit = form.querySelector<HTMLButtonElement | HTMLInputElement>(
      'button[type="submit"], input[type="submit"]'
    )
    if (!submit) return

    const sectionLabel = findSectionLabel(form) ?? inferLabelFromAddButton(addLabel)
    const formSelector = buildFormSelector(form)
    const key = `${sectionLabel}|${formSelector}`
    if (seen.has(key)) return
    seen.add(key)

    const fields = detectFormFields(form)
    const fieldLabels = fields.map((f) => f.label).filter((l): l is string => !!l?.trim())
    const cancelBtn = findCancelButton(form)

    const sectionRoot = findAddEntrySectionRoot(btn, form)
    const saved = detectSavedAddEntryEntries(sectionRoot, form)

    sections.push({
      sectionLabel,
      addButtonSelector: buildButtonSelector(btn),
      addButtonLabel: addLabel,
      formSelector,
      submitSelector: `${formSelector} button[type="submit"], ${formSelector} input[type="submit"]`,
      cancelButtonSelector: cancelBtn ? buildButtonSelector(cancelBtn) : undefined,
      fieldLabels,
      entryCount: saved.entries.length,
      savedEntries: saved.entries,
      entriesListSelector: saved.listSelector
    })
  })

  return sections
}

function findCancelButton(form: HTMLFormElement): HTMLButtonElement | null {
  for (const btn of form.querySelectorAll<HTMLButtonElement>('button[type="button"]')) {
    if (/\bcancel\b/i.test(btn.textContent ?? "")) return btn
  }
  return null
}

function inferLabelFromAddButton(addLabel: string): string {
  return addLabel.replace(/^add\s+/i, "").trim() || addLabel
}

function findFormForAddButton(btn: HTMLButtonElement): HTMLFormElement | null {
  const section = btn.closest("section, [id^='section-']")
  if (section) {
    const inSection = section.querySelector("form")
    if (inSection instanceof HTMLFormElement) return inSection
  }

  let sibling: Element | null = btn.parentElement?.nextElementSibling ?? null
  while (sibling) {
    if (sibling instanceof HTMLFormElement) return sibling
    const nested = sibling.querySelector("form")
    if (nested instanceof HTMLFormElement) return nested
    sibling = sibling.nextElementSibling
  }

  const parent = btn.closest("section, div, main, article")
  const nested = parent?.querySelector("form")
  return nested instanceof HTMLFormElement ? nested : null
}

function buildFormSelector(form: HTMLFormElement): string {
  if (form.id) return `#${CSS.escape(form.id)}`
  const dataType = form.getAttribute("data-type")
  if (dataType) return `form[data-type="${CSS.escape(dataType)}"]`
  const name = form.getAttribute("name")
  if (name) return `form[name="${CSS.escape(name)}"]`
  return "form"
}

function buildButtonSelector(btn: HTMLButtonElement): string {
  if (btn.id) return `#${CSS.escape(btn.id)}`

  const form = btn.closest("form")
  const formPrefix = form ? `${buildFormSelector(form)} ` : ""

  if (btn.classList.contains("btn-cancel")) {
    const skillType = btn.getAttribute("data-skilltype")
    if (skillType) {
      return `${formPrefix}button.btn-cancel[data-skilltype="${CSS.escape(skillType)}"]`
    }
    return `${formPrefix}button.btn-cancel`
  }

  const onclick = btn.getAttribute("onclick")
  if (onclick) {
    const snippet = onclick.slice(0, 40).replace(/"/g, '\\"')
    return `button[onclick*="${snippet}"]`
  }

  return `${formPrefix}button`.trim()
}

function findAddEntrySectionRoot(btn: Element, form: HTMLFormElement): Element {
  return btn.closest("section, [id^='section-']") ?? form.parentElement ?? form
}

const SAVED_ENTRY_ROW_SELECTORS = [
  ".divtable-row",
  "tr[data-row]",
  "tbody tr",
  "li"
] as const

function isExcludedSavedEntryElement(el: Element, form: HTMLFormElement): boolean {
  if (form.contains(el)) return true
  if (el.closest(".hidden, [hidden], [aria-hidden='true']")) return true
  const id = el.id ?? el.closest("[id]")?.id ?? ""
  if (/template/i.test(id)) return true
  if (el.classList.contains("divtable-head")) return true
  if (el.matches("thead, thead tr, th")) return true
  if (el.matches("button, input, select, textarea")) return true
  return false
}

function normalizeSavedEntryText(el: Element): string {
  const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim() ?? ""
  return text.slice(0, 120)
}

function hashSavedEntryText(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0
  }
  return `h${Math.abs(hash)}`
}

function dedupeNestedSavedEntryRows(rows: Element[]): Element[] {
  return rows.filter(
    (row) => !rows.some((other) => other !== row && other.contains(row))
  )
}

export function findSavedEntryElements(
  sectionRoot: Element,
  form: HTMLFormElement
): Element[] {
  const candidates = new Set<Element>()

  for (const selector of SAVED_ENTRY_ROW_SELECTORS) {
    sectionRoot.querySelectorAll(selector).forEach((el) => {
      if (!isExcludedSavedEntryElement(el, form)) candidates.add(el)
    })
  }

  sectionRoot.querySelectorAll("[class*='-row']").forEach((el) => {
    if (!isExcludedSavedEntryElement(el, form)) candidates.add(el)
  })

  return dedupeNestedSavedEntryRows(Array.from(candidates)).filter((el) => {
    const summary = normalizeSavedEntryText(el)
    return summary.length > 0
  })
}

function buildEntriesListSelector(rows: Element[]): string | undefined {
  if (!rows.length) return undefined
  const first = rows[0]
  const list =
    first.closest(".divtable-body, [class*='-list'], ul, ol, tbody, table") ??
    first.parentElement
  if (!list || list === document.body) return undefined
  if (list.id) return `#${CSS.escape(list.id)}`
  return undefined
}

export function detectSavedAddEntryEntries(
  sectionRoot: Element,
  form: HTMLFormElement
): { entries: AddEntrySavedEntry[]; listSelector?: string } {
  const rows = findSavedEntryElements(sectionRoot, form)
  const entries: AddEntrySavedEntry[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const summary = normalizeSavedEntryText(row)
    if (!summary) continue
    const fingerprint = row.id?.trim() || hashSavedEntryText(summary)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    entries.push({ fingerprint, summary })
  }

  return {
    entries,
    listSelector: buildEntriesListSelector(rows)
  }
}

const APPLY_ORDER: Record<string, number> = {
  text: 0,
  email: 0,
  tel: 0,
  date: 0,
  number: 0,
  textarea: 1,
  "button-group": 2,
  select: 3
}

export async function applyFieldMappings(
  mappings: Array<{ selector: string; value: string | boolean }>
): Promise<Array<{ selector: string; ok: boolean; error?: string }>> {
  const fields = detectFormFields()
  const fieldBySelector = new Map(fields.map((f) => [f.selector, f]))

  const sorted = [...mappings].sort((a, b) => {
    const fa = fieldBySelector.get(a.selector)
    const fb = fieldBySelector.get(b.selector)
    return (APPLY_ORDER[fa?.type ?? "text"] ?? 0) - (APPLY_ORDER[fb?.type ?? "text"] ?? 0)
  })

  const results: Array<{ selector: string; ok: boolean; error?: string }> = []

  for (const mapping of sorted) {
    try {
      const field = fieldBySelector.get(mapping.selector)
      const value = String(mapping.value)

      if (field?.widget === "button-group" || mapping.selector.includes("data-agentman-widget")) {
        await setButtonGroupValue(field, mapping.selector, value)
        results.push({ selector: mapping.selector, ok: true })
        continue
      }

      const el = resolveElement(mapping.selector, field)
      if (!el) {
        results.push({ selector: mapping.selector, ok: false, error: "Element not found" })
        continue
      }

      if (el instanceof HTMLSelectElement) {
        setSelectValue(el, value, field)
      } else if (
        el instanceof HTMLElement &&
        (el.getAttribute("role") === "combobox" || field?.widget === "combobox")
      ) {
        setComboboxValue(el, value, field)
      } else if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "radio") {
        await typeTextIntoElement(el, String(mapping.value))
      } else if (el instanceof HTMLTextAreaElement) {
        await typeTextIntoElement(el, String(mapping.value))
      } else if (el.getAttribute("contenteditable") === "true") {
        await typeContentEditable(el as HTMLElement, String(mapping.value))
      } else {
        setFieldValue(el, mapping.value)
      }

      results.push({ selector: mapping.selector, ok: true })
    } catch (error) {
      results.push({
        selector: mapping.selector,
        ok: false,
        error: error instanceof Error ? error.message : "Failed to set value"
      })
    }
  }

  return results
}

function resolveElement(
  selector: string,
  field?: FormFieldDescriptor
): Element | null {
  const direct = document.querySelector(selector)
  if (direct) return direct

  if (!field) return null

  if (field.id) {
    const byId = document.getElementById(field.id)
    if (byId) return byId
  }

  if (field.name && field.tag) {
    const byName = document.querySelector(
      `${field.tag}[name="${CSS.escape(field.name)}"]`
    )
    if (byName) return byName
  }

  if (field.label) {
    const byKey = document.querySelector(
      `[data-agentman-field-key="${escapeAttrValue(field.label)}"]`
    )
    if (byKey) return byKey
  }

  if (field.widget === "button-group" && field.label) {
    return findButtonGroupContainer(field.label)
  }

  return null
}

function findButtonGroupContainer(label: string): HTMLElement | null {
  const byData = document.querySelector<HTMLElement>(
    `[data-agentman-widget="button-group"][data-agentman-label="${escapeAttrValue(label)}"]`
  )
  if (byData) return byData

  for (const labelEl of document.querySelectorAll("label")) {
    if (labelEl.textContent?.trim() !== label) continue
    const container = labelEl.closest<HTMLElement>(".space-y-1\\.5, [class*='space-y-1']")
    if (container && container.querySelectorAll("button[type='button']").length >= 2) {
      container.dataset.agentmanWidget = "button-group"
      container.dataset.agentmanLabel = label
      return container
    }
  }

  return null
}

function setComboboxValue(
  trigger: HTMLElement,
  value: string,
  field?: FormFieldDescriptor
): void {
  const container = findFieldContainer(trigger)
  const select = container?.querySelector("select")
  if (select instanceof HTMLSelectElement) {
    setSelectValue(select, value, field)
    return
  }

  const normalized = value.trim().toLowerCase()
  const option = field?.options?.find(
    (o) =>
      o.value.toLowerCase() === normalized ||
      o.label.toLowerCase() === normalized ||
      o.label.toLowerCase().includes(normalized) ||
      normalized.includes(o.label.toLowerCase())
  )

  const displayValue = option?.label ?? value.trim()
  const display = trigger.querySelector("[data-slot='select-value']")
  if (display) {
    display.textContent = displayValue
  }
  trigger.removeAttribute("data-placeholder")
  trigger.setAttribute("aria-expanded", "false")
  trigger.setAttribute("data-state", "closed")
  dispatchInputEvents(trigger)
}

function setSelectValue(
  select: HTMLSelectElement,
  value: string,
  field?: FormFieldDescriptor
): void {
  const option = Array.from(select.options).find(
    (o) =>
      o.value === value ||
      o.text.trim().toLowerCase() === value.trim().toLowerCase()
  )

  if (!option) {
    throw new Error(`Option "${value}" not found in select`)
  }

  setNativeValue(select, option.value)

  const container = findFieldContainer(select)
  const trigger = container?.querySelector<HTMLElement>("[role='combobox']")
  if (!trigger) return

  const display = trigger.querySelector("[data-slot='select-value']")
  if (display) {
    display.textContent = option.text.trim()
  }
  trigger.removeAttribute("data-placeholder")
  trigger.setAttribute("aria-expanded", "false")
  trigger.setAttribute("data-state", "closed")
}

async function setButtonGroupValue(
  field: FormFieldDescriptor | undefined,
  selector: string,
  value: string
): Promise<void> {
  const container =
    resolveElement(selector, field) ?? (field?.label ? findButtonGroupContainer(field.label) : null)

  if (!container) throw new Error("Button group not found")

  const normalized = value.trim().toLowerCase()
  const buttons = container.querySelectorAll<HTMLButtonElement>("button[type='button']")

  for (const button of buttons) {
    if (button.textContent?.trim().toLowerCase() === normalized) {
      button.click()
      return
    }
  }

  throw new Error(`Option "${value}" not found in button group`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const TYPING_MAX_DURATION_MS = 3500
const TYPING_BASE_DELAY_MS = 28
const TYPING_MIN_DELAY_MS = 8

async function typeTextIntoElement(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<void> {
  el.focus()
  el.scrollIntoView({ block: "nearest", behavior: "smooth" })
  const prevOutline = el.style.outline
  const prevOffset = el.style.outlineOffset
  el.style.outline = "2px solid hsl(142 71% 45%)"
  el.style.outlineOffset = "2px"

  try {
    if (!value) {
      setNativeValue(el, "")
      dispatchInputEvents(el)
      return
    }

    const delayMs = Math.max(
      TYPING_MIN_DELAY_MS,
      Math.min(TYPING_BASE_DELAY_MS, TYPING_MAX_DURATION_MS / value.length)
    )

    setNativeValue(el, "")
    dispatchInputEvents(el)

    for (let i = 0; i < value.length; i++) {
      setNativeValue(el, value.slice(0, i + 1))
      dispatchInputEvents(el)
      await sleep(delayMs)
    }
  } finally {
    el.style.outline = prevOutline
    el.style.outlineOffset = prevOffset
  }
}

async function typeContentEditable(el: HTMLElement, value: string): Promise<void> {
  el.focus()
  el.scrollIntoView({ block: "nearest", behavior: "smooth" })

  if (!value) {
    el.textContent = ""
    dispatchInputEvents(el)
    return
  }

  const delayMs = Math.max(
    TYPING_MIN_DELAY_MS,
    Math.min(TYPING_BASE_DELAY_MS, TYPING_MAX_DURATION_MS / value.length)
  )

  el.textContent = ""
  dispatchInputEvents(el)

  for (let i = 0; i < value.length; i++) {
    el.textContent = value.slice(0, i + 1)
    dispatchInputEvents(el)
    await sleep(delayMs)
  }
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    "value"
  )
  if (descriptor?.set) {
    descriptor.set.call(el, value)
  } else {
    el.value = value
  }
  dispatchInputEvents(el)
}

function setFieldValue(el: Element, value: string | boolean): void {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = value === true || value === "true"
    } else if (el.type === "file") {
      return
    } else {
      setNativeValue(el, String(value))
    }
    dispatchInputEvents(el)
    return
  }

  if (el instanceof HTMLTextAreaElement) {
    setNativeValue(el, String(value))
    return
  }

  if (el instanceof HTMLSelectElement) {
    setNativeValue(el, String(value))
    return
  }

  if (el.getAttribute("contenteditable") === "true") {
    el.textContent = String(value)
    dispatchInputEvents(el)
  }
}

function dispatchInputEvents(el: Element): void {
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

export function highlightFields(selectors: string[]): void {
  clearHighlights()
  const fields = detectFormFields()
  const fieldBySelector = new Map(fields.map((f) => [f.selector, f]))

  selectors.forEach((selector) => {
    const el = resolveElement(selector, fieldBySelector.get(selector)) as HTMLElement | null
    if (!el) return
    el.dataset.agentmanHighlight = "true"
    el.style.outline = "2px solid hsl(142 71% 45%)"
    el.style.outlineOffset = "2px"
  })
}

export function clearHighlights(): void {
  document.querySelectorAll("[data-agentman-highlight='true']").forEach((el) => {
    const node = el as HTMLElement
    delete node.dataset.agentmanHighlight
    node.style.outline = ""
    node.style.outlineOffset = ""
  })
}

export function detectRepeatableSections(
  root: Document | Element = document
): RepeatableSectionDescriptor[] {
  const sections: RepeatableSectionDescriptor[] = []
  const seen = new Set<string>()

  root.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    const label = btn.textContent?.trim() ?? ""
    if (!/^add\s+/i.test(label)) return
    if (btn.closest("[role='combobox']")) return

    const sectionRoot = findRepeatableSectionRoot(btn)
    if (!sectionRoot) return

    const sectionIndex = sections.length
    sectionRoot.dataset.agentmanRepeatableSection = String(sectionIndex)

    const slug = label
      .toLowerCase()
      .replace(/^add\s+/, "")
      .replace(/\s+/g, "-")
    btn.dataset.agentmanAddButton = slug

    const addButtonSelector = btn.id
      ? `#${CSS.escape(btn.id)}`
      : `[data-agentman-add-button="${slug}"]`
    const sectionSelector = `[data-agentman-repeatable-section="${sectionIndex}"]`

    if (seen.has(addButtonSelector)) return
    seen.add(addButtonSelector)

    sections.push({
      addButtonSelector,
      addButtonLabel: label,
      sectionSelector,
      rowCount: countRepeatableRows(sectionRoot)
    })
  })

  return sections
}

function findRepeatableSectionRoot(btn: Element): HTMLElement | null {
  let el = btn.parentElement
  while (el) {
    if (countRepeatableRows(el) > 0) return el
    el = el.parentElement
  }
  return null
}

function countRepeatableRows(sectionRoot: Element): number {
  return Array.from(sectionRoot.querySelectorAll("div[class*='grid-cols']")).filter(
    (row) => row.querySelector('input[type="date"]')
  ).length
}

function sectionMatchesRowKeys(sectionRoot: Element, rowKeys: string[]): boolean {
  if (!rowKeys.length) return true

  const headers = getGridColumnHeaders(sectionRoot as HTMLElement)
  if (!headers.length) return true

  return rowKeys.some((key) => {
    const match = key.match(/^Row \d+ - (.+)$/)
    if (!match) return false
    const column = match[1].trim().toLowerCase()
    return headers.some((header) => header.toLowerCase() === column)
  })
}

export async function ensureRepeatableRows(
  minRows: number,
  rowKeys: string[] = []
): Promise<{ added: number; rowCount: number }> {
  const sections = detectRepeatableSections()
  let added = 0
  let rowCount = 0

  for (const section of sections) {
    const sectionEl = document.querySelector(section.sectionSelector)
    if (!sectionEl) continue
    if (!sectionMatchesRowKeys(sectionEl, rowKeys)) continue

    let count = countRepeatableRows(sectionEl)
    const maxClicks = Math.max(minRows, 12)

    for (let i = 0; i < maxClicks && count < minRows; i++) {
      const btn = document.querySelector(section.addButtonSelector)
      if (!(btn instanceof HTMLButtonElement) || btn.disabled) break

      btn.click()
      added += 1
      await sleep(200)

      const next = countRepeatableRows(sectionEl)
      if (next <= count) break
      count = next
    }

    rowCount = Math.max(rowCount, count)
  }

  return { added, rowCount }
}

export function getTextSummary(maxLength = 4000): string {
  const clone = document.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll("script, style, noscript").forEach((n) => n.remove())
  const text = clone.innerText.replace(/\s+/g, " ").trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
