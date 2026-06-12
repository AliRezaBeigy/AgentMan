export class OllamaToolsNotSupportedError extends Error {
  readonly modelHint: string

  constructor(message: string) {
    super(message)
    this.name = "OllamaToolsNotSupportedError"
    this.modelHint = message
  }
}

/** Stream stopped early — e.g. model started a root-level JSON action array. */
export class ChatAbortedError extends Error {
  readonly partialContent: string

  constructor(partialContent: string, message = "Chat generation aborted") {
    super(message)
    this.name = "ChatAbortedError"
    this.partialContent = partialContent
  }
}

export function isToolsNotSupportedMessage(message: string): boolean {
  return /does not support tools/i.test(message)
}

export function extractOllamaErrorBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const error = (body as { error?: unknown }).error
  return typeof error === "string" ? error : null
}
