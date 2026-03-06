# REQ-001: Basic Chrome Extension Skeleton

## Summary

Build a complete, working Chrome extension (MV3) skeleton that establishes the project's foundational structure. The
extension should be loadable in Chrome and have all core components wired together with basic functionality.

## Scope

### Must Have

1. **manifest.json** — MV3 manifest with proper configuration, permissions (`activeTab`, `storage`), and all entry
   points registered
2. **Service Worker** (`background/service-worker.js`)
    - Event-driven, stateless
    - `onInstalled` handler to initialize default storage values
    - Message listener to relay commands from popup to content script
    - Stub function for future LLM API call (placeholder, no real endpoint)
3. **Content Script** (`content/content-script.js`)
    - Injected into web pages
    - Message listener that receives action commands and logs them
    - Basic DOM action stubs (click, type, scroll) — log-only for now
4. **Popup UI** (`popup/popup.html`, `popup.js`, `popup.css`)
    - Text input field for natural language commands
    - Submit button
    - Status/result display area
    - Sends command to background service worker on submit
5. **Options Page** (`options/options.html`, `options.js`, `options.css`)
    - API key input field with save/load using `chrome.storage.sync`
    - Save confirmation feedback
6. **Shared Utilities** (`lib/utils.js`)
    - Message sending helper (wraps `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`)
    - Storage helper (wraps `chrome.storage` get/set with async/await)
7. **Icons** — Simple placeholder PNG icons at 16, 48, 128 px

### End-to-End Flow

```
User types command in popup
  → popup.js sends message to service worker
    → service worker receives, (future: calls LLM), forwards to content script
      → content script receives action, logs it to console
        → sends result back to service worker
          → service worker relays result to popup
            → popup displays result
```

### Out of Scope

- Actual LLM API integration (future REQ)
- Real DOM manipulation logic (future REQ)
- Complex UI styling or animations
- Build tooling (Vite, bundler)

## Acceptance Criteria

- [ ] Extension loads in Chrome via "Load Unpacked" without errors
- [ ] Popup opens with input field and submit button
- [ ] Typing a command and clicking submit sends it through the full message chain (popup → background → content script)
- [ ] Content script logs the received command to the page's console
- [ ] Result is displayed back in the popup
- [ ] Options page saves and loads API key from `chrome.storage.sync`
- [ ] No `innerHTML`, `eval()`, or other security violations per CLAUDE.md
- [ ] All chrome API calls use async/await with error handling
- [ ] Service worker is stateless — no in-memory state relied upon
