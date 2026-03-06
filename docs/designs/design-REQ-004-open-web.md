# Technical Design: Navigation, Global Panel & Multi-step Operations

Requirement: REQ-004
Date: 2026-03-07
Status: Final

## 1. Overview

This design replaces the current Shadow DOM side panel with Chrome's native `chrome.sidePanel` API, adds `navigate` and
`read` action types, implements a multi-step execution loop with configurable settings, and adds token limit protection.

## 2. Architecture

### Flow

```
User → Side Panel (standalone HTML) → service worker → LLM
                                         ↓
                                    content script → execute actions (sequential, with configurable delay)
                                         ↓
                                    (if not done) → re-extract DOM → LLM again → loop
                                         ↓
                                    Side Panel ← results/status/summary
```

### Key Changes from Previous Architecture

- **Side panel**: Chrome native `sidePanel` API replaces Shadow DOM injection — persists across tabs
- **Communication**: panel ↔ service worker via `chrome.runtime`; service worker ↔ content script via `chrome.tabs`
- **Multi-step loop**: service worker runs extract→LLM→execute loop until `done: true` or max steps
- **Navigate action**: service worker handles directly via `chrome.tabs.create`/`chrome.tabs.update`
- **Read action**: content script extracts element text, returned in results
- **Token protection**: DOM capped at 150 elements, context truncated at 12000 chars, history limited to 3 rounds

## 3. Detailed Design

### 3.1 Side Panel (`src/sidepanel/`)

Standalone HTML page registered in manifest under `"side_panel"`.

**Header settings (all persisted to `chrome.storage.sync`):**

- "当前页跳转" checkbox (default off) — navigate in current tab vs new tab
- Max steps dropdown: 5 / 10 / 20 / 50 / Unlimited (default 10)
- Action delay dropdown: 0s / 0.1s / 0.2s / 0.5s / 1s / 2s / 3s / 5s (default 0.5s)
- Clear history button

**Input area:**

- Send button (visible when idle)
- Stop button (visible when running, sends `CANCEL_TASK`)

**Messages from service worker:**

- `COMMAND_STATUS` → status bubble
- `STEP_COMPLETE` → step result with indicator "Step N / Max" (or "Step N" if unlimited)
- `COMMAND_RESULT` → final result (error / results array / summary text)

### 3.2 Manifest Changes

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "scripting",
    "sidePanel"
  ],
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "action": {
    "default_icon": {
      ...
    }
  }
}
```

- Removed `default_popup` — icon click triggers `chrome.sidePanel.open()`
- Removed `side-panel.js` from content_scripts
- Deleted `src/popup/` and `src/content/side-panel.js`

### 3.3 Service Worker

**Action handling:**

- `navigate`: reads `openInCurrentTab` setting, uses `chrome.tabs.update` or `chrome.tabs.create`, waits for page load
  via `chrome.tabs.onUpdated`, re-injects content scripts via `chrome.scripting.executeScript`
- Other actions: sent to content script one at a time with configurable delay between each

**Multi-step loop:**

```
for step in 1..maxSteps (or unlimited):
    check cancellation flag
    extract DOM via content script
    call LLM with command + DOM + recent history (last 3 rounds)
    if done or no actions → send COMMAND_RESULT with summary → break
    execute actions sequentially with actionDelay between each
    push to conversationHistory
    send STEP_COMPLETE to panel
```

**Settings read from `chrome.storage.sync`:** `maxSteps` (default 10, 0=unlimited), `actionDelay` (default 500ms),
`openInCurrentTab` (default false)

### 3.4 LLM Client

**Actions in system prompt:** click, type, scroll, navigate, read

**Key prompt rules:**

1. Batch multiple actions into single response (e.g. 10 clicks = 1 step)
2. Only set `done: false` when page needs to change before continuing
3. For lookup/translate/search tasks: stop when answer is visible, put answer in `summary`
4. `summary` is shown directly to user — include actual results

**Token protection:**

- `truncateContext()`: caps DOM context at 12000 chars
- History limited to last 3 entries, compacted (only action/index/url/desc)

**Conversation history format:**

- First message: command + DOM (or just command if history exists)
- History entries: compact assistant actions + user results
- Final message: "Continue the task" + current DOM

### 3.5 Content Script

Handles: `PING`, `EXTRACT_DOM`, `PERFORM_ACTIONS`

**`read` action in executor:** extracts `textContent` from element by index, truncated to 500 chars

### 3.6 DOM Extractor

- `MAX_ELEMENTS`: 150 (reduced from 500)
- `MAX_TEXT_LENGTH`: 60 (reduced from 100)
- `MAX_CLASS_LENGTH`: 0 (class attribute skipped entirely to save tokens)

## 4. File Plan

| Action | Path                             | Description                                                    |
|--------|----------------------------------|----------------------------------------------------------------|
| Create | src/sidepanel/sidepanel.html     | Side panel page with settings controls                         |
| Create | src/sidepanel/sidepanel.js       | Panel logic, messaging, settings persistence                   |
| Create | src/sidepanel/sidepanel.css      | Panel styles (migrated from REQ-003)                           |
| Modify | src/manifest.json                | sidePanel permission, side_panel entry, remove popup           |
| Modify | src/background/service-worker.js | Multi-step loop, navigate handler, configurable delay/steps    |
| Modify | src/background/llm-client.js     | Updated prompt, read action, token truncation, history support |
| Modify | src/content/content-script.js    | Remove panel handlers, add PING                                |
| Modify | src/content/action-executor.js   | Add read action                                                |
| Modify | src/content/dom-extractor.js     | Reduce limits for token savings                                |
| Delete | src/content/side-panel.js        | Replaced by native side panel                                  |
| Delete | src/popup/*                      | Icon click now opens side panel directly                       |

## 5. Risk & Mitigation

| Risk                                 | Mitigation                                                                       |
|--------------------------------------|----------------------------------------------------------------------------------|
| Chrome < 114 no sidePanel API        | Document minimum version; Chrome 114 released 2023, widespread adoption          |
| Multi-step infinite loop             | Configurable max steps + Stop button + cancellation flag                         |
| Token limit exceeded                 | DOM cap 150 elements, context truncated 12000 chars, history capped 3 rounds     |
| Content script lost after navigation | `ensureContentScripts()` re-injects via `chrome.scripting.executeScript`         |
| LLM omits `done` field               | Default to `done: true` (backwards compatible)                                   |
| LLM doesn't batch actions            | System prompt strongly emphasizes batching; each LLM round = 1 step not 1 action |

## 6. Acceptance Criteria

- [x] Navigate to URLs via natural language (new tab or current tab)
- [x] Settings persisted: open-in-current-tab, max steps, action delay
- [x] Global side panel persists across tab switches
- [x] Multi-step execution with configurable limits and Stop button
- [x] Sequential action execution with configurable delay
- [x] Read action extracts page content
- [x] Smart summary for lookup/translate/search tasks
- [x] Token limit protection (DOM cap, context truncation, history limit)
