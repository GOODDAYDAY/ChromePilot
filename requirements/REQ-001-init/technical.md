# Technical Design: Basic Chrome Extension Skeleton

Requirement: REQ-001
Date: 2026-03-06
Status: Proposed

## 1. Overview

Create the complete MV3 Chrome extension skeleton for ChromePilot. This establishes the project's file structure,
inter-component messaging, and basic UI. The approach follows CLAUDE.md conventions exactly — vanilla JS, no build
tools, MV3 service worker, and strict security rules.

## 2. Architecture

```
┌─────────────┐    message     ┌──────────────────┐    tab message    ┌─────────────────┐
│  Popup UI   │ ──────────────→│  Service Worker   │ ────────────────→│  Content Script  │
│  popup.*    │                │  service-worker.js│                  │  content-script.js│
│             │ ←──────────────│                   │ ←────────────────│                  │
└─────────────┘    response    └──────────────────┘    response       └─────────────────┘
                                       │
                                       │ fetch (future)
                                       ▼
                                 ┌──────────┐
                                 │ LLM API  │
                                 │ (stub)   │
                                 └──────────┘

┌──────────────┐
│ Options Page │ ←──→ chrome.storage.sync (API key)
│ options.*    │
└──────────────┘

┌──────────────┐
│  lib/utils.js│ ← shared helpers used by all components
└──────────────┘
```

**Message flow:**

1. User types command in popup, clicks submit
2. `popup.js` sends `{ type: "EXECUTE_COMMAND", command: "..." }` via `chrome.runtime.sendMessage`
3. `service-worker.js` receives, (future: calls LLM to parse), forwards `{ type: "PERFORM_ACTION", action: {...} }` to
   active tab via `chrome.tabs.sendMessage`
4. `content-script.js` receives, logs action, returns `{ success: true, message: "..." }`
5. Response bubbles back to popup for display

## 3. Detailed Design

### 3.1 manifest.json

- `manifest_version`: 3
- `name`: "ChromePilot"
- `version`: "0.1.0"
- `permissions`: `["activeTab", "storage", "scripting"]`
- `background.service_worker`: `"background/service-worker.js"`
- `content_scripts`: match `<all_urls>`, js `content/content-script.js`
- `action.default_popup`: `"popup/popup.html"`
- `options_page`: `"options/options.html"`
- `icons`: 16, 48, 128

### 3.2 Service Worker (`background/service-worker.js`)

- `chrome.runtime.onInstalled`: initialize default storage (`{ apiKey: "", commandHistory: [] }`)
- `chrome.runtime.onMessage` listener:
    - `EXECUTE_COMMAND` → get active tab → send `PERFORM_ACTION` to content script → return response to popup
- `parseLLMCommand(command)` — stub that returns `{ type: "log", value: command }` (placeholder for future LLM
  integration)

### 3.3 Content Script (`content/content-script.js`)

- `chrome.runtime.onMessage` listener:
    - `PERFORM_ACTION` → switch on `action.type`:
        - `click`: log "Would click: ..."
        - `type`: log "Would type: ..."
        - `scroll`: log "Would scroll: ..."
        - `log` (default): log the value
    - Returns `{ success: true, message: "Action logged: ..." }`

### 3.4 Popup (`popup/popup.html`, `popup.js`, `popup.css`)

- **HTML**: input field, submit button, result div
- **JS**:
    - On submit: read input, send `EXECUTE_COMMAND` message, display response in result div
    - Use `textContent` for all DOM updates
- **CSS**: clean, minimal styling. Dark/light neutral theme.

### 3.5 Options Page (`options/options.html`, `options.js`, `options.css`)

- **HTML**: API key input, save button, status message
- **JS**:
    - On load: read `apiKey` from `chrome.storage.sync`, populate field
    - On save: write to `chrome.storage.sync`, show confirmation
- **CSS**: consistent with popup styling

### 3.6 Shared Utilities (`lib/utils.js`)

- `sendMessageToBackground(message)` — wraps `chrome.runtime.sendMessage` with async/await and error handling
- `sendMessageToTab(tabId, message)` — wraps `chrome.tabs.sendMessage`
- `getStorage(keys)` / `setStorage(data)` — wraps `chrome.storage.local` get/set
- `getSyncStorage(keys)` / `setSyncStorage(data)` — wraps `chrome.storage.sync` get/set

### 3.7 Icons

- Generate minimal placeholder PNGs (solid colored square with "CP" text) at 16x16, 48x48, 128x128
- Since we can't generate images in code, create simple SVG-based data or use single-color canvas — or provide 1x1
  placeholder PNGs that Chrome will accept

## 4. File Plan

| Action | Path                             | Description                                       |
|--------|----------------------------------|---------------------------------------------------|
| Create | src/manifest.json                | MV3 manifest with all entry points                |
| Create | src/background/service-worker.js | Event-driven service worker with message routing  |
| Create | src/content/content-script.js    | DOM action executor (stubs) with message listener |
| Create | src/popup/popup.html             | Command input UI                                  |
| Create | src/popup/popup.js               | Popup logic — send commands, display results      |
| Create | src/popup/popup.css              | Popup styling                                     |
| Create | src/options/options.html         | API key configuration UI                          |
| Create | src/options/options.js           | Options logic — save/load API key                 |
| Create | src/options/options.css          | Options styling                                   |
| Create | src/lib/utils.js                 | Shared messaging and storage helpers              |
| Create | icons/icon-16.png                | 16px placeholder icon                             |
| Create | icons/icon-48.png                | 48px placeholder icon                             |
| Create | icons/icon-128.png               | 128px placeholder icon                            |

## 5. Implementation Steps

1. **Create manifest.json**: src/manifest.json — foundation, all other files reference this
2. **Create shared utilities**: src/lib/utils.js — other modules depend on these helpers
3. **Create service worker**: src/background/service-worker.js — depends on utils.js pattern (but loaded independently)
4. **Create content script**: src/content/content-script.js — message listener for actions
5. **Create popup**: src/popup/popup.html, popup.js, popup.css — UI and command sending
6. **Create options page**: src/options/options.html, options.js, options.css — API key management
7. **Create placeholder icons**: icons/icon-*.png — minimal valid PNGs

## 6. Risk & Mitigation

| Risk                                             | Mitigation                                                            |
|--------------------------------------------------|-----------------------------------------------------------------------|
| Content script not injected on already-open tabs | Document that user must reload target page after installing extension |
| Service worker terminated mid-message            | All state in chrome.storage; message handlers are stateless           |
| Placeholder icons rejected by Chrome             | Use valid minimal PNGs (even 1-color) that meet size requirements     |

## 7. Acceptance Criteria

- [ ] Extension loads in Chrome via "Load Unpacked" without errors
- [ ] Popup opens with input field and submit button
- [ ] Typing a command and clicking submit sends it through the full message chain (popup → background → content script)
- [ ] Content script logs the received command to the page's console
- [ ] Result is displayed back in the popup
- [ ] Options page saves and loads API key from chrome.storage.sync
- [ ] No innerHTML, eval(), or other security violations
- [ ] All chrome API calls use async/await with error handling
- [ ] Service worker is stateless — no in-memory state relied upon
