/** Stored as maxAgentIterations when there is no cap. */
export const UNLIMITED_AGENT_ITERATIONS = 0

export const DEFAULT_AGENT_ITERATION_LIMIT = 120

export function isUnlimitedAgentIterations(limit: number): boolean {
  return limit <= UNLIMITED_AGENT_ITERATIONS
}

export function formatAgentIterationLimit(limit: number): string {
  return isUnlimitedAgentIterations(limit) ? "Unlimited" : String(limit)
}

export function clampAgentIterationLimit(value: number): number {
  if (isUnlimitedAgentIterations(value)) return UNLIMITED_AGENT_ITERATIONS
  return Math.max(1, Math.min(Math.floor(value), 100_000))
}
