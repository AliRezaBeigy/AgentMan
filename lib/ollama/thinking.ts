/** Agent tool loops should disable model thinking — qwen3 burns the token budget before tool_calls. */
export const AGENT_CHAT_THINK = false

/** Cap generation when thinking is off; enough for one tool call JSON. */
export const AGENT_TOOL_NUM_PREDICT = 512

export function agentChatOptions(): Record<string, unknown> {
  return { num_predict: AGENT_TOOL_NUM_PREDICT }
}

/** Extra system suffix for Qwen-style models when thinking is disabled via API. */
export const AGENT_NO_THINK_SUFFIX =
  "\n/no_think\nDo not narrate or plan in prose. Emit exactly one tool call per turn — no explanation text."
