# REQ-008 Technical Design

> Status: Completed
> Requirement: requirement.md
> Created: 2026-03-11
> Updated: 2026-03-11

## 1. Technology Stack

| Module             | Technology               | Rationale                                                                                                     |
|:-------------------|:-------------------------|:--------------------------------------------------------------------------------------------------------------|
| Preview Overlay    | Vanilla JS + DOM API     | Reuse existing `showClickEffect` / `renderOverlayItems` patterns from dom-extractor.js and action-executor.js |
| Confirm/Reject UI  | Vanilla JS + CSS         | Extend existing sidepanel.js / sidepanel.css                                                                  |
| Messaging          | chrome.runtime messaging | Existing message bus between service worker, content script, and side panel                                   |
| Settings           | chrome.storage.sync      | Existing storage pattern for `autoConfirm` toggle                                                             |
| State coordination | Promise-based wait       | Service worker uses a promise to pause the execution loop while waiting for user decision                     |

## 2. Design Principles

- High cohesion, low coupling: preview overlay logic is a standalone module (`action-previewer.js`), communicating via
  messages only
- Reuse first: borrow styling and rendering patterns from `showClickEffect()` and `renderOverlayItems()` — extract
  shared color/style constants if needed
- Testability: preview rendering and cleanup are pure functions operating on DOM, independently testable

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Service Worker                     │
│  handleExecuteCommand() loop                        │
│    ├─ EXTRACT_DOM ──────► Content Script             │
│    ├─ callLLM() ────────► LLM API                   │
│    ├─ [NEW] Check autoConfirm setting               │
│    ├─ [NEW] PREVIEW_ACTIONS ──► Content Script       │
│    ├─ [NEW] ACTION_PREVIEW ───► Side Panel           │
│    ├─ [NEW] Wait for CONFIRM / REJECT / CANCEL       │
│    ├─ REMOVE_PREVIEW ──► Content Script              │
│    └─ PERFORM_ACTIONS ──► Content Script             │
└─────────────────────────────────────────────────────┘

┌──────────────┐    ┌────────────────────┐
│  Side Panel  │    │  Content Script     │
│              │    │                     │
│ [NEW] Preview│    │ [NEW] action-       │
│   card UI    │◄──►│   previewer.js      │
│ Confirm/     │    │  - showPreview()    │
│ Re-analyze   │    │  - removePreview()  │
│ buttons      │    │                     │
└──────────────┘    └────────────────────┘
```

No new sub-layers needed — all changes fit within the existing `src/` structure:

- `src/content/action-previewer.js` — new content module
- `src/background/service-worker.js` — modified
- `src/sidepanel/sidepanel.js` + `sidepanel.html` + `sidepanel.css` — modified
- `src/options/options.html` + `options.js` — modified
- `src/content/content-script.js` — modified (add message handlers)
- `src/manifest.json` — modified (add action-previewer.js to content_scripts)

## 4. Module Design

### 4.1 Content Module: action-previewer.js

- **Responsibility**: Render and manage the preview overlay on the page (red borders + step-number labels on target
  elements).
- **Public interface**:
    - `showActionPreview(actions)` — Takes the LLM `actions[]` array. For each action with an `index`, highlights the
      element from `elementMap` with a red border and a step-number label showing `[N] ActionType`. Returns
      `{success, warnings[]}` where warnings list any elements not found.
    - `removeActionPreview()` — Removes all preview overlay elements and detaches scroll/resize listeners.
    - `isPreviewActive()` — Returns boolean.
- **Internal structure**:
    - Creates a container `<div id="chromepilot-preview-overlay">` (similar to debug overlay).
    - `renderPreviewItems(container, actions)` — iterates `actions`, for each with an `index`: gets element from
      `elementMap`, renders red border box + label.
    - Scroll/resize tracking via `requestAnimationFrame` (same pattern as debug overlay).
    - Label format: `[1] Click`, `[2] Type "hello"`, `[3] Scroll down`.
    - Scrolls the first target element into view.
- **Styling**:
    - Border: `3px solid #ef4444` (red, same as `showClickEffect`)
    - Background: `rgba(239, 68, 68, 0.10)`
    - Label:
      `background: #ef4444; color: #fff; font-size: 11px; font-weight: bold; padding: 1px 6px; border-radius: 3px;`
    - z-index: `2147483645` (below debug overlay `2147483647` and click effect `2147483646`)
- **Reuse notes**: Uses `elementMap` and `getElementByIndex()` from dom-extractor.js. Borrows rendering pattern from
  `renderOverlayItems()`.

### 4.2 Service Worker: Execution Loop Modification

