export type ChatMode = "fill" | "agent" | "assist"

export type MessageRole = "user" | "assistant" | "system" | "tool"

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  images?: string[]
  createdAt: number
  isStreaming?: boolean
}

export interface ChatSession {
  id: string
  title: string
  mode: ChatMode
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface Snippet {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  ollamaHost: string
  fillModel: string
  agentModel: string
  assistModel: string
  theme: "light" | "dark"
  maxAgentIterations: number
}

export interface FormFieldDescriptor {
  selector: string
  tag: string
  type: string
  name?: string
  id?: string
  label?: string
  placeholder?: string
  value?: string
  options?: Array<{ value: string; label: string }>
  required?: boolean
  isFileInput?: boolean
  accept?: string
  isPdfField?: boolean
  /** Custom UI widget (Radix combobox, segmented buttons, etc.) */
  widget?: "combobox" | "button-group"
  triggerSelector?: string
}

export interface ViewportInfo {
  width: number
  height: number
  scrollX: number
  scrollY: number
}

export interface RepeatableSectionDescriptor {
  addButtonSelector: string
  addButtonLabel: string
  sectionSelector: string
  rowCount: number
}

export interface PageContext {
  url: string
  title: string
  textSummary: string
  fields: FormFieldDescriptor[]
  repeatableSections: RepeatableSectionDescriptor[]
  viewport: ViewportInfo
}

export interface StagedFile {
  id: string
  name: string
  mimeType: string
  data: string
  createdAt: number
}

export interface OllamaToolCall {
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export interface AgentState {
  status: "idle" | "running" | "paused" | "stopped"
  iteration: number
  currentAction?: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaHost: "http://localhost:11434",
  fillModel: "",
  agentModel: "",
  assistModel: "",
  theme: "dark",
  maxAgentIterations: 30
}
