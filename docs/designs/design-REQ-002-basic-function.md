# Technical Design: Natural Language Browser Control

Requirement: REQ-002
Date: 2026-03-06
Status: Proposed

## 1. Overview

Replace all stub functions with real implementations: DOM extraction, Claude API integration, simulated DOM actions, and
a side panel chat UI. The primary interaction surface is a chat panel injected into the right side of every page via
Shadow DOM. The popup becomes a simple toggle to show/hide this panel.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Web Page                                                       │
│                                                                 │
│  ┌──────────────────────────────────┐  ┌──────────────────────┐ │
│  │         Page Content             │  │  Side Panel (Shadow)  │ │
│  │                                  │  │                       │ │
│  │  dom-extractor.js scans here     │  │  Chat messages list   │ │
│  │  action-executor.js acts here    │  │  [User] click login   │ │
│  │                                  │  │  [AI] Extracting...   │ │
│  │                                  │  │  [AI] Clicked login   │ │
│  │                                  │  │                       │ │
│  │                                  │  │  ┌─────────┐ ┌────┐  │ │
│  │                                  │  │  │ Input   │ │Send│  │ │
│  │                                  │  │  └─────────┘ └────┘  │ │
│  └──────────────────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

Content Script ←──── messages ────→ Service Worker ────→ Claude API
  - dom-extractor.js                   - llm-client.js
  - action-executor.js                 - service-worker.js
  - side-panel.js
  - content-script.js (orchestrator)
```

**Message types:**

- `TOGGLE_PANEL` — SW → content (show/hide side panel, triggered by popup/icon click)
- `EXECUTE_COMMAND` — content → SW (user command from chat input)
- `EXTRACT_DOM` — SW → content (request element list)
- `COMMAND_STATUS` — SW → content (progress updates: extracting/thinking/executing)
- `COMMAND_RESULT` — SW → content (final action results)
- `PERFORM_ACTIONS` — SW → content (action array to execute)

**Flow:**

1. User types command in side panel chat → content script sends `EXECUTE_COMMAND` to SW
2. SW sends `EXTRACT_DOM` to content script → gets element list
3. SW sends `COMMAND_STATUS: "thinking"` → panel shows "Thinking..."
4. SW calls Claude API with system prompt + (command + elements)
5. SW parses response, sends `PERFORM_ACTIONS` to content script
6. Content script executes actions, returns results
7. SW sends `COMMAND_RESULT` → panel shows AI response with results

## 3. Detailed Design

### 3.1 Side Panel (`content/side-panel.js`, `content/side-panel.css`)

New files. Chat UI injected into the page via Shadow DOM.

**`createSidePanel()`**

- Create a `<div id="chromepilot-root">` appended to `document.body`
- Attach Shadow DOM (`attachShadow({ mode: 'closed' })`)
- Inject panel HTML + CSS inside shadow root (isolated from page styles)
- Panel structure:
  ```
  ┌─── Header ──────────────────────┐
  │ ChromePilot              [✕]    │
  ├─────────────────────────────────┤
  │                                 │
  │  Chat messages (scrollable)     │
  │                                 │
  │  [User] help me click login     │
  │  [AI]  ⏳ Extracting page...    │
  │  [AI]  ✅ Clicked "Login" btn   │
  │                                 │
  ├─────────────────────────────────┤
  │ [  Type a command...   ] [Send] │
  └─────────────────────────────────┘
  ```
- Width: 380px, fixed right, full height, z-index: 2147483647 (max)

**`togglePanel()`** — show/hide with slide animation

**`addMessage(role, content)`** — role: `"user"` | `"ai"` | `"status"`

- Creates message element using `document.createElement` (no innerHTML)
- Auto-scrolls to bottom

**`setStatusMessage(text)`** — update the latest AI status message (extracting/thinking/executing)

**Event handling:**

- Send button click / Enter key → read input, call `addMessage('user', text)`, send `EXECUTE_COMMAND` to background
- Close button → hide panel

### 3.2 DOM Extractor (`content/dom-extractor.js`)

New file. Scans the page (excluding the side panel shadow root).

**`extractInteractiveElements()`**

- Query: `a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [onclick]`
- Filter out: hidden elements, elements inside `#chromepilot-root`
- For each visible element:
    - Assign index `[1], [2], ...`
    - Capture: tag, textContent (truncated 80 chars), type, placeholder, href, id, className (50 chars), ariaLabel, role
