import type { OllamaTool } from "~/lib/ollama/client"

export const AGENT_TOOLS: OllamaTool[] = [
  {
    type: "function",
    function: {
      name: "click",
      description: "Click an element by CSS selector or viewport coordinates",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector" },
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "type",
      description: "Type text into the focused or specified element",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          selector: { type: "string" }
        },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fill",
      description:
        "Set ONE form field. Call once per field with a single selector and value — never batch multiple fields. Use field aliases from the system prompt (e.g. work:title). After all required fields for the current entry are filled, the extension auto-saves.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Field alias or CSS selector" },
          value: { type: "string", description: "Value from the attachment" }
        },
        required: ["selector", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate the active tab to a URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate_back",
      description: "Go back in browser history",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "browser_tabs",
      description: "List, switch, or create browser tabs",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "switch", "create"] },
          tabId: { type: "number" },
          url: { type: "string" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "upload_file",
      description: "Upload a file to a file input element",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          fileId: { type: "string", description: "Staged file id from chat attachment" },
          path: { type: "string", description: "Absolute local file path" }
        },
        required: ["selector"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Capture a screenshot of the active tab viewport",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_page_content",
      description: "Get structured page context including form fields",
      parameters: { type: "object", properties: {} }
    }
  }
]
