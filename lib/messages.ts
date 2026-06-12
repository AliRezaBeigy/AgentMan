import type {
  AgentState,
  ChatMode,
  PageContext,
  StagedFile
} from "~/lib/types"

export const MessageType = {
  PING: "AGENTMAN_PING",
  PONG: "AGENTMAN_PONG",
  GET_PAGE_CONTEXT: "AGENTMAN_GET_PAGE_CONTEXT",
  PAGE_CONTEXT: "AGENTMAN_PAGE_CONTEXT",
  CHAT_SEND: "AGENTMAN_CHAT_SEND",
  CHAT_STREAM: "AGENTMAN_CHAT_STREAM",
  CHAT_DONE: "AGENTMAN_CHAT_DONE",
  CHAT_ERROR: "AGENTMAN_CHAT_ERROR",
  AGENT_STATE: "AGENTMAN_AGENT_STATE",
  AGENT_PAUSE: "AGENTMAN_AGENT_PAUSE",
  AGENT_RESUME: "AGENTMAN_AGENT_RESUME",
  AGENT_STOP: "AGENTMAN_AGENT_STOP",
  FILL_EXECUTE: "AGENTMAN_FILL_EXECUTE",
  FILL_HIGHLIGHT: "AGENTMAN_FILL_HIGHLIGHT",
  FILL_APPLY: "AGENTMAN_FILL_APPLY",
  ENSURE_REPEATABLE_ROWS: "AGENTMAN_ENSURE_REPEATABLE_ROWS",
  CURSOR_MOVE: "AGENTMAN_CURSOR_MOVE",
  CURSOR_CAPTION: "AGENTMAN_CURSOR_CAPTION",
  SHOW_STOP_OVERLAY: "AGENTMAN_SHOW_STOP_OVERLAY",
  HIDE_STOP_OVERLAY: "AGENTMAN_HIDE_STOP_OVERLAY",
  CAPTURE_SCREENSHOT: "AGENTMAN_CAPTURE_SCREENSHOT",
  SCREENSHOT_CAPTURED: "AGENTMAN_SCREENSHOT_CAPTURED",
  START_SCREENSHOT_SELECTION: "AGENTMAN_START_SCREENSHOT_SELECTION",
  CANCEL_SCREENSHOT_SELECTION: "AGENTMAN_CANCEL_SCREENSHOT_SELECTION",
  HIDE_UI_FOR_SCREENSHOT: "AGENTMAN_HIDE_UI_FOR_SCREENSHOT",
  SHOW_UI_AFTER_SCREENSHOT: "AGENTMAN_SHOW_UI_AFTER_SCREENSHOT",
  OLLAMA_HEALTH: "AGENTMAN_OLLAMA_HEALTH",
  OLLAMA_MODELS: "AGENTMAN_OLLAMA_MODELS",
  OLLAMA_REBUILD_RULES: "AGENTMAN_OLLAMA_REBUILD_RULES"
} as const

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType]

export interface ChatHistoryEntry {
  role: "user" | "assistant"
  content: string
  images?: string[]
}

export interface ChatSendPayload {
  sessionId: string
  mode: ChatMode
  content: string
  images?: string[]
  stagedFileIds?: string[]
  history?: ChatHistoryEntry[]
}

export interface ChatStreamPayload {
  sessionId: string
  delta: string
}

export interface ChatDonePayload {
  sessionId: string
  content: string
}

export interface ChatErrorPayload {
  sessionId: string
  error: string
}

export interface FillApplyPayload {
  mappings: Array<{ selector: string; value: string | boolean }>
}

export interface CursorMovePayload {
  x: number
  y: number
}

export interface CursorCaptionPayload {
  text: string
}

export interface ScreenshotCapturedPayload {
  dataUrl: string
  region?: { x: number; y: number; width: number; height: number }
}

export type RuntimeMessage =
  | { type: typeof MessageType.PING }
  | { type: typeof MessageType.PONG }
  | { type: typeof MessageType.GET_PAGE_CONTEXT }
  | { type: typeof MessageType.PAGE_CONTEXT; payload: PageContext }
  | { type: typeof MessageType.CHAT_SEND; payload: ChatSendPayload }
  | { type: typeof MessageType.CHAT_STREAM; payload: ChatStreamPayload }
  | { type: typeof MessageType.CHAT_DONE; payload: ChatDonePayload }
  | { type: typeof MessageType.CHAT_ERROR; payload: ChatErrorPayload }
  | { type: typeof MessageType.AGENT_STATE; payload: AgentState }
  | { type: typeof MessageType.AGENT_PAUSE }
  | { type: typeof MessageType.AGENT_RESUME }
  | { type: typeof MessageType.AGENT_STOP }
  | { type: typeof MessageType.FILL_EXECUTE; payload: ChatSendPayload }
  | { type: typeof MessageType.FILL_HIGHLIGHT; payload: FillApplyPayload }
  | { type: typeof MessageType.FILL_APPLY; payload: FillApplyPayload }
  | {
      type: typeof MessageType.ENSURE_REPEATABLE_ROWS
      payload: { minRows: number; rowKeys?: string[] }
    }
  | { type: typeof MessageType.CURSOR_MOVE; payload: CursorMovePayload }
  | { type: typeof MessageType.CURSOR_CAPTION; payload: CursorCaptionPayload }
  | { type: typeof MessageType.SHOW_STOP_OVERLAY }
  | { type: typeof MessageType.HIDE_STOP_OVERLAY }
  | { type: typeof MessageType.CAPTURE_SCREENSHOT }
  | {
      type: typeof MessageType.SCREENSHOT_CAPTURED
      payload: ScreenshotCapturedPayload
    }
  | { type: typeof MessageType.START_SCREENSHOT_SELECTION }
  | { type: typeof MessageType.CANCEL_SCREENSHOT_SELECTION }
  | { type: typeof MessageType.HIDE_UI_FOR_SCREENSHOT }
  | { type: typeof MessageType.SHOW_UI_AFTER_SCREENSHOT }
  | { type: typeof MessageType.OLLAMA_HEALTH; payload: { ok: boolean; error?: string } }
  | { type: typeof MessageType.OLLAMA_MODELS; payload: { models: string[] } }

export interface StagedFilesStore {
  files: StagedFile[]
}
