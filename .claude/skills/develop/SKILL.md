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
- **Design doc naming:** `design-REQ-XXX.md` (mirrors the requirement it implements)
- **Status flow:** `Todo` → `Designing` → `Approved` → `In Progress` → `Done`

### TRACKER.md Format

```markdown
# Project Tracker

Latest ID: N

| ID | Requirement | Design | Status | Updated | Notes |
|----|-------------|--------|--------|---------|-------|
| REQ-001 | [xxx.md](requirements/xxx.md) | [design-REQ-001.md](designs/design-REQ-001.md) | Done | 2026-03-06 | - |
| REQ-002 | [yyy.md](requirements/yyy.md) | - | Designing | 2026-03-06 | - |
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

**Trigger:** User provides a requirement document path, or describes a new feature/task.

#### Phase 2a: Requirement Registration

1. If user provided a file path → read the document
2. If user described a feature in text → create a new `.md` file in `docs/requirements/`
3. Check TRACKER.md:
    - Not tracked → assign next `REQ-XXX` ID, add row with status `Todo`
    - Already tracked → show current status and ask how to proceed

#### Phase 2b: Requirement Enrichment

Analyze the requirement document. If it is brief or incomplete, proactively discuss with the user to improve it:

- Clarify ambiguous functionality
- Suggest acceptance criteria if missing
- Identify edge cases and error scenarios
- Point out missing details (API contracts, data formats, performance targets, etc.)
- Assess impact on existing `Done`/`In Progress` requirements

After discussion, update the requirement document with agreed changes.

#### Phase 2c: Gate

Ask: **"Requirement is ready. Proceed to architecture design?"**

- User confirms → go to Mode 3
- User declines → stop, status stays `Todo`

---

### Mode 3: Architecture Design

**Trigger:** User confirms design phase, or explicitly asks to design a requirement.

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

#### Step 4: Await User Decision

**STOP. Do NOT proceed without explicit user approval of an approach.**

Possible outcomes:

- User picks an approach → proceed to Step 5
- User requests changes → revise and re-present
- User has a different idea → incorporate and redesign

#### Step 5: Write Technical Design Document

After user confirms an approach, produce a full `design-REQ-XXX.md` in `docs/designs/` containing:

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

#### Step 6: Gate

Present the design doc to the user. Ask: **"Design is ready. Start implementation?"**

- User confirms → go to Mode 4
- User requests revisions → update the design doc and re-present
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

## Rules

- **Never write code before both documents are approved** — this is the core invariant
- All TRACKER.md updates are automatic (adding rows, status changes, ID increments, dates)
- Impact analysis is mandatory before execution — never skip it
- If a task is trivially small (e.g., fix a typo, change a config value), tell the user the full process is overkill and
  offer a direct fix instead
- Keep file paths consistent between TRACKER.md references and the actual filesystem
- When the user says `/develop status`, always use Mode 1 regardless of other arguments
