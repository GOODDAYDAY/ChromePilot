# Technical Design: Debug Overlay, True Stop & Input Auto-resize

Requirement: REQ-005
Date: 2026-03-07
Status: Proposed

## 1. Overview

Four improvements to ChromePilot's usability:

- **A. Debug Overlay**: Visualize detected DOM elements with numbered labels matching LLM indexes
- **B. True Stop**: Abort in-flight fetch requests and running repeat loops immediately
- **C. DOM Extractor Noise Reduction**: Filter out decorative/duplicate elements to maximize 150-element budget
- **D. Page Context Awareness**: Include current URL/title in LLM context, auto-navigate for cross-site tasks
- **E. Auto-resize Input**: Replace `<input>` with auto-growing `<textarea>`

### Approach Evaluation

**Approach 1: Minimal — direct implementation in existing files**

- Debug overlay logic in dom-extractor.js, cancellation via AbortController in llm-client.js, textarea swap in sidepanel
- Pros: Fewest changes, no new files, simple
- Cons: dom-extractor.js grows with overlay rendering concerns

**Approach 2: Separated concerns — new overlay module**

- New `debug-overlay.js` for rendering, dom-extractor.js only provides data
- Pros: Clean separation
- Cons: Extra file, extra script injection overhead

**Selected: Approach 1** — the overlay logic is small (~40 lines) and tightly coupled to `elementMap`. A separate file
isn't warranted.

## 2. Architecture

### Data Flow

```
A. Debug Overlay:
   SidePanel [Show Elements btn] → SW → content script (TOGGLE_DEBUG_OVERLAY)
   → dom-extractor: extractInteractiveElements() + render overlays on each element
   → response: {active: true/false}

B. True Stop:
   SidePanel [Stop btn] → SW (CANCEL_TASK):
   1. Set taskCancelled = true (existing)
   2. abortController.abort() → kills in-flight fetch
   3. Forward CANCEL_ACTIONS to content script → sets flag, breaks repeat loop
   4. Send COMMAND_RESULT to panel → restore UI

C. Auto-resize:
   <textarea> oninput → adjust height based on scrollHeight
   Enter → send, Shift+Enter → newline
```

## 3. Detailed Design

### 3.1 Debug Overlay (dom-extractor.js + content-script.js + sidepanel)

**dom-extractor.js** — add two functions:

```javascript
function showDebugOverlay() {
    removeDebugOverlay(); // clear existing
    extractInteractiveElements(); // refresh elementMap

    const container = document.createElement('div');
    container.id = 'chromepilot-debug-overlay';
    container.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';

    for (const [index, el] of elementMap) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Border highlight
        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border:2px solid rgba(37,99,235,0.6);background:rgba(37,99,235,0.08);pointer-events:none;`;
        container.appendChild(box);

        // Number label
        const label = document.createElement('div');
        label.style.cssText = `position:fixed;left:${rect.left}px;top:${Math.max(0, rect.top - 18)}px;background:#2563eb;color:#fff;font-size:11px;font-weight:bold;padding:1px 4px;border-radius:3px;pointer-events:none;font-family:monospace;line-height:14px;`;
        label.textContent = `[${index}]`;
        container.appendChild(label);
    }

    document.body.appendChild(container);
}

function removeDebugOverlay() {
    const existing = document.getElementById('chromepilot-debug-overlay');
    if (existing) existing.remove();
}

function isDebugOverlayActive() {
    return !!document.getElementById('chromepilot-debug-overlay');
}
```

**content-script.js** — add message handler:

```javascript
case
'TOGGLE_DEBUG_OVERLAY'
:
if (isDebugOverlayActive()) {
    removeDebugOverlay();
    sendResponse({success: true, active: false});
} else {
    showDebugOverlay();
    sendResponse({success: true, active: true});
}
break;
```

**sidepanel.html** — add button in header-actions:

```html

