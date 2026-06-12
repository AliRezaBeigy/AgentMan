import { describe, expect, it } from "vitest"

import {
  buildStagedFilesContextNote,
  dataUrlToText,
  extractTextFromStagedFile,
  isTextContextFile
} from "~/lib/staged-files"
import type { StagedFile } from "~/lib/types"

describe("staged-files", () => {
  it("detects text files by extension", () => {
    expect(isTextContextFile({ name: "resume.txt", mimeType: "" })).toBe(true)
    expect(isTextContextFile({ name: "photo.png", mimeType: "image/png" })).toBe(false)
  })

  it("decodes base64 text data URLs", () => {
    const encoded = btoa("Jane Doe\nSoftware Engineer")
    const text = dataUrlToText(`data:text/plain;base64,${encoded}`)
    expect(text).toContain("Jane Doe")
  })

  it("builds context note from resume text", () => {
    const encoded = btoa("University of Example\nBS Computer Science")
    const file: StagedFile = {
      id: "1",
      name: "resume.txt",
      mimeType: "text/plain",
      data: `data:text/plain;base64,${encoded}`,
      createdAt: Date.now()
    }

    expect(extractTextFromStagedFile(file)).toContain("University of Example")
    const note = buildStagedFilesContextNote([file])
    expect(note).toContain("resume.txt")
    expect(note).toContain("University of Example")
  })
})
