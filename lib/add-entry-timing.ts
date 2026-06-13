import { pickCssSelector } from "~/lib/add-entry-workflow"
import type { AddEntrySectionDescriptor } from "~/lib/types"

export type AddEntryClickKind = "open" | "submit"

const IS_VISIBLE_HELPER = `const __isVisible = (el) => {
  if (!el) return false;
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};`

export function normalizeSelector(selector: string): string {
  return selector.trim()
}

function selectorsLooselyMatch(clicked: string, candidate: string): boolean {
  const a = clicked.trim().toLowerCase()
  const b = candidate.trim().toLowerCase()
  if (!a || !b) return false
  if (a === b) return true
  return a.includes(b) || b.includes(a)
}

/** Detect selectors truncated by malformed JSON (common with deepseek text actions). */
export function isBrokenSelector(selector: string): boolean {
  const t = selector.trim()
  if (!t || t.length < 5) return true
  if (/\[onclick\*=['"]?$/.test(t)) return true
  if (/\[onclick\*=$/.test(t)) return true
  if (t.includes("[onclick") && !t.includes("]")) return true
  return false
}

/** Build a working onclick selector when the model mentions showAddnewSkill anywhere. */
export function canonicalizeShowAddnewSkillSelector(text: string): string | null {
  const match = text.match(/showAddnewSkill\s*\(\s*\\?['"](\w+)\\?['"]\s*\)/i)
  if (!match) return null
  return `button[onclick*="showAddnewSkill('${match[1]}')"]`
}

function sectionLabelTokens(label: string): string[] {
  return label.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function scoreTextForSection(text: string, section: AddEntrySectionDescriptor): number {
  const lower = text.toLowerCase()
  let score = 0

  const formId = section.formSelector.replace(/^#/, "").toLowerCase()
  if (formId && lower.includes(formId)) score += 40

  const addSel = pickCssSelector(section.addButtonSelector).toLowerCase()
  if (addSel.length > 4 && lower.includes(addSel.slice(0, Math.min(addSel.length, 24)))) {
    score += 25
  }

  for (const token of sectionLabelTokens(section.sectionLabel)) {
    if (token.length > 2 && lower.includes(token)) score += 15
  }

  for (const label of section.fieldLabels.slice(0, 6)) {
    const part = label.split(" - ").slice(1).join(" - ").toLowerCase()
    if (part.length > 2 && lower.includes(part)) score += 5
  }

  return score
}

/** Guess add-entry section from a selector, label, or raw model text. */
export function inferAddEntrySectionFromText(
  text: string,
  sections: AddEntrySectionDescriptor[]
): AddEntrySectionDescriptor | null {
  if (!text.trim() || !sections.length) return null

  const skillMatch = text.match(/showAddnewSkill\s*\(\s*\\?['"]?(\w+)\\?['"]?\s*\)/i)
  if (skillMatch) {
    const skill = skillMatch[1].toLowerCase()
    const bySkill = sections.find(
      (section) =>
        section.addButtonSelector.toLowerCase().includes(skill) ||
        section.formSelector.toLowerCase().includes(skill)
    )
    if (bySkill) return bySkill
  }

  let best: { section: AddEntrySectionDescriptor; score: number } | null = null
  for (const section of sections) {
    const score = scoreTextForSection(text, section)
    if (score >= 15 && (!best || score > best.score)) best = { section, score }
  }

  return best?.section ?? null
}

export interface ResolvedAddEntryClick {
  selector: string
  clickTarget: { section: AddEntrySectionDescriptor; kind: AddEntryClickKind } | null
}

/** Normalize click args before CDP — repairs broken selectors and section labels. */
export function resolveAgentClickArgs(
  args: Record<string, unknown>,
  sections: AddEntrySectionDescriptor[],
  contentHint = ""
): ResolvedAddEntryClick {
  const hint = `${contentHint}\n${String(args.selector ?? "")}\n${String(args.section ?? "")}`
  const sectionLabel = String(args.section ?? "").trim()
  let selector = String(args.selector ?? "").trim()

  if (sectionLabel) {
    const section = sections.find(
      (item) =>
        item.sectionLabel.toLowerCase() === sectionLabel.toLowerCase() ||
        item.sectionLabel.toLowerCase().includes(sectionLabel.toLowerCase())
    )
    if (section) {
      return {
        selector: pickCssSelector(section.addButtonSelector),
        clickTarget: { section, kind: "open" }
      }
    }
  }

  const canonical = canonicalizeShowAddnewSkillSelector(hint)
  if (canonical) selector = canonical

  if (!selector || isBrokenSelector(selector)) {
    const inferred = inferAddEntrySectionFromText(hint, sections)
    if (inferred) {
      return {
        selector: pickCssSelector(inferred.addButtonSelector),
        clickTarget: { section: inferred, kind: "open" }
      }
    }
  }

  let clickTarget = resolveAddEntryClickTarget(selector, sections)
  if (!clickTarget) {
    const inferred = inferAddEntrySectionFromText(hint, sections)
    if (inferred) {
      return {
        selector: pickCssSelector(inferred.addButtonSelector),
        clickTarget: { section: inferred, kind: "open" }
      }
    }
    return { selector, clickTarget: null }
  }

  if (clickTarget.kind === "open") {
    selector = resolveAddEntryOpenClickSelector(selector, clickTarget.section)
  }

  return { selector, clickTarget }
}

/** The form id is not the control that opens a collapsed add-entry panel. */
export function resolveAddEntryOpenClickSelector(
  requestedSelector: string,
  section: AddEntrySectionDescriptor
): string {
  const requested = normalizeSelector(requestedSelector)
  if (requested.toLowerCase() === section.formSelector.toLowerCase()) {
    return pickCssSelector(section.addButtonSelector)
  }
  return requested
}

/** Map a click selector to an add-entry open or submit action. */
export function resolveAddEntryClickTarget(
  selector: string,
  sections: AddEntrySectionDescriptor[]
): { section: AddEntrySectionDescriptor; kind: AddEntryClickKind } | null {
  const clicked = normalizeSelector(selector).toLowerCase()
  if (!clicked) return null

  for (const section of sections) {
    const submitSel = pickCssSelector(section.submitSelector).toLowerCase()
    const addSel = pickCssSelector(section.addButtonSelector).toLowerCase()
    const formSel = section.formSelector.toLowerCase()

    if (clicked === submitSel) {
      return { section, kind: "submit" }
    }

    if (clicked === formSel || clicked === addSel) {
      return { section, kind: "open" }
    }

    if (clicked.startsWith(`${formSel} `) && /submit|btn-success/i.test(clicked)) {
      return { section, kind: "submit" }
    }

    if (selectorsLooselyMatch(clicked, addSel)) {
      return { section, kind: "open" }
    }
  }

  return null
}

/** CDP expression: sub-form is visible and ready to fill. */
export function buildFormReadyCheckExpression(section: AddEntrySectionDescriptor): string {
  const formSel = section.formSelector
  const submitSel = pickCssSelector(section.submitSelector)
  return `(() => {
    ${IS_VISIBLE_HELPER}
    const form = document.querySelector(${JSON.stringify(formSel)});
    if (!form) return false;
    const container = form.closest(".collapse");
    if (container) {
      if (container.getAttribute("aria-expanded") === "false") return false;
      const open =
        container.classList.contains("in") ||
        container.classList.contains("show") ||
        container.getBoundingClientRect().height > 0;
      if (!open) return false;
    }
    const submit = document.querySelector(${JSON.stringify(submitSel)});
    const field = form.querySelector(
      "input:not([type=hidden]):not([type=submit]), select, textarea"
    );
    return __isVisible(form) && __isVisible(submit) && __isVisible(field);
  })()`
}

/** CDP expression: sub-form submit control is hidden (entry saved / panel closed). */
export function buildFormClosedCheckExpression(section: AddEntrySectionDescriptor): string {
  const submitSel = pickCssSelector(section.submitSelector)
  return `(() => {
    ${IS_VISIBLE_HELPER}
    const submit = document.querySelector(${JSON.stringify(submitSel)});
    return !__isVisible(submit);
  })()`
}

/** Evaluate a timing expression in a browser document (for tests). */
export function evaluateAddEntryCheck(doc: Document, expression: string): boolean {
  const scoped = expression.replace(/\bdocument\b/g, "doc")
  return Boolean(new Function("doc", `return ${scoped}`)(doc))
}