<button class="header-btn" id="showElementsBtn" title="Show detected elements">&#128065;</button>
```

**sidepanel.js** — toggle handler:

```javascript
showElementsBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) return;
    try {
        const response = await chrome.tabs.sendMessage(tab.id, {type: 'TOGGLE_DEBUG_OVERLAY'});
        showElementsBtn.classList.toggle('active', response?.active);
    } catch (e) {
        console.error('[ChromePilot] Failed to toggle debug overlay:', e);
    }
});
```

Note: `sidepanel.js` needs `tabs` permission or can use `chrome.runtime.sendMessage` to route through service worker.
Since we have `activeTab`, we'll route through the service worker to avoid needing extra permissions.

**Revised approach**: SidePanel sends `{type: 'TOGGLE_DEBUG_OVERLAY'}` to service worker → service worker forwards to
active tab via `chrome.tabs.sendMessage`.

### 3.2 True Stop (service-worker.js + llm-client.js + action-executor.js + content-script.js)

**service-worker.js**:

- Add `let currentAbortController = null;`
- In `handleExecuteCommand()`: create `currentAbortController = new AbortController()` at start, pass
  `currentAbortController.signal` to `callLLM()`
- In `CANCEL_TASK` handler:
    1. `taskCancelled = true` (existing)
    2. `currentAbortController?.abort()` — kills in-flight fetch
    3. Forward `CANCEL_ACTIONS` to active tab content script — stops repeat loops
    4. Send `COMMAND_RESULT` with cancellation message to panel
    5. Call `setRunning(false)` via panel message

**llm-client.js**:

- `callLLM()` accepts optional `signal` parameter
- Pass `signal` to both `callAnthropic()` and `callOpenAICompatible()` fetch calls
- `fetch(url, { ..., signal })` — native AbortController support

**action-executor.js**:

- Add module-level `let actionCancelled = false;`
- In `repeat` loop: check `actionCancelled` before each iteration
- Add function `cancelActions()` that sets `actionCancelled = true`
- Reset `actionCancelled = false` at start of `executeActions()`

**content-script.js**:

- Add `CANCEL_ACTIONS` message handler:
  ```javascript
  case 'CANCEL_ACTIONS':
      cancelActions();
      removeDebugOverlay(); // clean up overlays too
      sendResponse({success: true});
      break;
  ```

**service-worker.js** `CANCEL_TASK` handler (revised):

```javascript
if (message.type === 'CANCEL_TASK') {
    taskCancelled = true;
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    // Cancel running actions in content script
    getActiveTabId().then(tabId => {
        chrome.tabs.sendMessage(tabId, {type: 'CANCEL_ACTIONS'}).catch(() => {
        });
    }).catch(() => {
    });
    sendResponse({success: true});
    return false;
}
```

**Error handling**: When `AbortController.abort()` is called, `fetch()` throws `AbortError`. In
`handleExecuteCommand()`, catch this specifically and treat as cancellation (don't show error to user, just the "Task
cancelled" message).

### 3.3 Debug Overlay Scroll Tracking (dom-extractor.js)

Overlay uses `position: fixed` with `getBoundingClientRect()` — positions are correct only at render time. On scroll,
all labels drift out of place.

**Solution**: Store `elementMap` references, add scroll/resize listener that recalculates positions:

```javascript
let debugScrollHandler = null;

