import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { deleteSnippet, getSnippets, upsertSnippet } from "~/lib/storage"
import type { Snippet } from "~/lib/types"

export function SnippetsPanel({ onClose }: { onClose: () => void }) {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [name, setName] = useState("")
  const [content, setContent] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    void getSnippets().then(setSnippets)
  }, [])

  async function handleSave() {
    if (!name.trim() || !content.trim()) return
    const now = Date.now()
    const snippet: Snippet = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim(),
      content: content.trim(),
      createdAt: editingId ? snippets.find((s) => s.id === editingId)?.createdAt ?? now : now,
      updatedAt: now
    }
    const next = await upsertSnippet(snippet)
    setSnippets(next)
    setName("")
    setContent("")
    setEditingId(null)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Snippets</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Input placeholder="Snippet name (e.g. workContact)" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea placeholder="Snippet content" value={content} onChange={(e) => setContent(e.target.value)} />
        <Button onClick={handleSave}>{editingId ? "Update" : "Create"} snippet</Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {snippets.map((snippet) => (
          <div key={snippet.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">@{snippet.name}</p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(snippet.id)
                    setName(snippet.name)
                    setContent(snippet.content)
                  }}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => setSnippets(await deleteSnippet(snippet.id))}>
                  Delete
                </Button>
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{snippet.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
