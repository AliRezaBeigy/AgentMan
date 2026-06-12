import {
  History,
  ImageIcon,
  Paperclip,
  Pause,
  Play,
  Plus,
  Settings,
  Square,
  Tags,
  X
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { ChatHistorySidebar } from "~/components/ChatHistorySidebar"
import { ChatMessage } from "~/components/ChatMessage"
import { ModeSwitcher } from "~/components/ModeSwitcher"
import { PromptEditor } from "~/components/PromptEditor"
import { SettingsPanel } from "~/components/SettingsPanel"
import { SnippetsPanel } from "~/components/SnippetsPanel"
import { Button } from "~/components/ui/button"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  createSession,
  deleteSession,
  listSessions,
  saveSession
} from "~/lib/db"
import { MessageType, type ChatHistoryEntry } from "~/lib/messages"
import { getSettings } from "~/lib/storage"
import type {
  AgentState,
  ChatMessage as ChatMessageType,
  ChatMode,
  ChatSession,
  StagedFile
} from "~/lib/types"

type View = "chat" | "settings" | "snippets"

const STAGED_FILES_KEY = "agentman_staged_files"

function toHistoryEntries(messages: ChatMessageType[]): ChatHistoryEntry[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      images: m.images
    }))
}

export function SidePanelApp() {
  const [view, setView] = useState<View>("chat")
  const [mode, setMode] = useState<ChatMode>("fill")
  const [session, setSession] = useState<ChatSession>(() => createSession("fill"))
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<StagedFile[]>([])
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [agentState, setAgentState] = useState<AgentState>({ status: "idle", iteration: 0 })
  const [isSending, setIsSending] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const sessionIdRef = useRef(session.id)
  const chatEndRef = useRef<HTMLDivElement>(null)

  sessionIdRef.current = session.id

  const refreshSessions = useCallback(async () => {
    const list = await listSessions()
    setSessions(list)
    return list
  }, [])

  const persistSession = useCallback(async (next: ChatSession) => {
    if (next.messages.length === 0) return
    await saveSession(next)
    await refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    void getSettings().then((settings) => {
      document.documentElement.classList.toggle("dark", settings.theme === "dark")
    })

    void (async () => {
      const list = await refreshSessions()
      if (list.length > 0) {
        setSession(list[0])
        setMode(list[0].mode)
      }
    })()
  }, [refreshSessions])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [session.messages])

  useEffect(() => {
    const listener = (message: { type: string; payload?: unknown }) => {
      const activeId = sessionIdRef.current

      if (message.type === MessageType.CHAT_STREAM) {
        const payload = message.payload as { sessionId: string; delta: string }
        if (payload.sessionId !== activeId) return
        setSession((prev) => {
          const messages = [...prev.messages]
          const last = messages[messages.length - 1]
          if (!last || last.role !== "assistant") {
            messages.push({
              id: crypto.randomUUID(),
              role: "assistant",
              content: payload.delta,
              createdAt: Date.now(),
              isStreaming: true
            })
          } else {
            messages[messages.length - 1] = {
              ...last,
              content: last.content + payload.delta
            }
          }
          return { ...prev, messages }
        })
      }

      if (message.type === MessageType.CHAT_DONE) {
        const payload = message.payload as { sessionId: string; content: string }
        if (payload.sessionId !== activeId) return
        setIsSending(false)
        setAgentState({ status: "idle", iteration: 0 })
        setSession((prev) => {
          const messages = [...prev.messages]
          const last = messages[messages.length - 1]
          if (last?.role === "assistant") {
            messages[messages.length - 1] = {
              ...last,
              content: payload.content || last.content,
              isStreaming: false
            }
          } else {
            messages.push({
              id: crypto.randomUUID(),
              role: "assistant",
              content: payload.content,
              createdAt: Date.now()
            })
          }
          const next = { ...prev, messages, updatedAt: Date.now() }
          void persistSession(next)
          return next
        })
      }

      if (message.type === MessageType.CHAT_ERROR) {
        const payload = message.payload as { sessionId: string; error: string }
        if (payload.sessionId !== activeId) return
        setIsSending(false)
        setAgentState({ status: "idle", iteration: 0 })
        setSession((prev) => {
          const next = {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: crypto.randomUUID(),
                role: "assistant" as const,
                content: `Error: ${payload.error}`,
                createdAt: Date.now()
              }
            ],
            updatedAt: Date.now()
          }
          void persistSession(next)
          return next
        })
      }

      if (message.type === MessageType.AGENT_STATE) {
        const state = message.payload as AgentState
        setAgentState(state)
        if (state.status === "idle" || state.status === "stopped") {
          setIsSending(false)
        }
      }

      if (message.type === MessageType.SCREENSHOT_CAPTURED) {
        const payload = message.payload as { dataUrl: string }
        setPendingImages((prev) => [...prev, payload.dataUrl])
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [persistSession])

  const isBusy =
    isSending || agentState.status === "running" || agentState.status === "paused"

  async function stopIfRunning() {
    if (isBusy) {
      await chrome.runtime.sendMessage({ type: MessageType.AGENT_STOP })
      setIsSending(false)
      setAgentState({ status: "idle", iteration: 0 })
    }
  }

  async function handleSendOrStop() {
    if (isBusy) {
      await stopIfRunning()
      return
    }
    await handleSend()
  }

  async function dispatchChat(
    messages: ChatMessageType[],
    chatMode: ChatMode,
    sessionId: string,
    stagedFileIds: string[] = []
  ) {
    const last = messages[messages.length - 1]
    if (!last || last.role !== "user") return

    const history = toHistoryEntries(messages.slice(0, -1))

    await chrome.runtime.sendMessage({
      type: chatMode === "fill" ? MessageType.FILL_EXECUTE : MessageType.CHAT_SEND,
      payload: {
        sessionId,
        mode: chatMode,
        content: last.content,
        images: last.images,
        stagedFileIds: stagedFileIds.length ? stagedFileIds : undefined,
        history
      }
    })
  }

  async function runWithMessages(messages: ChatMessageType[], chatMode: ChatMode) {
    await stopIfRunning()

    const title =
      messages.find((m) => m.role === "user")?.content.slice(0, 40) || "New chat"

    const nextSession: ChatSession = {
      ...session,
      mode: chatMode,
      title,
      messages,
      updatedAt: Date.now()
    }

    setSession(nextSession)
    setIsSending(true)
    await persistSession(nextSession)
    await dispatchChat(messages, chatMode, nextSession.id)
  }

  async function handleNewChat() {
    await stopIfRunning()
    const next = createSession(mode)
    setSession(next)
    setDraft("")
    setAttachments([])
    setPendingImages([])
    setIsSending(false)
    setHistoryOpen(false)
  }

  async function handleSelectSession(selected: ChatSession) {
    await stopIfRunning()
    setSession(selected)
    setMode(selected.mode)
    setHistoryOpen(false)
    setIsSending(false)
  }

  async function handleDeleteSession(sessionId: string) {
    await deleteSession(sessionId)
    const list = await refreshSessions()
    if (session.id === sessionId) {
      if (list.length > 0) {
        setSession(list[0])
        setMode(list[0].mode)
      } else {
        setSession(createSession(mode))
      }
    }
  }

  async function handleSend() {
    const stagedFileIds = attachments.map((f) => f.id)
    const content =
      draft.trim() ||
      (attachments.length
        ? "Fill the form using the attached file(s) as context."
        : "")
    if (!content && !pendingImages.length && !attachments.length) return
    if (isBusy) return

    const attachmentNote =
      attachments.length > 0
        ? `\n\n[Attached: ${attachments.map((f) => f.name).join(", ")}]`
        : ""

    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: "user",
      content: content + attachmentNote,
      images: pendingImages.length ? [...pendingImages] : undefined,
      createdAt: Date.now()
    }

    const isFirstMessage = session.messages.length === 0
    const nextSession: ChatSession = {
      ...session,
      mode,
      title: isFirstMessage ? content.slice(0, 40) || "New chat" : session.title,
      messages: [...session.messages, userMessage],
      updatedAt: Date.now()
    }

    setSession(nextSession)
    setDraft("")
    setEditorKey((k) => k + 1)
    setIsSending(true)
    setPendingImages([])
    setAttachments([])

    await persistSession(nextSession)
    await dispatchChat(nextSession.messages, mode, nextSession.id, stagedFileIds)
  }

  async function handleEditMessage(messageId: string, newContent: string) {
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return

    const updated = { ...session.messages[idx], content: newContent }
    const messages = [...session.messages.slice(0, idx), updated]
    await runWithMessages(messages, mode)
  }

  async function handleRetryMessage(messageId: string) {
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return

    const msg = session.messages[idx]
    let messages: ChatMessageType[]

    if (msg.role === "user") {
      messages = session.messages.slice(0, idx + 1)
    } else {
      let userIdx = idx - 1
      while (userIdx >= 0 && session.messages[userIdx].role !== "user") {
        userIdx--
      }
      if (userIdx < 0) return
      messages = session.messages.slice(0, userIdx + 1)
    }

    await runWithMessages(messages, mode)
  }

  async function stageFile(file: File): Promise<StagedFile> {
    const data = await readFileAsDataUrl(file)
    const staged: StagedFile = {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      data,
      createdAt: Date.now()
    }
    const existing = (await chrome.storage.local.get(STAGED_FILES_KEY))[STAGED_FILES_KEY] as
      | StagedFile[]
      | undefined
    await chrome.storage.local.set({
      [STAGED_FILES_KEY]: [...(existing ?? []), staged]
    })
    return staged
  }

  async function handleAttachFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    const staged = await Promise.all(files.map((file) => stageFile(file)))
    setAttachments((prev) => [...prev, ...staged])
  }

  async function handleRemoveAttachment(fileId: string) {
    setAttachments((prev) => prev.filter((f) => f.id !== fileId))
    const existing = (await chrome.storage.local.get(STAGED_FILES_KEY))[STAGED_FILES_KEY] as
      | StagedFile[]
      | undefined
    await chrome.storage.local.set({
      [STAGED_FILES_KEY]: (existing ?? []).filter((f) => f.id !== fileId)
    })
  }

  if (view === "settings") return <SettingsPanel onClose={() => setView("chat")} />
  if (view === "snippets") return <SnippetsPanel onClose={() => setView("chat")} />

  return (
    <div className="relative flex h-screen flex-col bg-background">
      <ChatHistorySidebar
        open={historyOpen}
        sessions={sessions}
        activeSessionId={session.id}
        onSelect={handleSelectSession}
        onDelete={handleDeleteSession}
        onClose={() => setHistoryOpen(false)}
      />

      <header className="border-b p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{session.title}</h1>
            <p className="text-xs text-muted-foreground">Local Ollama browser agent</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHistoryOpen(true)}
              title="Chat history">
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNewChat} title="New chat">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setView("snippets")} title="Snippets">
              <Tags className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setView("settings")} title="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ModeSwitcher
          mode={mode}
          onChange={(nextMode) => {
            setMode(nextMode)
            setSession((prev) => ({ ...prev, mode: nextMode }))
          }}
        />
      </header>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-3">
          {session.messages.length === 0 && (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {mode === "fill" &&
                "Describe what to fill, drop a .txt resume here for context, or use @snippets."}
              {mode === "agent" && "Describe a multi-step browser task. AgentMan will plan and execute it."}
              {mode === "assist" && "Ask AgentMan to read the page or an image and extract information."}
            </div>
          )}
          {session.messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              disabled={isBusy}
              onEdit={message.role === "user" ? handleEditMessage : undefined}
              onRetry={handleRetryMessage}
            />
          ))}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      <footer className="border-t p-3">
        {(attachments.length > 0 || pendingImages.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <span
                key={file.id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3 opacity-60" />
                {file.name}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background/80"
                  onClick={() => void handleRemoveAttachment(file.id)}
                  title="Remove">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {pendingImages.map((src, index) => (
              <img key={index} src={src} alt="screenshot" className="h-10 w-10 rounded object-cover" />
            ))}
          </div>
        )}

        <PromptEditor
          key={editorKey}
          placeholder={
            mode === "fill"
              ? "Fill this form with… (drop a .txt resume here)"
              : mode === "agent"
                ? "Automate a workflow…"
                : "Ask about this page…"
          }
          onChange={setDraft}
          onSubmit={handleSend}
          onFilesDropped={(files) => void handleAttachFiles(files)}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  if (e.target.files?.length) void handleAttachFiles(e.target.files)
                  e.currentTarget.value = ""
                }}
              />
              <Button variant="ghost" size="icon" asChild>
                <span>
                  <Paperclip className="h-4 w-4" />
                </span>
              </Button>
            </label>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                  if (tab?.id) {
                    chrome.tabs.sendMessage(tab.id, {
                      type: MessageType.START_SCREENSHOT_SELECTION
                    })
                  }
                })
              }>
              <ImageIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {mode === "agent" && agentState.status !== "idle" && (
              <>
                {agentState.status === "paused" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => chrome.runtime.sendMessage({ type: MessageType.AGENT_RESUME })}>
                    <Play className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => chrome.runtime.sendMessage({ type: MessageType.AGENT_PAUSE })}>
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => chrome.runtime.sendMessage({ type: MessageType.AGENT_STOP })}>
                  <Square className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant={isBusy ? "destructive" : "default"}
              onClick={() => void handleSendOrStop()}>
              {isBusy ? "Stop" : "Send"}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