function updateDebugOverlayPositions() {
    const container = document.getElementById('chromepilot-debug-overlay');
    if (!container) return;
    // Clear and re-render from elementMap (positions change on scroll)
    container.textContent = '';
    for (const [index, el] of elementMap) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // ... re-create box + label divs with updated rect positions
    }
}
```

- In `showDebugOverlay()`: register `scroll` + `resize` listeners calling `updateDebugOverlayPositions`
- In `removeDebugOverlay()`: remove the listeners
- Throttle with `requestAnimationFrame` to avoid jank

### 3.4 Configurable MAX_ELEMENTS (options + dom-extractor + service-worker)

- **Options page**: Add "Max Elements" number input (default 150, min 50, max 500)
- **Storage**: `chrome.storage.sync.set({maxElements: N})`
- **dom-extractor.js**: Read `maxElements` from message payload instead of using hardcoded constant
- **service-worker.js**: Read `maxElements` from storage, pass to content script via `EXTRACT_DOM` message
- **Content script**: Forward `maxElements` to `extractInteractiveElements(maxElements)`

### 3.5 DOM Extractor Noise Reduction (dom-extractor.js)

**Problem**: On complex pages (e.g. Habitica with 4-column layout), 150-element budget was exhausted by the first column
alone. Root cause: massive noise from decorative SVGs, empty child divs/spans inside interactive parents, and overly
broad `[tabindex]` selector.

**Three-layer filtering** added to `extractInteractiveElements()`:

1. **`isNoiseElement(el)`** — skip elements with zero informational value:
    - SVG elements: always skip (icons, never meaningful to LLM)
    - div/span with no text AND no `aria-label` AND no `id` AND no `role` → skip

2. **`hasInteractiveAncestor(el, primarySet)`** — smart parent-child dedup:
    - If an element's ancestor is already in the interactive set, skip the child
    - **Exception**: native interactive elements (`a[href]`, `button`, `input`, `textarea`, `select`) are NEVER
      removed —
      they are always meaningful
    - Habitica: `<div role="button">` → inner empty `<div>` → inner `<svg>` = 3→1 (noise removed)
    - GitHub: container div → child `<button>Star</button>`, `<button>Fork</button>` = all kept (real buttons preserved)

3. **Selector tightening**:
    - `[tabindex]` → `[tabindex="0"]` — only explicitly focusable elements, not `tabindex="-1"` (programmatic focus)
    - Removed `svg` from Phase 2 `querySelectorAll` scan

**Processing pipeline**:

```
Phase 1: querySelectorAll(INTERACTIVE_SELECTORS) → selectorElements
Phase 2: cursor:pointer scan (div, span, li, label, img, td) → add to selectorElements
Phase 3: filter noise (isNoiseElement) → primarySet
Phase 4: dedup (hasInteractiveAncestor) → dedupedSet
Phase 5: sort by DOM order, limit to MAX_ELEMENTS, check visibility
```

**Result**: ~60-70% noise reduction. 150 slots now cover full-width pages that previously only captured one column.

### 3.4 Copy DOM Button (sidepanel + service-worker)

- New 📋 button in header, routes `COPY_DOM` message through service worker to content script
- Calls `extractInteractiveElements()` and returns the text, panel copies to clipboard via
  `navigator.clipboard.writeText()`
- Brief visual feedback: icon changes to ✅ for 1.5s after copy

### 3.6 Page Context Awareness (dom-extractor.js + llm-client.js)

**dom-extractor.js**: `extractInteractiveElements()` output now includes a header with current page info:

```
Page: ChromePilot - GitHub
URL: https://github.com/GOODDAYDAY/ChromePilot

[1] <a href="/">...</a>
...
```

**llm-client.js**: System prompt updated with rule:
> "The context includes the current page URL. If the user's task requires a DIFFERENT website, you MUST use the navigate
> action first, then set done: false so you can interact with the new page in the next step."

This solves the problem where users say "go to GitHub and star X" but the LLM doesn't realize it needs to navigate
first.

### 3.7 Auto-resize Input (sidepanel.html + sidepanel.css + sidepanel.js)

**sidepanel.html** — replace `<input>` with `<textarea>`:

```html
<textarea autocomplete="off" class="chat-input" id="chatInput" placeholder="Type a command..." rows="1"></textarea>
```

**sidepanel.css** — update `.chat-input`:

```css
.chat-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
    font-family: inherit;
    background: #ffffff;
    resize: none;
    min-height: 36px;
    max-height: 120px;
    overflow-y: auto;
    line-height: 1.4;
}
```

**sidepanel.js** — auto-resize logic + keydown change:

```javascript
function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

inputEl.addEventListener('input', autoResize);