- Store in `elementMap` (Map<index, Element>) for later lookup
- Cap at 200 elements
- Return formatted string:
  ```
  [1] <button id="login-btn" class="btn primary">Login</button>
  [2] <a href="/register">Register</a>
  [3] <input type="text" placeholder="Username">
  ```

**`getElementByIndex(index)`** — lookup from `elementMap`

### 3.3 Action Executor (`content/action-executor.js`)

New file. Real DOM actions.

**`showClickEffect(element)`**

- Get element center via `getBoundingClientRect()`
- Create ripple `<div>` at center point: blue (#2563eb) expanding circle, 0.4s fade-out
- Highlight element with blue outline for 0.5s
- Auto-cleanup after animation

**`simulateClick(element)`**

- `element.scrollIntoView({ block: 'center', behavior: 'smooth' })`
- Call `showClickEffect(element)` for visual feedback
- Dispatch: `mouseover` → `mousedown` → `mouseup` → `click` (all `MouseEvent`, `bubbles: true`, `cancelable: true`)

**`simulateType(element, text)`**

- `element.focus()`
- `element.value = ''` (clear)
- `element.value = text`
- Dispatch: `new Event('input', { bubbles: true })` + `new Event('change', { bubbles: true })`

**`simulateScroll(direction, amount)`**

- Map direction to x/y deltas
- `window.scrollBy({ top, left, behavior: 'smooth' })`

**`executeActions(actions)`**

- For each action sequentially:
    1. Get element via `getElementByIndex(action.index)` (skip for scroll)
    2. If element not found → return `{ success: false, message: "Element not found" }`
    3. Call simulate function
    4. `await new Promise(r => setTimeout(r, 300))` between actions
    5. Return `{ index, action, success, message }` per action
- Return results array

### 3.4 LLM Client (`background/llm-client.js`)

New file. **Multi-provider LLM client** as ES module. Supports any API via adapter pattern.

**LLM Config** (stored in `chrome.storage.sync`):

```js
{
    llmProvider: "openai",           // "anthropic" | "openai"
        llmBaseUrl
:
    "https://api.openai.com",  // base URL (no trailing slash)
        llmApiKey
:
    "sk-...",
        llmModel
:
    "gpt-4o"              // model identifier
}
```

Provider presets (shown in options UI for convenience):
| Preset | Provider | Base URL | Default Model |
|--------|----------|----------|---------------|
| Claude | anthropic | `https://api.anthropic.com` | `claude-sonnet-4-20250514` |
| OpenAI | openai | `https://api.openai.com` | `gpt-4o` |
| GitHub Copilot | openai | `https://models.github.ai/inference` | `openai/gpt-4o` |
| Ollama (local) | openai | `http://localhost:11434` | `llama3` |
| Custom | openai | user-defined | user-defined |

**`export async function callLLM(config, command, domContext)`**

- Routes to the correct adapter based on `config.llmProvider`
- Returns `{ actions: [...] }` or `{ actions: [], error: "..." }`

**`callAnthropic(config, command, domContext)`**

- Endpoint: `${config.llmBaseUrl}/v1/messages`
- Headers: `x-api-key: ${config.llmApiKey}`, `anthropic-version: 2023-06-01`
- Body: `{ model, max_tokens: 1024, system: SYSTEM_PROMPT, messages: [{ role: "user", content }] }`
- Extract text from `response.content[0].text`

**`callOpenAICompatible(config, command, domContext)`**

- Endpoint: `${config.llmBaseUrl}/v1/chat/completions`
- Headers: `Authorization: Bearer ${config.llmApiKey}` (omit if empty, for local models)
- Body: `{ model, max_tokens: 1024, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }] }`
- Extract text from `response.choices[0].message.content`

**Shared system prompt** (same for all providers):

```
You are a browser automation assistant. The user gives you a command and a list
of interactive elements on the current webpage. Each element has an index [N].

Respond with JSON only:
{
  "actions": [
    { "action": "click"|"type"|"scroll", "index": N, "value": "...", "direction": "up"|"down", "amount": 500, "description": "..." }
  ]
}

- "index" required for click/type
- "value" required for type
- "direction"+"amount" required for scroll
- If impossible, respond: {"actions": [], "error": "reason"}
- Do NOT think or reason. Respond ONLY with JSON.
```

**Robustness for thinking models (e.g. qwen3):**

- `max_tokens`: 4096 (not 1024, to allow room for output after reasoning)
- If OpenAI-compatible response has empty `content` but non-empty `reasoning` field, attempt to extract JSON from
  `reasoning`

**`export function parseActionResponse(responseText)`**

- Try `JSON.parse(responseText)`
- If wrapped in `` ```json ... ``` ``, extract inner content first
- Validate: must have `actions` array, each action must have `action` field
- Return parsed object or `{ actions: [], error: "Failed to parse response" }`

### 3.5 Service Worker Updates (`background/service-worker.js`)

Rewrite as ES module:

- `import { callLLM, parseActionResponse } from './llm-client.js'`
- Message handlers:
    - `EXECUTE_COMMAND`: full orchestration flow
        1. Get active tab
        2. Send `COMMAND_STATUS: "extracting"` to tab
        3. Send `EXTRACT_DOM` to tab → receive `domContext`
        4. Read LLM config from `chrome.storage.sync` (`llmProvider`, `llmBaseUrl`, `llmApiKey`, `llmModel`)
        5. If no config → send `COMMAND_RESULT` with error "Please configure LLM in options"
        6. Send `COMMAND_STATUS: "thinking"` to tab
        7. Call `callLLM(config, command, domContext)`
        8. Parse response
        9. Send `COMMAND_STATUS: "executing"` to tab
        10. Send `PERFORM_ACTIONS` to tab → receive results
        11. Send `COMMAND_RESULT` with results to tab
- `onInstalled`: init default storage with empty LLM config

### 3.6 Content Script Updates (`content/content-script.js`)

Orchestrator. Loads after dom-extractor, action-executor, side-panel.

Message handlers:

- `TOGGLE_PANEL` → `togglePanel()`
- `EXTRACT_DOM` → `extractInteractiveElements()`, respond with result
- `PERFORM_ACTIONS` → `executeActions(actions)`, respond with results
- `COMMAND_STATUS` → `setStatusMessage(status)` in side panel
- `COMMAND_RESULT` → `addMessage('ai', result)` in side panel

On send from chat input:

- `addMessage('user', command)`
- `sendMessageToBackground({ type: 'EXECUTE_COMMAND', command })`

### 3.7 Options Page Updates (`options/options.html`, `options.js`, `options.css`)

Expand existing options page to support multi-provider LLM configuration:

- **Provider preset dropdown**: Claude / OpenAI / Ollama (local) / Custom
    - Selecting a preset auto-fills Base URL and Model with defaults
    - Selecting "Custom" enables manual editing of all fields
- **Fields**:
    - Provider type: radio or select (`anthropic` | `openai`)
    - API Base URL: text input
    - API Key: password input (optional for local models)
    - Model: text input
- **Save**: writes all fields to `chrome.storage.sync` as `llmProvider`, `llmBaseUrl`, `llmApiKey`, `llmModel`
- **Test Connection**: button that sends a simple test prompt and shows success/failure
- Load saved config on page open

### 3.8 Popup Updates (`popup/popup.js`)

Simplified to a toggle:

- On popup open → send `TOGGLE_PANEL` message to active tab
- Immediately close popup (`window.close()`)
- Show fallback UI if content script not injected (e.g. chrome:// pages)

### 3.9 Manifest Updates

```json
{
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": [
        "<all_urls>"
      ],
      "js": [
        "lib/utils.js",
        "content/dom-extractor.js",
        "content/action-executor.js",
        "content/side-panel.js",
        "content/content-script.js"
      ],
      "css": [],
      "run_at": "document_idle"
    }
  ]
}
```

Note: `host_permissions: ["<all_urls>"]` is needed because the LLM API endpoint is user-configurable (could be any URL).
This is justified by the extension's core purpose.

Side panel CSS is injected inside Shadow DOM (not as a content script CSS file), so it won't leak into pages.

## 4. File Plan

| Action | Path                             | Description                                               |
|--------|----------------------------------|-----------------------------------------------------------|
| Create | src/content/side-panel.js        | Chat panel UI with Shadow DOM injection                   |
| Create | src/content/side-panel.css       | Panel styles (embedded in JS as string)                   |
| Create | src/content/dom-extractor.js     | DOM scanning and element indexing                         |
| Create | src/content/action-executor.js   | Real DOM action simulation                                |
| Create | src/background/llm-client.js     | Multi-provider LLM client (Anthropic + OpenAI-compatible) |
| Modify | src/content/content-script.js    | Orchestrator with all message handlers                    |
| Modify | src/background/service-worker.js | Full orchestration as ES module                           |
| Modify | src/popup/popup.js               | Simplified to panel toggle                                |
| Modify | src/popup/popup.html             | Minimal toggle UI                                         |
| Modify | src/popup/popup.css              | Minimal styling                                           |
| Modify | src/options/options.html         | Multi-provider LLM configuration UI                       |
| Modify | src/options/options.js           | Provider presets, save/load LLM config                    |
| Modify | src/options/options.css          | Updated styles for new fields                             |
| Modify | src/manifest.json                | Module type, host_permissions, new content scripts        |

## 5. Implementation Steps

1. **Update manifest.json** — module type, host_permissions, add new content script files
2. **Create side-panel.js + CSS** — Shadow DOM chat panel with toggle, message display, input handling
3. **Create dom-extractor.js** — page scanning, element indexing, formatted output
4. **Create action-executor.js** — simulateClick, simulateType, simulateScroll, executeActions
5. **Rewrite content-script.js** — message handlers, wire side panel to background — depends on 2-4
6. **Create llm-client.js** — multi-provider LLM client with adapters for Anthropic and OpenAI-compatible APIs
7. **Rewrite service-worker.js** — full orchestration flow as ES module — depends on 6
8. **Update options page** — provider presets, LLM config fields, test connection button
9. **Update popup** — simplify to toggle panel on active tab

## 6. Risk & Mitigation

| Risk                                             | Mitigation                                                      |
|--------------------------------------------------|-----------------------------------------------------------------|
| DOM extraction too large for LLM context         | Cap at 200 elements, truncate text                              |
| Element index stale after page mutation          | Extract + execute in quick succession; error if not found       |
| LLM returns malformed JSON                       | Robust parsing, strip markdown fences, fallback error           |
| LLM not configured                               | Check before calling, show error in chat with link to options   |
| Different LLM providers return different formats | Adapter pattern normalizes response; shared parseActionResponse |
| Local model (Ollama) CORS issues                 | Service worker fetch is not subject to CORS                     |
| Side panel conflicts with page styles            | Shadow DOM provides complete style isolation                    |
| Side panel overlaps page content                 | Fixed positioning, user can close/hide                          |
| Cross-origin iframe elements                     | Skip iframes, document scope only                               |
| Content script not on chrome:// pages            | Popup shows fallback message                                    |
| `<all_urls>` host permission is broad            | Justified: user-configurable API endpoint requires it           |

## 7. Acceptance Criteria

- [ ] Content script extracts interactive elements from any webpage
- [ ] LLM client supports both Anthropic and OpenAI-compatible APIs
- [ ] Options page allows configuring provider, base URL, API key, and model
- [ ] Service worker calls configured LLM with user command + DOM context
- [ ] LLM response is parsed into structured actions
- [ ] Click action simulates real mouse events on the target element
- [ ] Type action enters text into input fields with proper events
- [ ] Scroll action scrolls the page
- [ ] Multiple actions in sequence are supported
- [ ] Side panel appears on the right side of the page
- [ ] Side panel can be toggled (show/hide) via extension icon
- [ ] Chat UI shows user messages and AI responses
- [ ] Chat displays progress status during execution
- [ ] Panel uses Shadow DOM and does not affect page styles
- [ ] Errors (no API key, API failure, element not found) are handled gracefully
- [ ] No security violations (no eval, no innerHTML, no remote code)
