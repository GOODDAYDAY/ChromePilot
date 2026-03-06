# ChromePilot - Project Guide

## What is this?

ChromePilot is a Chrome extension (Manifest V3) that lets users control any webpage using natural language. The user
types a plain-English command, and the extension clicks, types, scrolls, and navigates on their behalf.

## Tech Stack

- **Manifest**: V3 (strictly enforced — never use V2)
- **Language**: Vanilla JavaScript (ES2022+), no TypeScript unless explicitly requested
- **Styling**: CSS (Tailwind CSS via CDN is forbidden — use local CSS or inline styles)
- **Build**: None by default (plain files loaded directly by Chrome). If a bundler is needed, use Vite
- **AI Integration**: Calls external LLM API to parse natural language into browser actions

## Project Structure

```
/src
  manifest.json          # Extension manifest (entry point)
  /background
    service-worker.js    # MV3 service worker (event-driven, stateless)
  /content
    content-script.js    # Injected into web pages, executes DOM actions
  /popup
    popup.html           # Extension popup UI
    popup.js
    popup.css
  /options
    options.html         # Settings page (API key config, preferences)
    options.js
    options.css
  /lib
    utils.js             # Shared helpers
/icons                   # Extension icons (16, 48, 128 px)
```

## Coding Standards

### Naming

- Variables / functions: `camelCase`
- Files: `kebab-case` (e.g. `content-script.js`)
- Constants: `UPPER_SNAKE_CASE`

### Async

- All `chrome.*` async calls must use `async/await` (not raw callbacks)
- `chrome.runtime.onMessage` listeners must `return true` when responding asynchronously

### Security (non-negotiable)

- **No `innerHTML`** — use `textContent` or `document.createElement`
- **No `eval()`**, `new Function()`, `setTimeout(string)` — Chrome Web Store will reject these
- **No remote code loading** — all JS must be bundled locally
- **No wildcard host permissions** unless absolutely necessary — prefer `activeTab`
- Sanitize any user-generated content before DOM insertion

### Storage

- Use `chrome.storage.local` for persistent data
- Use `chrome.storage.sync` only for small user preferences that should roam across devices
- Never use `localStorage` in extension context

### Messaging

- Background <-> Content Script: `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`
- For long-lived connections: `chrome.runtime.connect` with disconnect handling
- Always check `chrome.runtime.lastError` after chrome API calls, or wrap in try/catch

### Network

- Use `chrome.declarativeNetRequest` instead of deprecated `webRequest` for request modification
- For API calls to external services, use `fetch()` from the service worker

## MV3-Specific Rules

- Service worker is **ephemeral** — it can be terminated at any time. Never rely on in-memory state; persist anything
  important to `chrome.storage`
- Use `chrome.alarms` instead of `setInterval` for periodic tasks (intervals don't survive SW termination)
- Use `chrome.offscreen` API if you need DOM access from background context
- Register all content scripts in `manifest.json` where possible; use `chrome.scripting.executeScript` for dynamic
  injection

## Permissions Policy

When adding permissions to `manifest.json`:

1. Use the minimum set of permissions required
2. Prefer `activeTab` over broad host permissions
3. Move non-critical permissions to `optional_permissions`
4. Every permission must have a clear justification (add a comment in the code or commit message)

## Commands

- **Load extension**: Open `chrome://extensions` > Enable Developer Mode > Load Unpacked > select `/src`
- **Reload after changes**: Click the reload icon on the extension card, or Ctrl+R on the extension page
- **View service worker logs**: Click "Service Worker" link on the extension card in `chrome://extensions`
- **Build** (if Vite is added later): `npm run build`
- **Lint** (if ESLint is added later): `npm run lint`

## Error Handling

- Wrap all `chrome.*` calls in try/catch
- Handle service worker cold-start: use `chrome.runtime.onInstalled` to initialize default storage values
- Content scripts must gracefully handle page navigations mid-execution
- Log errors with `console.error` and include enough context to debug (action name, relevant IDs)

## Git Conventions

- Commit messages: imperative mood, concise (e.g. "Add popup UI for command input")
- One logical change per commit
- Branch naming: `feature/xxx`, `fix/xxx`, `refactor/xxx`
