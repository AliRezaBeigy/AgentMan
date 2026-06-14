import { FileText, Paperclip } from "lucide-react"

import { cn } from "~/lib/utils"
import type { ChatAttachmentRef } from "~/lib/types"

export function AttachmentBubbles({
  attachments,
  variant = "user"
}: {
  attachments: ChatAttachmentRef[]
  variant?: "user" | "muted"
}) {
  if (!attachments.length) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((file) => (
        <span
          key={file.id}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium",
            variant === "user"
              ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground"
              : "border-border bg-background text-foreground"
          )}
          title={file.name}>
          {file.name.endsWith(".md") || file.name.endsWith(".txt") ? (
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-80" />
          ) : (
            <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-80" />
          )}
          <span className="truncate">{file.name}</span>
        </span>
      ))}
    </div>
  )
}
