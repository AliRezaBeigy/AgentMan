import { MessageSquare, Trash2, X } from "lucide-react"

import { Button } from "~/components/ui/button"
import { ScrollArea } from "~/components/ui/scroll-area"
import { cn } from "~/lib/utils"
import type { ChatSession } from "~/lib/types"

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function ChatHistorySidebar({
  open,
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onClose
}: {
  open: boolean
  sessions: ChatSession[]
  activeSessionId: string
  onSelect: (session: ChatSession) => void
  onDelete: (sessionId: string) => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex bg-background/80 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-[280px] flex-col border-r bg-background shadow-lg">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="text-sm font-semibold">Chat history</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {sessions.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No previous chats yet
              </p>
            )}
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-start gap-1 rounded-lg px-2 py-2 hover:bg-muted",
                  session.id === activeSessionId && "bg-muted"
                )}>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(session)}>
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm font-medium">{session.title}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {session.messages.length} message{session.messages.length === 1 ? "" : "s"} ·{" "}
                    {formatRelativeTime(session.updatedAt)}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(session.id)
                  }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <button type="button" className="flex-1" onClick={onClose} aria-label="Close history" />
    </div>
  )
}
