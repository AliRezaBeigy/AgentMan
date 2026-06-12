export class OllamaToolsNotSupportedError extends Error {
  readonly modelHint: string

  constructor(message: string) {
    super(message)
    this.name = "OllamaToolsNotSupportedError"
    this.modelHint = message
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