// Replace keydown handler:
inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
    // Shift+Enter: default textarea newline behavior
});
```

After send, reset height: `inputEl.style.height = 'auto';`

## 4. File Plan

| Action | Path                               | Description                                                                                                                                                                           |
|--------|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Modify | `src/content/dom-extractor.js`     | Add debug overlay with scroll tracking, noise filter, smart parent-child dedup (native elements exempt), configurable maxElements, page URL/title header                              |
| Modify | `src/content/action-executor.js`   | Add `actionCancelled` flag, `cancelActions()` function, check flag in repeat loop                                                                                                     |
| Modify | `src/content/content-script.js`    | Add `TOGGLE_DEBUG_OVERLAY` and `CANCEL_ACTIONS` message handlers                                                                                                                      |
| Modify | `src/background/service-worker.js` | Add `AbortController`, pass signal to `callLLM`, forward `CANCEL_ACTIONS` on stop, route `TOGGLE_DEBUG_OVERLAY` and `COPY_DOM`, read maxElements from storage and pass to EXTRACT_DOM |
| Modify | `src/options/options.html`         | Add Max Elements input field                                                                                                                                                          |
| Modify | `src/options/options.js`           | Load/save `maxElements` setting                                                                                                                                                       |
| Modify | `src/background/llm-client.js`     | Accept `signal` param, pass to `fetch()` calls, add cross-site navigate rule to system prompt                                                                                         |
| Modify | `src/sidepanel/sidepanel.html`     | Add Show Elements button, Copy DOM button, change `<input>` to `<textarea>`                                                                                                           |
| Modify | `src/sidepanel/sidepanel.js`       | Add overlay toggle handler, Copy DOM handler, auto-resize logic, update keydown for Shift+Enter                                                                                       |
| Modify | `src/sidepanel/sidepanel.css`      | Update `.chat-input` for textarea, add `.header-btn.active` style                                                                                                                     |

## 5. Implementation Steps

1. **Debug Overlay — content side**: Add overlay functions to `dom-extractor.js`, add `TOGGLE_DEBUG_OVERLAY` handler to
   `content-script.js`
2. **Debug Overlay — panel side**: Add Show Elements button to `sidepanel.html`, add toggle handler to `sidepanel.js`,
   add routing to `service-worker.js`, add active button style to CSS
3. **True Stop — LLM abort**: Add `signal` parameter to `callLLM`, `callAnthropic`, `callOpenAICompatible` in
   `llm-client.js`, pass to `fetch()`
4. **True Stop — service worker**: Add `currentAbortController`, create on command start, abort on cancel, forward
   `CANCEL_ACTIONS` to content script — depends on step 3
5. **True Stop — content script**: Add `actionCancelled` flag and `cancelActions()` to `action-executor.js`, add
   `CANCEL_ACTIONS` handler to `content-script.js`
6. **True Stop — panel recovery**: Ensure `CANCEL_TASK` handler sends `COMMAND_RESULT` to panel so UI recovers — depends
   on step 4
7. **Auto-resize input**: Change `<input>` to `<textarea>` in HTML, update CSS, add auto-resize + Shift+Enter logic to
   JS

## 6. Risk & Mitigation

| Risk                                                                  | Mitigation                                                                                                                                                |
|-----------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `AbortError` shown as error to user                                   | Catch `AbortError` specifically in `handleExecuteCommand`, treat as clean cancellation                                                                    |
| Debug overlay positions wrong after scroll                            | Overlays use `position: fixed` with `getBoundingClientRect()` — correct at render time. Add scroll listener to remove overlay on scroll (keeps it simple) |
| `chrome.tabs.sendMessage` fails from sidepanel (no `tabs` permission) | Route through service worker instead of direct tab messaging                                                                                              |
| Textarea height flickers on rapid input                               | Use `requestAnimationFrame` or simple height assignment — minimal risk                                                                                    |

## 7. Acceptance Criteria

- [ ] Click Show Elements → page highlights all detected elements with [N] labels
- [ ] Click Show Elements again → all highlights removed
- [ ] Click Stop → in-flight LLM fetch request aborted immediately
- [ ] Click Stop → running repeat loop stops immediately
- [ ] After Stop → panel restores input state (Send button visible, input enabled)
- [ ] Input field grows with content, min 1 line, max 5 lines
- [ ] Enter sends message, Shift+Enter inserts newline
- [ ] Overlay does not interfere with page interaction (pointer-events: none)
- [ ] Complex pages (e.g. Habitica 4-column layout) — element slots cover all columns, not just the first
- [ ] Debug overlay labels follow elements on scroll/resize
- [ ] Options page has Max Elements input, saved to storage and used by extractor
- [ ] Copy DOM button copies element list to clipboard with visual feedback
- [ ] Native interactive elements (button, a, input) not removed by ancestor dedup (GitHub Star/Fork test)
- [ ] LLM sees current page URL in context, auto-navigates for cross-site tasks
