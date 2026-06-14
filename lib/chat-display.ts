/** Strip legacy inline attachment suffix from stored message content. */
export function stripLegacyAttachmentNote(content: string): string {
  return content.replace(/\n\n\[Attached:[^\]]+\]\s*$/, "").trimEnd()
}
