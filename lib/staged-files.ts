import type { StagedFile } from "~/lib/types"

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript"]
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".rtf",
  ".tex",
  ".html",
  ".htm"
])

export function isTextContextFile(file: Pick<StagedFile, "mimeType" | "name">): boolean {
  const mime = file.mimeType?.toLowerCase() ?? ""
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true

  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ""
  return TEXT_EXTENSIONS.has(ext)
}

export function dataUrlToText(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) return null

  const comma = dataUrl.indexOf(",")
  if (comma < 0) return null

  const header = dataUrl.slice(5, comma)
  const payload = dataUrl.slice(comma + 1)

  if (header.includes(";base64")) {
    const mime = header.split(";")[0]?.toLowerCase() ?? ""
    if (
      !TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) &&
      mime !== "application/octet-stream"
    ) {
      return null
    }
    try {
      return atob(payload)
    } catch {
      return null
    }
  }

  try {
    return decodeURIComponent(payload)
  } catch {
    return payload
  }
}

export function extractTextFromStagedFile(file: StagedFile): string | null {
  if (!isTextContextFile(file)) return null
  const text = dataUrlToText(file.data)
  if (!text?.trim()) return null
  return text
}

export function buildStagedFilesContextNote(
  files: StagedFile[],
  maxPerFile = 15_000
): string {
  if (!files.length) return ""

  const parts: string[] = []
  for (const file of files) {
    const text = extractTextFromStagedFile(file)
    if (text) {
      const clipped =
        text.length > maxPerFile ? `${text.slice(0, maxPerFile)}\n… (truncated)` : text
      parts.push(`--- ${file.name} ---\n${clipped}\n---`)
    } else {
      parts.push(
        `[Attached: ${file.name} — not included as text context; use upload_file in Agent mode for file inputs]`
      )
    }
  }

  return `\n\nAttached context:\n${parts.join("\n\n")}\n\nUse facts from attached files when choosing field values.\n`
}
