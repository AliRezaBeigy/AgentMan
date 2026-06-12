# AgentMan

AgentMan is a Chrome extension that provides Fill, Agent, and Assist modes for form filling and browser automation, powered entirely by a local [Ollama](https://ollama.com) instance.

## Prerequisites

- Google Chrome
- [Ollama](https://ollama.com/download) running locally on port `11434`
- [Yarn](https://yarnpkg.com/)

### Ollama CORS / 403 fix

Ollama blocks `chrome-extension://` origins. AgentMan (like [ollama-ui](https://github.com/ollama-ui/ollama-ui)) rewrites the `Origin` header to your Ollama host and rebuilds that rule when you change the host in Settings. **Reload the extension** after installing.

If issues persist, start Ollama with:

```bash
# Windows PowerShell
$env:OLLAMA_ORIGINS="*"; ollama serve

# macOS / Linux
OLLAMA_ORIGINS=* ollama serve
```

### Recommended models

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5:14b
ollama pull llama3.2-vision
```

- **Fill mode:** `qwen2.5:7b` or `llama3.1:8b`
- **Agent mode:** `qwen2.5:14b` (tool calling)
- **Assist mode:** `llama3.2-vision` or `llava`

## Development

```bash
yarn install
yarn dev
```

Load the extension from `build/chrome-mv3-dev` in `chrome://extensions` (Developer mode → Load unpacked).

## Tests

Unit tests run without Ollama. Integration tests call your local server at `http://localhost:11434`.

```bash
yarn install
yarn test              # all tests
yarn test:unit         # fill parsing only
yarn test:dom          # expense report Add row (happy-dom, no Ollama)
yarn test:integration  # Ollama health + fill pipeline + 8-item expense rows
```

Optional env vars:

- `OLLAMA_HOST` — default `http://localhost:11434`
- `OLLAMA_TEST_MODEL` — e.g. `qwen2.5:7b` (otherwise first installed model is used)

Start Ollama and pull a model before integration tests:

```bash
ollama serve
ollama pull qwen2.5:7b
```

## Production build

```bash
yarn build
```

Load from `build/chrome-mv3-prod`.

## Usage

1. Start Ollama: `ollama serve`
2. Open the AgentMan side panel (extension icon or `Alt+Shift+A`)
3. Configure models in **Settings**
4. Choose a mode:
   - **Fill** — map prompts/snippets to form fields on the current page
   - **Agent** — multi-step workflows with visible browser actions
   - **Assist** — extract and summarize page or image content

## Privacy

All inference runs against your local Ollama server. Snippets, settings, and chat history are stored locally in the browser. No cloud account is required.

## Permissions

AgentMan uses the Chrome `debugger` permission for browser automation (CDP). Chrome shows an infobar while debugging is attached.
