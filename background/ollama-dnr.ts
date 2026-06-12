const OLLAMA_ORIGIN_RULE_ID = 1

function parseOllamaHost(host: string): { hostname: string; origin: string } {
  const normalized = host.trim().replace(/\/$/, "") || "http://localhost:11434"
  const url = normalized.includes("://")
    ? new URL(normalized)
    : new URL(`http://${normalized}`)
  return { hostname: url.hostname, origin: url.origin }
}

/**
 * ollama-ui sets Origin to the Ollama server origin (not chrome-extension://).
 * Ollama allows requests whose Origin matches an allowed host.
 * @see https://github.com/ollama-ui/ollama-ui/blob/main/api.js
 */
export async function registerOllamaHeaderRules(host: string): Promise<void> {
  const { hostname, origin } = parseOllamaHost(host)

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_ORIGIN_RULE_ID],
      addRules: [
        {
          id: OLLAMA_ORIGIN_RULE_ID,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
              {
                header: "origin",
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: origin
              }
            ]
          },
          condition: {
            requestDomains: [hostname],
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST]
          }
        }
      ]
    })
  } catch (error) {
    console.warn("AgentMan: failed to register Ollama DNR rules", error)
  }
}
