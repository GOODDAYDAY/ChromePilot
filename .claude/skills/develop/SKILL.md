---
name: develop
description: Full development workflow. Requirement doc -> architecture design doc -> implementation. No code until both documents are approved.
---

# Develop - Document-Driven Development

Core principle: **No code without two approved documents — a requirement doc and a technical design doc.**

## User Input

$ARGUMENTS

## Conventions

- **Requirements directory:** `docs/requirements/`
- **Design documents directory:** `docs/designs/`
- **Tracker file:** `docs/TRACKER.md`
- **Requirement numbering:** `REQ-XXX`, auto-incrementing
- **File naming:** Both requirement and design docs share the same slug:
    - Requirement: `requirement-REQ-XXX-<slug>.md` (e.g. `requirement-REQ-001-init.md`)
    - Design: `design-REQ-XXX-<slug>.md` (e.g. `design-REQ-001-init.md`)
    - Slug is kebab-case, derived from the user-provided name
- **Status flow:** `Todo` → `Designing` → `Approved` → `In Progress` → `Done`

### TRACKER.md Format

```markdown
# Project Tracker

Latest ID: N

| ID | Slug | Requirement | Design | Status | Updated | Notes |
|----|------|-------------|--------|--------|---------|-------|
| REQ-001 | init | [requirement-REQ-001-init.md](requirements/requirement-REQ-001-init.md) | [design-REQ-001-init.md](designs/design-REQ-001-init.md) | Done | 2026-03-06 | - |
| REQ-002 | user-auth | [requirement-REQ-002-user-auth.md](requirements/requirement-REQ-002-user-auth.md) | - | Designing | 2026-03-06 | - |
```

Auto-create directories and TRACKER.md if they don't exist. Always read the latest state before any operation.

## Workflow

Automatically determine mode based on user input:

---

### Mode 0: Initialize Project

**Trigger:** Argument is `init`.

Create the document-driven development scaffold:

1. Create directories (skip any that already exist):
    - `docs/requirements/`
    - `docs/designs/`
2. Create `docs/TRACKER.md` with initial content (skip if already exists):
   ```markdown
   # Project Tracker

   Latest ID: 0

   | ID | Requirement | Design | Status | Updated | Notes |
   |----|-------------|--------|--------|---------|-------|
   ```
3. Print a summary of what was created
4. Remind the user: use `/develop <requirement>` to start the first feature

---

### Mode 1: View Status

**Trigger:** Argument is `status`, empty, or user asks to view progress.

1. Read TRACKER.md
2. Display all requirements grouped by status, with counts
3. Highlight `Designing` and `In Progress` items

---

### Mode 2: New Requirement

**Trigger:** One of:

- `/develop add <slug>` — create new requirement with the given slug (kebab-case name)
- `/develop add <slug> <description>` — slug + inline description as initial content
- `/develop <existing-file-path>` — register an existing requirement file

#### Phase 2a: Requirement Registration

1. Parse the slug from arguments (first word after `add`). Convert to kebab-case if needed.
2. Assign the next `REQ-XXX` ID from TRACKER.md
3. Create `docs/requirements/requirement-REQ-XXX-<slug>.md`:
    - If description provided → use it as initial content
    - If file path provided → read the existing document and rename/move to convention
    - Otherwise → create with a placeholder heading
4. Add row to TRACKER.md with status `Todo`

#### Phase 2b: Requirement Enrichment

Analyze the requirement document. If it is brief or incomplete, proactively discuss with the user to improve it:

- Clarify ambiguous functionality
- Suggest acceptance criteria if missing
- Identify edge cases and error scenarios
- Point out missing details (API contracts, data formats, performance targets, etc.)
- Assess impact on existing `Done`/`In Progress` requirements

After discussion, update the requirement document with agreed changes.

#### Phase 2c: Auto-proceed to Design

After enriching the requirement, automatically proceed to Mode 3 (no gate needed here).

---

### Mode 3: Architecture Design

**Trigger:** Auto-proceeds from Mode 2, or user explicitly asks to design a requirement.

Update TRACKER.md status to `Designing`.

#### Step 1: Research Current State

Explore the codebase to understand:

- Project structure and existing modules
- Tech stack, frameworks, patterns in use
- Code that will be affected by this requirement
- Reusable components and utilities

#### Step 2: Design Proposals

Propose **2-3 viable approaches**. Each must include:

```markdown
## Approach [N]: [Name]

### Overview

[One paragraph: core idea]

### Tech Choices

-

[Technology/Pattern]: [Why]

### Key Design

- [Module/Component]: [Responsibility and design]

### File Changes

- New: [files to create]
- Modified: [files to change]

### Pros

- ...

### Cons

- ...
```

