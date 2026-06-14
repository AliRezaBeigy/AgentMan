# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [v1.0.0]

Initial public release.

### Feat
- Chrome side panel with Fill, Agent, and Assist modes powered by local Ollama
- Form field detection, compact field aliases, and streaming fill with typing animation
- Multi-step Add-entry workflow (work experience, education, etc.) with auto-save
- CV and file attachments, snippets, chat history, and dark mode
- Agent activity log with tool steps; pause, resume, and stop controls
- Ollama Origin header rewrite for extension CORS compatibility

### Fix
- Session-scoped fill progress (avoids premature auto-save on stale DOM values)
- Varbi budget/staff responsibility selects treat `0` as a valid value
- CDP session re-attach on debugger detach errors
- Reject premature Save/Submit clicks; extension auto-saves when all fields are filled

### Chore
- Trim manifest permissions for Chrome Web Store (`contextMenus`, `notifications`, `activeTab` removed)
- README, store listing copy, and demo screenshot
