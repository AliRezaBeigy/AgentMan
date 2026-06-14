import { Pencil, RotateCcw } from "lucide-react"
import { useState } from "react"

import { AgentStepsPanel } from "~/components/AgentStepsPanel"
import { AttachmentBubbles } from "~/components/AttachmentBubbles"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { stripLegacyAttachmentNote } from "~/lib/chat-display"
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
  const displayContent = stripLegacyAttachmentNote(message.content)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(displayContent)

  function handleSaveEdit() {
    const trimmed = editText.trim()
    if (!trimmed || !onEdit) return
    onEdit(message.id, trimmed)
    setEditing(false)
  }

  return (
    <div
      className={cn(
        "group flex w-full flex-col",
        isUser ? "items-end" : "items-stretch"
      )}>
      <div
        className={cn(
          "relative rounded-xl text-sm leading-relaxed",
          isUser
            ? "max-w-[85%] bg-primary px-2.5 py-1.5 text-primary-foreground"
            : "w-full bg-muted px-2 py-1.5 text-foreground"
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
                  setEditText(displayContent)
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
            {!isUser && message.agentSteps && message.agentSteps.length > 0 && (
              <AgentStepsPanel steps={message.agentSteps} isStreaming={message.isStreaming} />
            )}
            {displayContent && (
              <p className="whitespace-pre-wrap">{displayContent}</p>
            )}
            {isUser && message.attachments && message.attachments.length > 0 && (
              <AttachmentBubbles attachments={message.attachments} variant="user" />
            )}
            {message.images?.map((src) => (
              <img
                key={src.slice(0, 32)}
                src={src}
                alt="attachment"
                className="mt-1.5 max-h-40 rounded-md"
              />
            ))}
          </>
        )}
      </div>

      {!editing && !message.isStreaming && !disabled && (
        <div
          className={cn(
            "mt-0.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
            isUser ? "justify-end" : "justify-start"
          )}>
          {isUser && onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setEditText(displayContent)
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
