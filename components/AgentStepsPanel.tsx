import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { cn } from "~/lib/utils"
import type { AgentActivityStep } from "~/lib/types"

const scrollPanelClass =
  "agentman-scroll max-h-56 overflow-y-auto overflow-x-hidden scroll-smooth rounded-md border border-border/40 bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"

function isThinkingStep(step: AgentActivityStep): boolean {
  return step.id.startsWith("think-")
}

function StepScrollPanel({
  children,
  className,
  autoScroll
}: {
  children: ReactNode
  className?: string
  autoScroll?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoScroll || !ref.current) return
    ref.current.scrollTop = ref.current.scrollHeight
  }, [autoScroll, children])

  return (
    <div ref={ref} className={cn(scrollPanelClass, className)}>
      {children}
    </div>
  )
}

function StepIcon({ status }: { status: AgentActivityStep["status"] }) {
  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
  }
  if (status === "error") {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
  }
  return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
}

export function AgentStepsPanel({
  steps,
  isStreaming
}: {
  steps: AgentActivityStep[]
  isStreaming?: boolean
}) {
  const hasRunning = steps.some((step) => step.status === "running")
  const [expanded, setExpanded] = useState(hasRunning || Boolean(isStreaming))

  useEffect(() => {
    if (hasRunning || isStreaming) setExpanded(true)
  }, [hasRunning, isStreaming])

  const doneCount = useMemo(
    () => steps.filter((step) => step.status === "done").length,
    [steps]
  )

  if (!steps.length) return null

  return (
    <div className="mb-1.5 w-full rounded-lg border border-border/70 bg-background/50 text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left font-medium text-foreground"
        onClick={() => setExpanded((open) => !open)}>
        <span className="flex items-center gap-1.5">
          {hasRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          Agent activity
          <span className="font-normal text-muted-foreground">
            ({doneCount}/{steps.length})
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <ol className="space-y-0.5 border-t border-border/60 px-1.5 py-1.5">
          {steps.map((step) => {
            const thinking = isThinkingStep(step)
            const showThinkingBody = thinking && Boolean(step.detail)

            return (
              <li key={step.id}>
                {thinking ? (
                  <div className="rounded-md px-1.5 py-1">
                    <div className="flex items-start gap-1.5">
                      <StepIcon status={step.status} />
                      <span
                        className={cn(
                          "min-w-0 flex-1 leading-snug",
                          step.status === "running" && "text-foreground",
                          step.status === "done" && "text-muted-foreground"
                        )}>
                        {step.label}
                      </span>
                    </div>
                    {showThinkingBody && (
                      <StepScrollPanel autoScroll={step.status === "running"} className="mt-1">
                        <div className="whitespace-pre-wrap break-words">
                          {step.detail}
                          {step.status === "running" && (
                            <span className="ml-0.5 inline-block animate-pulse text-primary/80">▍</span>
                          )}
                        </div>
                      </StepScrollPanel>
                    )}
                  </div>
                ) : (
                  <details
                    className="group rounded-md px-1.5 py-1 hover:bg-muted/40"
                    open={step.status === "running" || Boolean(step.detail)}>
                    <summary className="flex cursor-pointer list-none items-start gap-1.5 marker:content-none">
                      <StepIcon status={step.status} />
                      <span
                        className={cn(
                          "min-w-0 flex-1 leading-snug",
                          step.status === "running" && "text-foreground",
                          step.status === "done" && "text-muted-foreground",
                          step.status === "error" && "text-destructive"
                        )}>
                        {step.label}
                      </span>
                      {step.detail && (
                        <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      )}
                    </summary>
                    {step.detail && (
                      <StepScrollPanel className="mt-1 max-h-32 font-mono">
                        <pre className="whitespace-pre-wrap break-words">{step.detail}</pre>
                      </StepScrollPanel>
                    )}
                  </details>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