- **Responsibility**: Orchestrate the preview→confirm→execute cycle within the existing `handleExecuteCommand()` loop.
- **Changes to `handleExecuteCommand()`**:
    1. After LLM returns `actions[]`, read `autoConfirm` from `chrome.storage.sync`.
    2. If `autoConfirm === true`: execute immediately (current behavior, no change).
    3. If `autoConfirm !== true` (default):
       a. Send `PREVIEW_ACTIONS` to content script → get back warnings.
       b. Send `ACTION_PREVIEW` to side panel with action summary + warnings.
       c. Set `previewPending = true` and create a `Promise` that resolves when the user responds.
       d. Wait for user message: `CONFIRM_ACTIONS`, `REJECT_ACTIONS`, or `CANCEL_TASK`.
       e. On `CONFIRM_ACTIONS`: send `REMOVE_PREVIEW` to content script, then proceed to execute actions.
       f. On `REJECT_ACTIONS`: send `REMOVE_PREVIEW` to content script, increment `rejectionCount`, append rejected plan
       to `conversationHistory` with `{rejected: true}` marker, re-extract DOM, re-call LLM, loop back to preview.
       g. On `CANCEL_TASK`: send `REMOVE_PREVIEW` to content script, abort task.
    4. `rejectionCount` resets to 0 at the start of each step. After 3 rejections, send error to side panel.
- **Public interface** (new message types):
    - Incoming: `CONFIRM_ACTIONS`, `REJECT_ACTIONS` (from side panel)
    - Outgoing: `PREVIEW_ACTIONS` (to content script), `ACTION_PREVIEW` (to side panel), `REMOVE_PREVIEW` (to content
      script)
- **Promise-based wait pattern**:
  ```
  let previewResolve = null;
  // In handleExecuteCommand:
  const decision = await new Promise(resolve => { previewResolve = resolve; });
  // In message handler:
  case 'CONFIRM_ACTIONS': previewResolve('confirm'); break;
  case 'REJECT_ACTIONS': previewResolve('reject'); break;
  ```

### 4.3 Side Panel: Preview Card UI

- **Responsibility**: Display planned actions list with Confirm/Re-analyze buttons.
- **Changes to `sidepanel.js`**:
    1. New message handler for `ACTION_PREVIEW`: receives `{actions[], warnings[], step, maxSteps}`.
    2. `showPreviewCard(actions, warnings, step, maxSteps)` — renders a card in `messagesEl`:
        - Header: "Step N — Planned Actions" (or just "Planned Actions" for single-step).
        - Action list: numbered items, each showing action type + description. Non-element actions (scroll, navigate)
          shown as text. Missing-element warnings shown in orange.
        - Two buttons: "▶ Confirm" (green) and "🔄 Re-analyze" (orange).
    3. `removePreviewCard()` — removes the card from DOM.
    4. Button handlers send `CONFIRM_ACTIONS` or `REJECT_ACTIONS` to service worker.
    5. `handleStop()` already sends `CANCEL_TASK` — this works as-is for cancelling during preview.
- **Changes to `sidepanel.html`**: No structural changes needed. Preview card is dynamically created.
- **Changes to `sidepanel.css`**: Add styles for `.preview-card`, `.preview-action-item`, `.preview-btn-confirm`,
  `.preview-btn-reject`.
- **State management**: A new boolean `previewing` flag. When `previewing === true`, the Stop button remains visible. On
  confirm/reject/cancel, `previewing = false` and card is removed.

### 4.4 Options Page: Auto-Confirm Toggle

- **Responsibility**: Allow users to enable/disable the preview-confirm flow.
- **Changes to `options.html`**: Add a checkbox field after "Max Elements":
  ```html
  <div class="field">
      <label class="toggle-label">
          <input type="checkbox" id="autoConfirmInput">
          <span>Auto-confirm actions (skip preview)</span>
      </label>
  </div>
  ```
- **Changes to `options.js`**:
    1. `loadSettings()`: read `autoConfirm` from storage, set checkbox state.
    2. `saveSettings()`: include `autoConfirm: autoConfirmInput.checked` in the config object.
- **Storage key**: `autoConfirm` (boolean, default `false`).

### 4.5 Content Script: Message Router Update

- **Responsibility**: Route new message types to action-previewer.js.
- **Changes to `content-script.js`**: Add cases:
  ```
  case 'PREVIEW_ACTIONS': showActionPreview(message.actions) → sendResponse
  case 'REMOVE_PREVIEW': removeActionPreview() → sendResponse
  ```
- **Changes to `manifest.json`**: Add `content/action-previewer.js` to the `js` array (before `content-script.js`).

### 4.6 LLM Client: Rejection Context in History

- **Responsibility**: Include rejection markers in conversation history so LLM knows the user rejected a plan.
- **Changes to `llm-client.js` `buildMessages()`**:
    - When a history entry has `rejected: true`, format the result message as:
      `"User REJECTED the planned actions. Reason: plan not acceptable. Please suggest different actions."`
    - This naturally fits the existing `history[i].results` pattern — just use a different result text.
- **No changes to `callLLM()` signature** — the history format is extended, not replaced.

## 5. Data Model

No persistent data model changes. All state is transient (in-memory during task execution).

**Transient state in service worker:**

| Variable         | Type               | Scope  | Description                                     |
|:-----------------|:-------------------|:-------|:------------------------------------------------|
| `previewResolve` | `Function \| null` | module | Resolves the promise when user confirms/rejects |
| `previewPending` | `boolean`          | module | Whether we're waiting for user decision         |

