import { useEffect, useState } from "react"

import { Textarea } from "~/components/ui/textarea"
import { getSnippets } from "~/lib/storage"
import { cn } from "~/lib/utils"

export function PromptEditor({
  placeholder,
  onChange,
  onSubmit,
  onFilesDropped
}: {
  placeholder: string
  onChange: (text: string) => void
  onSubmit: () => void
  onFilesDropped?: (files: FileList) => void
}) {
  const [value, setValue] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    onChange(value)
  }, [value, onChange])

  async function handleChange(next: string) {
    setValue(next)
    const match = next.match(/@([a-zA-Z0-9_]*)$/)
    if (!match) {
      setSuggestions([])
      return
    }
    const query = match[1].toLowerCase()
    const snippets = await getSnippets()
    setSuggestions(
      snippets
        .map((s) => s.name)
        .filter((name) => name.toLowerCase().includes(query))
        .slice(0, 6)
    )
  }

  function applySuggestion(name: string) {
    setValue((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${name} `))
    setSuggestions([])
  }

  return (
    <div
      className={cn(
        "relative rounded-md transition-colors",
        dragOver && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) {
          onFilesDropped?.(e.dataTransfer.files)
        }
      }}>
      <Textarea
        value={value}
        placeholder={placeholder}
        className="min-h-[80px] resize-none"
        onChange={(e) => void handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-full rounded-md border bg-card p-1 shadow-md">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
              onClick={() => applySuggestion(name)}>
              @{name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
