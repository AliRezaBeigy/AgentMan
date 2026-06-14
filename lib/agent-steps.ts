import type { AgentActivityStep } from "~/lib/types"

export function formatAgentToolStepLabel(
  toolName: string,
  args: Record<string, unknown>
): string {
  if (toolName === "fill") {
    const selector = String(args.selector ?? "field")
    const value = String(args.value ?? "")
    const preview = value.length > 40 ? `${value.slice(0, 40)}…` : value
    return preview ? `Fill ${selector} → "${preview}"` : `Fill ${selector}`
  }
  if (toolName === "fill_fields") return "Fill multiple fields"
  if (toolName === "click") {
    if (args.section) return `Open ${String(args.section)}`
    const selector = String(args.selector ?? "element")
    return `Click ${selector.length > 48 ? `${selector.slice(0, 48)}…` : selector}`
  }
  if (toolName === "done") return "Finish task"
  if (toolName === "navigate") return `Navigate to ${String(args.url ?? "…")}`
  if (toolName === "get_page_content") return "Read page context"
  if (toolName === "take_screenshot") return "Capture screenshot"
  return toolName
}

export function thinkingStepId(iteration: number): string {
  return `think-${iteration}`
}

export function toolStepId(iteration: number, toolIndex: number): string {
  return `tool-${iteration}-${toolIndex}`
}

export function buildThinkingStep(iteration: number): AgentActivityStep {
  return {
    id: thinkingStepId(iteration),
    label: `Step ${iteration}: Choosing action…`,
    status: "running"
  }
}

export function buildToolRunningStep(
  iteration: number,
  toolIndex: number,
  toolName: string,
  args: Record<string, unknown>
): AgentActivityStep {
  return {
    id: toolStepId(iteration, toolIndex),
    label: formatAgentToolStepLabel(toolName, args),
    status: "running",
    detail: JSON.stringify(args, null, 2)
  }
}
