import type { AppSettings, Snippet } from "~/lib/types"
import { DEFAULT_AGENT_ITERATION_LIMIT } from "~/lib/agent-iterations"
import { DEFAULT_SETTINGS } from "~/lib/types"

const SETTINGS_KEY = "agentman_settings"
const SNIPPETS_KEY = "agentman_snippets"

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY)
  const saved = result[SETTINGS_KEY] as AppSettings | undefined
  const merged = { ...DEFAULT_SETTINGS, ...saved }
  if (
    saved?.maxAgentIterations != null &&
    saved.maxAgentIterations > 0 &&
    saved.maxAgentIterations < DEFAULT_AGENT_ITERATION_LIMIT
  ) {
    merged.maxAgentIterations = DEFAULT_SETTINGS.maxAgentIterations
  }
  return merged
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = { ...current, ...settings }
  await chrome.storage.local.set({ [SETTINGS_KEY]: next })
  return next
}

export async function getSnippets(): Promise<Snippet[]> {
  const result = await chrome.storage.local.get(SNIPPETS_KEY)
  return (result[SNIPPETS_KEY] as Snippet[] | undefined) ?? []
}

export async function saveSnippets(snippets: Snippet[]): Promise<void> {
  await chrome.storage.local.set({ [SNIPPETS_KEY]: snippets })
}

export async function upsertSnippet(snippet: Snippet): Promise<Snippet[]> {
  const snippets = await getSnippets()
  const index = snippets.findIndex((s) => s.id === snippet.id)
  if (index >= 0) {
    snippets[index] = snippet
  } else {
    snippets.push(snippet)
  }
  await saveSnippets(snippets)
  return snippets
}

export async function deleteSnippet(id: string): Promise<Snippet[]> {
  const snippets = (await getSnippets()).filter((s) => s.id !== id)
  await saveSnippets(snippets)
  return snippets
}
