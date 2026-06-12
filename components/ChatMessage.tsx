import { Pencil, RotateCcw } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"
import type { ChatMessage as ChatMessageType } from "~/lib/types"

export function ChatMessage({
  message,
  disabled,
  onEdit,
  onRetry
}: {
  message: ChatMessageType
  disabled?: boolean
  onEdit?: (messageId: string, newContent: string) => void
  onRetry?: (messageId: string) => void
}) {
  const isUser = message.role === "user"
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)

  function handleSaveEdit() {
    const trimmed = editText.trim()
    if (!trimmed || !onEdit) return
    onEdit(message.id, trimmed)
    setEditing(false)
  }

  return (
    <div className={cn("group flex w-full flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "relative max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className={cn(
                "min-h-[60px] resize-none text-sm",
                isUser && "bg-primary-foreground/10 text-primary-foreground"
              )}
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={isUser ? "text-primary-foreground hover:bg-primary-foreground/10" : ""}
                onClick={() => {
                  setEditText(message.content)
                  setEditing(false)
                }}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveEdit}
                disabled={!editText.trim()}>
                Save & retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap">
              {message.content || (message.isStreaming ? "…" : "")}
            </p>
            {message.images?.map((src) => (
              <img
                key={src.slice(0, 32)}
                src={src}
                alt="attachment"
                className="mt-2 max-h-40 rounded-md"
              />
            ))}
          </>
        )}
      </div>

      {!editing && !message.isStreaming && !disabled && (
        <div
          className={cn(
            "mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
            isUser ? "justify-end" : "justify-start"
          )}>
          {isUser && onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setEditText(message.content)
                setEditing(true)
              }}>
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
          {onRetry && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => onRetry(message.id)}>
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
