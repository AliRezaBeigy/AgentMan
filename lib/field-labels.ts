/** Normalize scraped labels (strip required markers, extra whitespace). */
export function cleanFieldLabel(label: string): string {
  return label
    .replace(/\s*\*\s*/g, " ")
    .replace(/\(required\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}
