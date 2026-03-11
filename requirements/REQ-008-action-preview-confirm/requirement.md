# REQ-008 Action Preview & Confirm

> Status: Completed
> Created: 2026-03-11
> Updated: 2026-03-11

## 1. Background

Currently, when the user issues a command, ChromePilot immediately extracts DOM → calls LLM → executes actions, with no
opportunity for the user to review or approve the planned actions before execution. This can lead to unintended clicks,
navigations, or inputs on the wrong elements.

This feature adds a **"Preview & Confirm"** step between LLM analysis and action execution. It reuses the existing red
border highlight and numbered label overlay to visually show which elements will be acted upon and in what order. The
user must explicitly confirm before actions are executed. If the user disagrees with the plan, they can request
re-analysis with the previous context preserved.

## 2. Target Users & Scenarios

- **All ChromePilot users** who want more control and transparency over automated actions.
- **Scenarios**:
    - User issues a command, reviews the highlighted plan on the page, and confirms execution.
    - User sees an incorrect plan, rejects it, and LLM re-analyzes with rejection context.
    - User enables auto-confirm to restore the original immediate-execution behavior.
    - Multi-step tasks: each step shows preview before execution.

## 3. Functional Requirements

### F-01 Action Preview Overlay

Display a visual preview on the page after LLM returns planned actions, before execution.

- Main flow:
    1. After LLM returns `actions[]`, send a `PREVIEW_ACTIONS` message to the content script instead of executing
       immediately.
    2. Content script highlights each target element with a red border (`#ef4444`, 3px solid) and a step-number label at
       top-left corner (e.g., `[1] Click`, `[2] Type "hello"`).
    3. For `scroll` and `navigate` actions (no target element), show text-only entries in the side panel summary only.
    4. Overlay tracks scroll/resize (reuse `requestAnimationFrame` pattern from debug overlay).
    5. Scroll the first target element into view if it is off-screen.
- Error handling:
    - If an element index is not found in `elementMap`, show a warning ("Element [x] not found") in the side panel
      action list.
- Edge cases:
    - If all actions are non-element actions (scroll, navigate), skip the overlay and show summary only in side panel.
    - Preview overlay and debug overlay can coexist without conflict.

### F-02 Confirm / Reject UI in Side Panel

Display a confirmation prompt in the side panel with an action summary and two action buttons.

- Main flow:
    1. Side panel shows a card listing planned actions: step number, action type, target element description.
    2. Two buttons: "▶ Confirm" (green) and "🔄 Re-analyze" (orange).
    3. "Confirm" triggers execution of all planned actions and removes the preview overlay.
    4. "Re-analyze" clears the preview overlay and triggers a new LLM call with rejection context.
- Error handling:
    - If the user closes the side panel during preview, treat as cancel (same as pressing Stop).
- Edge cases:
    - The Stop button should also work during preview state, cancelling the entire task and clearing the overlay.

### F-03 Re-analyze with Context

When the user rejects a plan, re-invoke the LLM with the rejected plan appended to conversation history.

- Main flow:
    1. Append the rejected plan to `conversationHistory` with a marker indicating rejection (e.g.,
       `{rejected: true, actions: [...]}`).
    2. Re-extract DOM (page state may have changed).
    3. Send a new LLM request with updated context, prompting: "User rejected the previous plan. Please re-analyze and
       suggest alternative actions."
    4. Show the new preview when LLM responds.
- Error handling:
    - If re-analysis fails (LLM error), show error and allow retry or cancel.
- Edge cases:
    - Maximum 3 re-analysis attempts per step. After 3 rejections, show a message suggesting the user rephrase the
      command.

### F-04 Preview Overlay Cleanup

Ensure the preview overlay is always properly removed.

- Cleanup is triggered on:
    - User confirms (before execution starts)
    - User rejects (before re-analysis starts)
    - User cancels the task (Stop button)
    - Page navigation occurs
- Uses a dedicated cleanup function that removes all preview overlay elements and scroll/resize listeners.

### F-05 Per-Step Preview for Multi-Step Tasks

For multi-step tasks (`done === false`), every step goes through the preview→confirm cycle.

- Main flow:
    1. After step N is confirmed and executed, the loop continues to step N+1.
    2. Step N+1: DOM is re-extracted, LLM is called, and the new plan is shown as a preview.
    3. User must confirm step N+1 before it executes.
    4. This repeats for every step until the task is done or cancelled.
- Edge cases:
    - Re-analysis attempts reset to 0 at each new step.

### F-06 Auto-Confirm Option

Provide a toggle to skip preview and auto-confirm, restoring the original behavior.

- Main flow:
    1. Add a checkbox in the **options page** (`options.html`): "Auto-confirm actions".
    2. Stored in `chrome.storage.sync` as `autoConfirm`.
    3. When enabled, actions execute immediately without preview (current behavior preserved).
    4. When disabled (default), the preview→confirm flow is active.
- Edge cases:
    - Changing the toggle mid-task takes effect from the next step.

## 4. Non-functional Requirements

- Preview overlay must render within 200ms after LLM response.
- Re-analysis reuses the existing `conversationHistory` mechanism — no new data structures needed.
- No new Chrome permissions required.
- Preview overlay must not interfere with existing debug overlay.
- All new UI text in English (side panel labels, button text).

## 5. Out of Scope

- Editing individual actions in the preview (reorder, delete, modify single actions).
- User adding custom actions to the plan.
- Preview for teach mode recordings.
- Per-action confirmation (confirm/reject applies to the entire step's action set).

## 6. Acceptance Criteria

| ID    | Feature | Condition                                | Expected Result                                                                  |
|:------|:--------|:-----------------------------------------|:---------------------------------------------------------------------------------|
| AC-01 | F-01    | LLM returns 3 click actions              | 3 elements highlighted with red borders, numbered [1] [2] [3] with action labels |
| AC-02 | F-01    | Action targets element not in elementMap | Warning shown in side panel, other actions still previewed                       |
| AC-03 | F-02    | User clicks "Confirm"                    | Preview overlay cleared, actions execute normally                                |
| AC-04 | F-02    | User clicks "Re-analyze"                 | Preview overlay cleared, new LLM call made with rejection context                |
| AC-05 | F-02    | User clicks Stop during preview          | Task cancelled, preview overlay cleared                                          |
| AC-06 | F-03    | User rejects plan once                   | New plan shown with preview, includes rejection context                          |
| AC-07 | F-03    | User rejects plan 3 times                | Message shown suggesting rephrasing the command                                  |
| AC-08 | F-04    | Page navigates during preview            | Preview overlay removed cleanly, no DOM leaks                                    |
| AC-09 | F-05    | Multi-step task, step 2 reached          | Preview shown for step 2 actions, requires confirmation before execution         |
| AC-10 | F-06    | Auto-confirm enabled                     | Actions execute immediately without preview (original behavior)                  |
| AC-11 | F-06    | Auto-confirm disabled (default)          | Preview shown before every step's execution                                      |

## 7. Change Log

| Version | Date       | Changes                                                  | Affected Scope | Reason          |
|:--------|:-----------|:---------------------------------------------------------|:---------------|:----------------|
| v1      | 2026-03-11 | Initial version                                          | ALL            | -               |
| v2      | 2026-03-11 | Move auto-confirm toggle from side panel to options page | F-06           | User preference |
