import type { FormFieldDescriptor } from "~/lib/types"

const PLACEHOLDER_SELECT_VALUES = new Set([
  "",
  "-1",
  "0",
  "choose",
  "select",
  "select...",
  "please select"
])

/** Label text (raw or cleaned) still indicates required when asterisk / Required marker present. */
export function labelTextIndicatesRequired(labelText: string): boolean {
  if (/\*\s*$/.test(labelText.trim())) return true
  if (/\(\s*required\s*\)/i.test(labelText)) return true
  if (/\brequired\b/i.test(labelText) && labelText.length < 80) return true
  return false
}

/** True when a label element uses common required markers (Varbi *, sr-only, etc.). */
export function labelElementIndicatesRequired(labelEl: Element): boolean {
  if (labelEl.querySelector(".required, [class*='required']")) return true
  const sr = labelEl.querySelector(".sr-only, .visually-hidden")
  if (sr?.textContent && /\brequired\b/i.test(sr.textContent)) return true
  const raw = labelEl.textContent ?? ""
  return labelTextIndicatesRequired(raw)
}

export function detectFieldRequired(el: Element, cleanedLabel?: string): boolean {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    if (el.required) return true
  }
  if (el.getAttribute("aria-required") === "true") return true

  const doc = el.ownerDocument
  if (!doc) return false

  const id = el.getAttribute("id")
  if (id) {
    const forLabel = doc.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (forLabel && labelElementIndicatesRequired(forLabel)) return true
  }

  const group = el.closest(".form-group, .clearfix, [class*='form-group']")
  if (group) {
    const groupLabel = group.querySelector("label")
    if (groupLabel && labelElementIndicatesRequired(groupLabel)) return true
  }

  const parentLabel = el.closest("label")
  if (parentLabel && labelElementIndicatesRequired(parentLabel)) return true

  return cleanedLabel ? labelTextIndicatesRequired(cleanedLabel) : false
}

export function isPlaceholderSelectValue(value: string | undefined | null): boolean {
  if (value == null) return true
  const normalized = String(value).trim().toLowerCase()
  return PLACEHOLDER_SELECT_VALUES.has(normalized)
}

export function isEmptyFieldValue(field: FormFieldDescriptor, value: string | undefined | null): boolean {
  if (value == null) return true
  const trimmed = String(value).trim()
  if (!trimmed) return true
  if (field.type === "select" || field.type === "button-group") {
    return isPlaceholderSelectValue(trimmed)
  }
  return false
}

/** Where attachment data often lives under a different name than the form label. */
export function buildIndirectAttachmentHint(field: FormFieldDescriptor): string | undefined {
  const label = field.label ?? field.name ?? ""
  const part = label.includes(" - ") ? label.split(" - ").slice(1).join(" - ") : label

  const rules: Array<{ test: RegExp; hint: string }> = [
    {
      test: /field of education|major|programme|program of study/i,
      hint: "attachment: degree major/field (e.g. Computer Science)"
    },
    {
      test: /^education name$|degree name|degree title/i,
      hint: "attachment: degree type (Bachelor, Master, PhD)"
    },
    {
      test: /university|college|institution|school name/i,
      hint: "attachment: institution name"
    },
    {
      test: /finished part|completed level|degree completion/i,
      hint: "use 6 for Graduated (not 1 Choose)"
    },
    {
      test: /education level|degree level/i,
      hint: "map degree to option (Master≈10106, Bachelor≈10105, PhD≈10109)"
    },
    {
      test: /country/i,
      hint: "attachment: ISO code (IR not Iran)"
    },
    {
      test: /^from$|start year|year from|date from/i,
      hint: "attachment: start year"
    },
    {
      test: /^to$|end year|year to|date to/i,
      hint: "attachment: end year (or Current)"
    },
    {
      test: /budget responsibility|staff responsibility/i,
      hint: "use 0 for No if not in attachment"
    },
    {
      test: /^city$|town/i,
      hint: "attachment: city (often in same education/work block)"
    },
    {
      test: /^title$|position/i,
      hint: "attachment: job title"
    },
    {
      test: /employer|company/i,
      hint: "attachment: employer/organization name"
    }
  ]

  for (const rule of rules) {
    if (rule.test.test(part) || rule.test.test(label)) return rule.hint
  }
  return undefined
}

export function formatRequiredFieldLine(field: FormFieldDescriptor, alias?: string): string {
  const name = alias ?? field.label ?? field.selector
  const indirect = buildIndirectAttachmentHint(field)
  const parts = [name, "REQUIRED"]
  if (field.type === "select" && field.options?.length) {
    const opts = field.options
      .filter((o) => !isPlaceholderSelectValue(o.value))
      .slice(0, 5)
      .map((o) => o.value || o.label)
      .join("|")
    if (opts) parts.push(`options:${opts}`)
  }
  if (indirect) parts.push(indirect)
  return parts.join("; ")
}

export function getMissingRequiredFields(
  sectionFields: FormFieldDescriptor[],
  filledSelectors: ReadonlySet<string>,
  valueBySelector?: ReadonlyMap<string, string>
): FormFieldDescriptor[] {
  return sectionFields.filter((field) => {
    if (!field.required) return false
    const current = valueBySelector?.get(field.selector) ?? field.value
    if (filledSelectors.has(field.selector)) {
      return isEmptyFieldValue(field, current)
    }
    return isEmptyFieldValue(field, current)
  })
}

export function buildMissingRequiredMessage(missing: FormFieldDescriptor[]): string {
  if (!missing.length) return ""
  const lines = missing.map((field) => {
    const indirect = buildIndirectAttachmentHint(field)
    const label = field.label ?? field.selector
    return indirect ? `- ${label} (${indirect})` : `- ${label}`
  })
  return `Missing required fields — call fill for each:\n${lines.join("\n")}`
}
