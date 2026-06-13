import { describe, expect, it } from "vitest"

import {
  estimateAttachmentEntryCounts,
  scoreSectionHeaderMatch
} from "~/lib/attachment-entry-estimate"

const sampleCv = `
add my works and educations

[Attached: application.md]

Attached context:
--- application.md ---
## Work Experience

### Teaching Assistant (Advanced Programming)
Dr. Azadeh Mansouri, 2022

### Teaching Assistant (Systems Analysis)
Dr. Seyedeh Leili Mirtaheri, 2021

### Project Manager and DevOps Engineer
2020 - 2021

### Researcher
2022

### Chief Technology Officer
KarYab Pars, 2020 - 2021

### Co-founder & Vice Chairman
Pasargad Smart Trade, 2018 - 2020

### Web Developer
Basirat Research Center, 2019

## Education

### Master of Science
University of Tehran, 2022 - 2025

### Bachelor of Software Engineering
Kharazmi University, 2018 - 2022
`

describe("attachment-entry-estimate", () => {
  it("counts work and education entries from markdown headings", () => {
    const counts = estimateAttachmentEntryCounts(sampleCv, ["Work experience", "Education"])
    expect(counts.get("Work experience")).toBe(7)
    expect(counts.get("Education")).toBe(2)
  })

  it("matches section labels to headers by shared words", () => {
    expect(scoreSectionHeaderMatch("Work Experience", "Work experience")).toBe(100)
    expect(scoreSectionHeaderMatch("Education", "Education")).toBe(100)
    expect(scoreSectionHeaderMatch("Language skills", "Language")).toBeGreaterThanOrEqual(50)
  })

  it("counts entries for arbitrary section labels on the page", () => {
    const message = `
[Attached: cv.md]
## Publications
### Paper A
### Paper B
## Awards
### Best paper
`
    const counts = estimateAttachmentEntryCounts(message, ["Publications", "Awards"])
    expect(counts.get("Publications")).toBe(2)
    expect(counts.get("Awards")).toBe(1)
  })

  it("returns empty counts when no section labels are provided", () => {
    expect(estimateAttachmentEntryCounts(sampleCv)).toEqual(new Map())
  })
})
