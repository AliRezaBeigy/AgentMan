import { cn } from "~/lib/utils"
import type { ChatMode } from "~/lib/types"

const MODES: Array<{ id: ChatMode; label: string; color: string }> = [
  { id: "fill", label: "Fill", color: "data-[active=true]:text-[hsl(var(--mode-fill))]" },
  { id: "agent", label: "Agent", color: "data-[active=true]:text-[hsl(var(--mode-agent))]" },
  { id: "assist", label: "Assist", color: "data-[active=true]:text-[hsl(var(--mode-assist))]" }
]

export function ModeSwitcher({
  mode,
  onChange
}: {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          data-active={mode === item.id}
          className={cn(
            "rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors data-[active=true]:bg-background data-[active=true]:shadow-sm",
            item.color
          )}
          onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}