**Transient state in side panel:**

| Variable     | Type      | Scope  | Description                               |
|:-------------|:----------|:-------|:------------------------------------------|
| `previewing` | `boolean` | module | Whether a preview card is currently shown |

**Storage (chrome.storage.sync):**

| Key           | Type      | Default | Description                          |
|:--------------|:----------|:--------|:-------------------------------------|
| `autoConfirm` | `boolean` | `false` | Skip preview and execute immediately |

## 6. API Design

### Message Protocol (new messages)

| Direction    | Type                     | Payload                                   | Description            |
|:-------------|:-------------------------|:------------------------------------------|:-----------------------|
| SW → Content | `PREVIEW_ACTIONS`        | `{actions[]}`                             | Show preview overlay   |
| Content → SW | response                 | `{success, warnings[]}`                   | Preview result         |
| SW → Content | `REMOVE_PREVIEW`         | —                                         | Remove preview overlay |
| SW → Panel   | `ACTION_PREVIEW`         | `{actions[], warnings[], step, maxSteps}` | Show preview card      |
| Panel → SW   | `CONFIRM_ACTIONS`        | —                                         | User confirmed         |
| Panel → SW   | `REJECT_ACTIONS`         | —                                         | User rejected          |
| SW → Panel   | `PREVIEW_REJECTED_LIMIT` | `{count}`                                 | Max rejections reached |

## 7. Key Flows

### 7.1 Normal Preview-Confirm Flow

```
1. Service Worker: LLM returns actions[]
2. Service Worker: read autoConfirm setting
3. [autoConfirm=true] → skip to step 9
4. Service Worker → Content: PREVIEW_ACTIONS(actions)
5. Content: render red borders + labels → return warnings
6. Service Worker → Panel: ACTION_PREVIEW(actions, warnings)
7. Panel: show preview card with Confirm / Re-analyze
8. User clicks Confirm → Panel → SW: CONFIRM_ACTIONS
9. Service Worker → Content: REMOVE_PREVIEW
10. Service Worker → Content: PERFORM_ACTIONS(actions)
11. Normal execution continues
```

### 7.2 Rejection-Reanalysis Flow

```
1. User clicks Re-analyze → Panel → SW: REJECT_ACTIONS
2. Service Worker → Content: REMOVE_PREVIEW
3. Service Worker: rejectionCount++
4. [rejectionCount > 3] → SW → Panel: PREVIEW_REJECTED_LIMIT → stop
5. Service Worker: append {rejected:true, actions} to conversationHistory
6. Service Worker → Content: EXTRACT_DOM (re-extract)
7. Service Worker → LLM: callLLM with updated history
8. LLM returns new actions[]
9. → back to Preview-Confirm Flow step 4
```

(See `tech-sequence.puml` for detailed diagram)

## 8. Shared Modules & Reuse Strategy

| Shared Resource                                         | Used By                                 | How                                                                      |
|:--------------------------------------------------------|:----------------------------------------|:-------------------------------------------------------------------------|
| `elementMap` + `getElementByIndex()` (dom-extractor.js) | action-previewer.js, action-executor.js | Both modules look up elements by index from the same map                 |
| Red border style (`#ef4444`, 3px solid)                 | action-previewer.js, action-executor.js | Same visual style for consistency; previewer uses slightly lower z-index |
| `renderOverlayItems()` pattern (dom-extractor.js)       | action-previewer.js                     | Same fixed-position + RAF scroll tracking pattern                        |
| `formatActionForDisplay()` (sidepanel.js)               | Preview card rendering                  | Reuse for action description text in preview card                        |
| `conversationHistory` (service-worker.js)               | Rejection context                       | Extended with `rejected: true` marker, no new data structure             |
| `chrome.storage.sync`                                   | options.js, service-worker.js           | `autoConfirm` key read by service worker at each step                    |

## 9. Risks & Notes

1. **Service worker suspension**: The `Promise`-based wait for user decision could be interrupted if the service worker
   is suspended by Chrome. Mitigation: Chrome keeps the SW alive while there are pending messages and active ports. The
   side panel keeps a connection alive. If the SW does restart, the task state is lost — same as current behavior for
   any running task.

2. **elementMap staleness**: Between DOM extraction and preview rendering, the page may change. If elements move or
   disappear, the preview may highlight wrong positions. Mitigation: preview calls `getElementByIndex()` which returns
   the live DOM reference, and scroll/resize tracking updates positions via RAF.

3. **Preview + Debug overlay coexistence**: Both use fixed-position overlays with high z-index. Mitigation: preview uses
   z-index `2147483645` (below debug's `2147483647`), so debug overlay always renders on top. Visual overlap is
   acceptable — both serve diagnostic purposes.

4. **Max rejection limit (3)**: Hardcoded for simplicity. Could be made configurable later if needed.

## 10. Change Log

| Version | Date       | Changes         | Affected Scope | Reason |
|:--------|:-----------|:----------------|:---------------|:-------|
| v1      | 2026-03-11 | Initial version | ALL            | -      |
