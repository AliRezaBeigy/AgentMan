import { getSnippets } from "~/lib/storage"

export async function expandSnippetsInText(text: string): Promise<string> {
  const snippets = await getSnippets()
  let expanded = text

  for (const snippet of snippets) {
    const pattern = new RegExp(`@${escapeRegExp(snippet.name)}\\b`, "g")
    expanded = expanded.replace(pattern, snippet.content)
  }

  return expanded
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
