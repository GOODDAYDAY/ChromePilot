# Technical Design: UI Designer — Side Panel Improvements

Requirement: REQ-003
Date: 2026-03-06
Status: Final (Retrospective)

## 1. Overview

Redesigned the side panel chat UI with proper styling, push layout, and Vim plugin compatibility.
Original implementation used Shadow DOM injection with CSS push layout. Later superseded by REQ-004's migration to
Chrome native `sidePanel` API, which handles panel rendering, width, and lifecycle natively.

## 2. Architecture

### Original Approach (Shadow DOM — superseded by REQ-004)

```
content-script.js injects:
  <div id="chromepilot-root">
    #shadow-root (open)
      <div class="panel"> ... chat UI ... </div>
  </div>

Page body gets margin-right: 380px when panel opens.
Panel is position: fixed, right: 0, width: 380px.
```

### Final Approach (after REQ-004 migration)

Chrome native `sidePanel` API renders `sidepanel/sidepanel.html` as a standalone page in the browser's built-in side
panel frame. All styling from REQ-003 was carried over to `sidepanel.css`.

## 3. Detailed Design

### 3.1 Visual Design (carried to sidepanel.css)

- Panel background: `#f9fafb`
- Header: dark gray `#374151`, white text, 15px font
- Messages area: flex column, 20px padding, scrollable
- User messages: blue bubble (`#dbeafe`), right-aligned
- AI messages: white bubble with border, left-aligned
- Status messages: yellow background, italic
- Error messages: red background with red border
- Input area: white background, blue-focused border with shadow

### 3.2 Chat Input

- `<input type="text">` with system font stack
- Focus style: blue border + subtle box-shadow
- Send button: blue (`#2563eb`), disabled state lighter

### 3.3 Clear History

- Trash icon button in header
- Clears all messages, re-creates welcome element using `createElement` (no `innerHTML` for Chrome Web Store compliance)

### 3.4 Vim Plugin Compatibility (original Shadow DOM)

- Problem: Vim browser plugins intercept keystrokes on `document.activeElement`, which returns the Shadow DOM host
  `<div>` instead of the inner `<input>`
- Solution: Set `panelRoot.contentEditable = 'true'` on input focus to trick Vim into treating it as an editable area
- Note: This workaround became unnecessary after REQ-004's migration to native sidePanel (separate document context)

## 4. File Plan

| Action  | Path                           | Description                                         |
|---------|--------------------------------|-----------------------------------------------------|
| Created | `src/sidepanel/sidepanel.html` | Panel HTML structure (later, via REQ-004 migration) |
| Created | `src/sidepanel/sidepanel.css`  | All visual styles from this requirement             |
| Created | `src/sidepanel/sidepanel.js`   | Panel logic, messaging, settings                    |
| Deleted | `src/content/side-panel.js`    | Shadow DOM panel (removed in REQ-004)               |

## 5. Acceptance Criteria

- [x] Panel background, header, padding match design spec
- [x] Clear button clears chat and shows welcome message
- [x] Input works without Vim plugin conflict (native sidePanel context)
- [x] Messages scrollable when content overflows
- [x] Welcome prompt shown when chat is empty
