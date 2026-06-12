import type { PageContext } from "~/lib/types"

/** Drop generic keys like item1..item8 that models invent instead of Row N - Column. */
export function pruneInvalidFillKeys(merged: Record<string, unknown>): void {
  for (const key of Object.keys(merged)) {
    if (/^item\d+$/i.test(key)) {
      delete merged[key]
    }
  }
}

export function buildPageContextNote(pageContext: PageContext, maxLength = 2500): string {
  const parts: string[] = []

  if (pageContext.title?.trim()) {
    parts.push(`Page title: ${pageContext.title.trim()}`)
  }

  if (pageContext.url?.trim()) {
    parts.push(`URL: ${pageContext.url.trim()}`)
  }

  const summary = pageContext.textSummary?.trim()
  if (summary) {
    const clipped =
      summary.length > maxLength ? `${summary.slice(0, maxLength)}…` : summary
    parts.push(`Visible page text (use this to infer site purpose — university, expense report, job application, etc.):\n${clipped}`)
  }

  if (!parts.length) return ""
  return `\n\nPage context:\n${parts.join("\n\n")}`
}

export function getLastUserMessage(
  messages: Array<{ role: string; content: string }>
): string {
  const userMessages = messages.filter((m) => m.role === "user")
  return userMessages[userMessages.length - 1]?.content?.trim() ?? ""
}