#### Step 3: Recommendation

State your recommended approach with clear reasoning, considering:

- Implementation complexity and risk
- Maintainability and extensibility
- Fit with existing architecture
- Impact on existing features

#### Step 4: Select Best Approach

Pick the recommended approach and proceed directly to writing the design document. No user confirmation needed at this
stage.

#### Step 5: Write Technical Design Document

Produce a full `design-REQ-XXX-<slug>.md` in `docs/designs/` containing:

```markdown
# Technical Design: [Feature Name]

Requirement: REQ-XXX
Date: YYYY-MM-DD
Status: Proposed

## 1. Overview

[What this design achieves and why this approach was chosen]

## 2. Architecture

[High-level architecture description, data flow, component interactions]

## 3. Detailed Design

### 3.1 [Component/Module Name]

- Responsibility
- Key interfaces / functions
- Internal logic

### 3.2 [Component/Module Name]

...

## 4. File Plan

| Action | Path | Description |
|--------|------|-------------|
| Create | src/xxx | ... |
| Modify | src/yyy | ... |

## 5. Implementation Steps

[Ordered list of steps with dependencies marked]

1. [Step]: [files involved] — [key details]
2. [Step]: [files involved] — depends on step 1
   ...

## 6. Risk & Mitigation

| Risk | Mitigation |
|------|------------|
| ... | ... |

## 7. Acceptance Criteria

- [ ] [Criterion from requirement doc]
- [ ] ...
```

Update TRACKER.md: add design doc link, update status to `Approved`.

#### Step 6: Gate — Single Confirmation Point

Present both the updated requirement doc and design doc to the user. Ask: **"Documents are ready. Start implementation?"
**

This is the **only** confirmation gate in the entire workflow. Everything before this runs automatically.

- User confirms → go to Mode 4
- User requests revisions → update the relevant doc(s) and re-present
- User declines → stop, status stays `Approved`

---

### Mode 4: Execute Implementation

**Trigger:** User explicitly says to start coding, or confirms after Mode 3 gate.

#### Pre-checks

- Verify both requirement doc and design doc exist and are up to date
- If status is `In Progress` → ask whether to continue from where it left off
- If status is `Done` → ask whether to redo

#### Impact Analysis

- Review all `Done` and `In Progress` requirements
- Assess whether this work could break existing functionality
- **If there is impact, inform the user clearly before proceeding**

#### Execute

1. Update TRACKER.md status to `In Progress`
2. Follow the implementation steps from the design doc
3. Report progress at key milestones (after each major step)
4. If implementation reveals a design issue, pause and discuss with the user — update design doc if needed

#### Wrap Up

1. Update TRACKER.md status to `Done`, record date
2. Summary:
    - Files created/modified
    - Acceptance criteria checklist (checked off)
    - Items requiring manual testing or verification

---

---

### Mode 5: Finalize & Sync Documents

**Trigger:** `/develop done` or `/develop done <ID|slug>`

During implementation, requirements often evolve — new features get added, edge cases emerge, designs change.
This mode captures all of that back into the documents so they stay the single source of truth.

#### Steps

1. **Identify target**: If ID/slug is provided, use that requirement. Otherwise, find the most recent `Done` item in
   TRACKER.md.
2. **Diff scan**: Read the current codebase files listed in the design doc's File Plan. Compare the actual
   implementation
   against what the requirement doc and design doc describe. Look for:
   - Features implemented but not listed in requirements
   - Design changes (new files, changed interfaces, extra settings, new actions)
   - Acceptance criteria that need adding or updating
   - Implementation details that diverged from the original design
3. **Update requirement doc**: Add any missing requirements discovered during implementation. Check off completed
   acceptance criteria. Add new criteria for new features.
4. **Update design doc**: Sync the design to match actual implementation — update file plan, detailed design sections,
   architecture notes, risk table. Change status to `Final`.
5. **Summary**: Print a diff summary of what was added/changed in each document.

#### Rules for this mode

- Do NOT change code — this mode is documents-only
- Read actual source files to verify, don't guess from memory
- Preserve the original document structure, just add/update sections
- If the requirement doc already matches implementation, say so and skip

---

## Rules

- **Never write code before both documents are approved** — this is the core invariant
- All TRACKER.md updates are automatic (adding rows, status changes, ID increments, dates)
- Impact analysis is mandatory before execution — never skip it
- If a task is trivially small (e.g., fix a typo, change a config value), tell the user the full process is overkill and
  offer a direct fix instead
- Keep file paths consistent between TRACKER.md references and the actual filesystem
- When the user says `/develop status`, always use Mode 1 regardless of other arguments
- **After marking Done, always remind the user** to run `/develop done` to sync documents with actual implementation
