# REQ-002: Basic Function — Natural Language Browser Control

## Summary

Implement the core functionality of ChromePilot: user types a natural language command, the extension extracts the
page's interactive elements, sends both to an LLM API (Claude), and executes the returned actions (click, type, scroll)
on the real page via simulated DOM events.

## Background

The extension skeleton (REQ-001) is in place with stub functions. This requirement replaces all stubs with real
implementations.

## Functional Requirements

### 1. DOM Extraction (Content Script)

Scan the current page and build a simplified interactive element list:

- Buttons, links (`<a>`), inputs, textareas, selects, elements with `onclick`/`role="button"`
- For each element, capture: index, tag, text/label, placeholder, href, id, class (truncated), visibility
- Assign a numeric index `[1], [2], [3]...` to each element for LLM referencing
- Filter out hidden/invisible elements
- Limit to a reasonable count (e.g. top 200 elements) to stay within token limits

### 2. LLM API Integration (Service Worker)

Support configurable LLM providers — not just Claude, any OpenAI-compatible API or local model:

- **Options page configuration**:
    - API Base URL (e.g. `https://api.anthropic.com`, `https://api.openai.com`, `http://localhost:11434` for Ollama,
      `https://models.github.ai/inference` for GitHub Copilot)
    - API Key
    - Model name (e.g. `claude-sonnet-4-20250514`, `gpt-4o`, `llama3`)
    - Provider type: `anthropic` | `openai` (OpenAI-compatible format, covers most providers including local and GitHub
      Copilot)
- **Robustness**:
    - max_tokens set to 4096 to handle models with thinking/reasoning modes
    - System prompt instructs model not to use thinking mode
    - Fallback: if response `content` is empty but `reasoning` field contains JSON, extract from there
- **Unified LLM client**: adapter pattern — same input/output, different API formats
    - Anthropic format: `/v1/messages` with `system` + `messages`
    - OpenAI format: `/v1/chat/completions` with `messages` array (system/user roles)
- Read config from `chrome.storage.sync`
- Send system prompt (action schema) + user message (command + DOM elements)
- Parse LLM response into one or more structured actions
- Action schema:
  ```json
  {
    "actions": [
      { "action": "click", "index": 1, "description": "Click the login button" },
      { "action": "type", "index": 3, "value": "hello", "description": "Type into username field" },
      { "action": "scroll", "direction": "down", "amount": 500, "description": "Scroll down" }
    ]
  }
  ```

### 3. DOM Action Execution (Content Script)

Execute real browser actions via simulated events:

- **click**: Full mouse event sequence (mouseover → mousedown → mouseup → click) with `bubbles: true`, plus visual click
  effect (blue ripple + element outline highlight)
- **type**: Focus element, set value, dispatch `input` and `change` events
- **scroll**: `window.scrollBy()` or scroll to specific element
- Execute actions sequentially with a short delay between each (for page responsiveness)
- Return result for each action (success/failure + description)
- Visual feedback: click actions show a ripple animation at the click point

### 4. Updated Message Flow

```
Side Panel: user types "click the login button" in chat
  → content script sends EXECUTE_COMMAND to service worker
    → service worker sends EXTRACT_DOM to content script
      → content script returns element list
    → service worker calls Claude API with (command + elements)
    → service worker parses response into actions
    → service worker sends PERFORM_ACTIONS to content script
      → content script executes each action sequentially
      → returns results
  → side panel displays results as AI chat message
```

### 5. Side Panel Chat UI (Content Script Injection)

A chat panel injected into the right side of the webpage:

- **Toggle**: Click extension icon (popup) or keyboard shortcut to show/hide the panel
- **Panel UI**:
    - Fixed position, right side, full height, ~380px width
    - Chat message list (scrollable): shows user messages and AI responses
    - Input field at bottom + send button
    - Collapse/close button at top
    - Drag handle or resize (optional, not required for v1)
- **Behavior**:
    - Panel is injected as a Shadow DOM container (isolated from page styles)
    - User types command in the chat input → sends to service worker → results appear as AI message in chat
    - Each AI response shows: what actions were taken, success/failure
    - Chat history persists during the page session (cleared on navigation)
    - Panel should not interfere with the underlying page layout (use fixed positioning)
- **Popup role**: Popup becomes a simple launcher — clicking the extension icon toggles the side panel on the active tab

### 6. Status & Feedback

- Show phased status in chat: "Extracting page..." → "Thinking..." → "Executing..."
- Display action results as AI chat messages
- Handle and display errors clearly (missing API key → link to options)

## Out of Scope

- Multi-step conversational memory across page navigations (future)
- Screenshot/visual analysis (future)
- Page navigation across different URLs in a single command
- Streaming LLM responses
- Panel resize/drag (future)

## Acceptance Criteria

- [ ] Content script extracts interactive elements from any webpage
- [ ] Service worker calls Claude API with user command + DOM context
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
