export function extractAttachmentText(userMessage: string): string {
  const attachedIdx = userMessage.indexOf("[Attached:")
  if (attachedIdx >= 0) return userMessage.slice(attachedIdx)

  const contextIdx = userMessage.search(/\nAttached context:\s*\n/i)
  if (contextIdx >= 0) return userMessage.slice(contextIdx)

  return userMessage
}

interface MarkdownSection {
  header: string
  startLine: number
  endLine: number
}

function normalizeSectionText(text: string): string {
  return text.toLowerCase().replace(/\W+/g, " ").trim()
}

function sectionHeaderWords(text: string): string[] {
  return normalizeSectionText(text)
    .split(/\s+/)
    .filter((word) => word.length > 2)
}

/** Score how well a markdown ## header matches a form section label (0–100). */
export function scoreSectionHeaderMatch(headerText: string, sectionLabel: string): number {
  const headerNorm = normalizeSectionText(headerText)
  const labelNorm = normalizeSectionText(sectionLabel)
  if (!labelNorm) return 0
  if (headerNorm === labelNorm) return 100
  if (headerNorm.includes(labelNorm) || labelNorm.includes(headerNorm)) return 85

  const headerWords = sectionHeaderWords(headerText)
  const labelWords = sectionHeaderWords(sectionLabel)
  if (!labelWords.length) return 0

  const matched = labelWords.filter((labelWord) =>
    headerWords.some(
      (headerWord) =>
        headerWord === labelWord ||
        headerWord.startsWith(labelWord) ||
        labelWord.startsWith(headerWord)
    )
  ).length

  if (!matched) return 0
  return Math.round((matched / labelWords.length) * 80)
}

function parseMarkdownSections(body: string): MarkdownSection[] {
  const lines = body.split(/\r?\n/)
  const headers: { header: string; lineIndex: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const match = line.match(/^##(?!#)\s+(.+)/)
    if (match?.[1]) headers.push({ header: match[1].trim(), lineIndex: i })
  }

  return headers.map((header, index) => ({
    header: header.header,
    startLine: header.lineIndex + 1,
    endLine:
      index + 1 < headers.length ? headers[index + 1]!.lineIndex - 1 : lines.length - 1
  }))
}

function assignSectionsToHeaders(
  sectionLabels: string[],
  markdownSections: MarkdownSection[]
): Map<string, MarkdownSection> {
  const assignments = new Map<string, MarkdownSection>()
  const usedHeaders = new Set<number>()

  const candidates = sectionLabels.flatMap((label) =>
    markdownSections.map((section) => ({
      label,
      section,
      score: scoreSectionHeaderMatch(section.header, label)
    }))
  )
  candidates.sort((a, b) => b.score - a.score)

  for (const { label, section, score } of candidates) {
    if (score < 50) continue
    if (assignments.has(label)) continue
    if (usedHeaders.has(section.startLine)) continue
    assignments.set(label, section)
    usedHeaders.add(section.startLine)
  }

  return assignments
}

function extractSectionText(body: string, section: MarkdownSection): string {
  const lines = body.split(/\r?\n/)
  const sectionLines: string[] = []
  for (let i = section.startLine; i <= section.endLine; i++) {
    sectionLines.push(lines[i] ?? "")
  }
  return sectionLines.join("\n").trim()
}

function countSectionEntries(sectionText: string): number {
  if (!sectionText.trim()) return 0

  const h3 = (sectionText.match(/^###\s+\S/gm) ?? []).length
  if (h3 > 0) return h3

  const h4 = (sectionText.match(/^####\s+\S/gm) ?? []).length
  if (h4 > 0) return h4

  const yearLeadBlocks = (sectionText.match(/^\*\*\d{4}(?:\s*[-–—]\s*\d{4})?/gm) ?? []).length
  if (yearLeadBlocks > 0) return yearLeadBlocks

  const boldBullets = (sectionText.match(/^-\s+\*\*.+\*\*/gm) ?? []).length
  if (boldBullets > 0) return boldBullets

  const datedBullets = (sectionText.match(/^-\s+\*\*\d{4}/gm) ?? []).length
  if (datedBullets > 0) return datedBullets

  const rules = (sectionText.match(/^\*\*\*+\s*$/gm) ?? []).length
  if (rules > 1) return rules - 1

  return 0
}

/** Best-effort count of attachment items per add-entry section from markdown. */
export function estimateAttachmentEntryCounts(
  userMessage: string,
  sectionLabels: string[] = []
): ReadonlyMap<string, number> {
  const body = extractAttachmentText(userMessage)
  const counts = new Map<string, number>()
  if (!sectionLabels.length) return counts

  const markdownSections = parseMarkdownSections(body)
  const assignments = assignSectionsToHeaders(sectionLabels, markdownSections)

  for (const label of sectionLabels) {
    const section = assignments.get(label)
    if (!section) continue
    const count = countSectionEntries(extractSectionText(body, section))
    if (count > 0) counts.set(label, count)
  }

  return counts
}
