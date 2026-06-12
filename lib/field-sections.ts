import { cleanFieldLabel } from "~/lib/field-labels"

/** Nearest section heading for contextual field labels (works on any site). */
export function findSectionLabel(el: Element): string | null {
  const section = el.closest("section, [id^='section-'], fieldset")
  if (section) {
    for (const child of section.children) {
      if (/^H[1-4]$/.test(child.tagName) && child.textContent?.trim()) {
        return cleanFieldLabel(child.textContent)
      }
      if (child.tagName === "LEGEND" && child.textContent?.trim()) {
        return cleanFieldLabel(child.textContent)
      }
    }
  }

  let node: Element | null = el
  while (node) {
    const prev = node.previousElementSibling
    if (prev?.matches("h1, h2, h3, h4, legend") && prev.textContent?.trim()) {
      return cleanFieldLabel(prev.textContent)
    }
    node = node.parentElement
  }

  return null
}
