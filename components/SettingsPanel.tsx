import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { MessageType } from "~/lib/messages"
import { getSettings, saveSettings } from "~/lib/storage"
import type { AppSettings } from "~/lib/types"

const MODEL_HINTS = {
  fill: "Recommended: qwen2.5:7b, llama3.1:8b",
  agent: "Recommended: qwen2.5:14b (strong tool calling)",
  assist: "Recommended: llama3.2-vision, llava"
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const current = await getSettings()
      setSettings(current)
      document.documentElement.classList.toggle("dark", current.theme === "dark")
      await refreshOllama(current.ollamaHost)
    })()
  }, [])

  async function refreshOllama(host: string) {
    const saved = await saveSettings({ ollamaHost: host })
    setSettings(saved)
    await chrome.runtime.sendMessage({
      type: MessageType.OLLAMA_REBUILD_RULES,
      payload: { host: saved.ollamaHost }
    })
    const healthRes = await chrome.runtime.sendMessage({ type: MessageType.OLLAMA_HEALTH })
    setHealth(healthRes.payload)
    if (healthRes.payload.ok) {
      const modelsRes = await chrome.runtime.sendMessage({ type: MessageType.OLLAMA_MODELS })
      setModels(modelsRes.payload.models)
    } else {
      setModels([])
    }
  }

  if (!settings) return null

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Ollama host</label>
        <div className="flex gap-2">
          <Input
            value={settings.ollamaHost}
            onChange={(e) => setSettings({ ...settings, ollamaHost: e.target.value })}
          />
          <Button variant="outline" onClick={() => refreshOllama(settings.ollamaHost)}>
            Test
          </Button>
        </div>
        {health && (
          <p className={health.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {health.ok
              ? "Connected to Ollama"
              : `Cannot reach Ollama. Start with: ollama serve — ${health.error}`}
          </p>
        )}
      </div>

      {(["fillModel", "agentModel", "assistModel"] as const).map((key) => {
        const label = key.replace("Model", "")
        return (
          <div key={key} className="space-y-1">
            <label className="text-sm font-medium capitalize">{label} model</label>
            <Select
              value={settings[key]}
              onValueChange={async (value) => {
                const next = await saveSettings({ [key]: value })
                setSettings(next)
              }}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MODEL_HINTS[label as keyof typeof MODEL_HINTS]}
            </p>
          </div>
        )
      })}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Dark mode</p>
          <p className="text-xs text-muted-foreground">Use dark theme in the side panel</p>
        </div>
        <Switch
          checked={settings.theme === "dark"}
          onCheckedChange={async (checked) => {
            const next = await saveSettings({ theme: checked ? "dark" : "light" })
            setSettings(next)
            document.documentElement.classList.toggle("dark", checked)
          }}
        />
      </div>
    </div>
  )
}
