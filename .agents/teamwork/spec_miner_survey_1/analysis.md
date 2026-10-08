# Blueprint Studio Rebuild — Specification & Requirements Report

## 1. Executive Summary & Architectural Overview

Blueprint Studio is the visual planning and goal decomposition engine in **YouDO** (Execution & Goal Tracker). It allows users to design, structure, and manipulate hierarchical goal trees.

The objective of this rebuild is to reconstruct Blueprint Studio's foundational UI/UX from scratch into a **simple, streamlined, flexible, and soothing goal tree editor**, eliminating clunky legacy menus, convoluted nested tabs, and rigid restrictions while implementing powerful bulk editing capabilities (R1–R5).

### Core Architectural Context
- **Data Model Source of Truth:** `GoalNode` hierarchy (`src/types.ts`).
- **Workspace State Management:** Blueprint Studio operates on an isolated in-memory draft (`draft: GoalNode[]`) with transactional commit via `onCommit(baseGoals, nextGoals, summary)` (`src/store.tsx`).
- **Store Synchronization:** On commit, `applyGoalTreeChange` reconciles current daily task cards (`reconcileBlueprintTasks`), updates tree completion rollups (`recomputeCompleted`), checks active session safety, and records an undo snapshot.
- **Design System:** Native-feeling, mobile-first responsive layout (max width 780px) adhering to YouDO's neutral and pastel color palette (`var(--bg-base)`, `var(--bg-surface)`, `var(--primary)`, `var(--border-subtle)`).

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: Expansion | Explicit Choice: Children vs Steps | Explicit user choice when expanding/adding into a node: create child nodes (branch) or checklist steps (executable task). | User selection: "Sub-items (Children)" or "Checklist Steps" | Node transformed into Branch or Actionable Task | Prohibits active conflict; offers graceful conversion | User Request R1, `goalTree.ts` |
| 2 | R1: Expansion | Branch vs Task Structural Invariant | A node is either a Branch (`children.length > 0`) or an Executable Task (`steps` array, `children.length === 0`), never a hybrid. | Node state check | Deterministic rollup and Today scheduling | If node has steps, adding children prompts to convert or clear steps | `goalTree.ts:rollupPct`, `countDirectChildren` |
| 3 | R1: Expansion | Graceful Step-to-Child Conversion | Allows converting existing checklist steps on a leaf into child nodes without losing user inputs. | Existing steps array, user confirmation | New child nodes created from steps, steps cleared | Active focus session on node blocks conversion | `ORIGINAL_REQUEST.md`, Codebase inspection |
| 4 | R2: Bulk Add | Bulk "Add Inside" Sub-items | Adds the same or patterned child nodes inside multiple selected parents simultaneously. | Parent IDs, child titles (single, list, or numbered) | New child nodes appended to each parent | Skips existing sibling titles per parent silently; empty titles ignored | User Request R2, `blueprintStudio.ts` |
| 5 | R2: Bulk Add | Bulk "Add Inside" Checklist Steps | Adds checklist steps inside all selected endpoint tasks simultaneously. | Task IDs, step titles | New steps appended to each task; `stepDone` extended | Skips duplicate step titles per node; branches skipped gracefully | User Request R2, `blueprintStudio.ts` |
| 6 | R2: Bulk Add | Numbered Sequence Generation | Generates patterned titles (e.g. "Topic 1" to "Topic 5") with prefix, start, and count. | Prefix string, start int (≥0), count int (1..100) | Formatted string array | Clamps count to [1, 100]; defaults start to 1; sanitizes prefix | `blueprintStudio.ts:numberedBlueprintTitles` |
| 7 | R3: Bulk Diff | Collective Steps Visualization | Aggregates all distinct steps across selected tasks into a single unified list with prevalence indicators. | Selected task IDs, their existing `steps` | Union set with prevalence badges ("All N", "k of N") | Empty state if no steps exist across selection | User Request R3, `StudioForms.tsx` |
| 8 | R3: Bulk Diff | Bulk Step Addition (Set-Union) | Adds newly typed or pasted steps to all selected tasks. If a task already has that step, it is skipped. | New step titles | Steps appended to tasks missing them; existing untouched | Case-insensitive deduplication per node; whitespace normalized | User Request R3, `ORIGINAL_REQUEST.md` |
| 9 | R3: Bulk Diff | Bulk Step Removal (Set-Difference) | Deletes steps from all selected tasks. Missing steps on a task are skipped silently without errors. | Step titles to delete | Steps removed from tasks that possess them | Protected completed steps preserved unless explicitly overridden | User Request R3, `ORIGINAL_REQUEST.md` |
| 10 | R3: Bulk Diff | Bulk Step Renaming | Renames a step across all selected nodes where it occurs while preserving completion status. | Original title, new title | Renamed step label on all matching nodes | Blank or whitespace-only rename is rejected | Codebase inspection, `blueprintStudio.ts` |
| 11 | R4: Dates | Individual Date Setting | Sets or clears Start Date and/or Deadline on a single node. | Node ID, `startDate` (ISO), `endDate` (ISO) | Node updated with ISO strings or undefined | Error if `endDate < startDate`; invalid format rejected | User Request R4, `types.ts`, `dates.ts` |
| 12 | R4: Dates | Bulk Date Setting | Sets or clears Start Date and/or Deadline across all selected nodes simultaneously. | Selected Node IDs, `startDate`, `endDate` | All selected nodes updated uniformly | Validates `startDate <= endDate`; flags or auto-corrects conflicting prior dates | User Request R4, `ORIGINAL_REQUEST.md` |
| 13 | R4: Dates | Quick Date Presets | One-tap date selection for rapid scheduling (Today, Tomorrow, End of Week, +2 Weeks, +1 Month, Clear). | Preset selection button | ISO dates calculated using local calendar timezone | Gracefully updates date fields | Codebase inspection, `dates.ts` |
| 14 | R4: Dates | Date Hierarchy Isolation | Applying dates to selected nodes does not force-overwrite children unless explicitly toggled by user. | Selected nodes, optional recursive flag | Target nodes updated; child autonomy preserved | Informs user of parent/child date bounds | Codebase inspection, `aiPlan.ts` |
| 15 | R5: UI/UX | Serene Minimalist Layout | Distraction-free, calming interface with soft palette, generous spacing, and unified typography. | Viewport rendering | Clean tree navigation, breadcrumb header, floating actions | Responsive on mobile and desktop | User Request R5, `studio.css` |
| 16 | R5: UI/UX | Intuitive Direct Multi-Selection | Touch/click selection mode with checkboxes/select circles; no clunky or error-prone long-press delays. | Tap on select circle or "Select" button | Selected ID array maintained in state | Tapping node body navigates; select circle toggles selection | User Request R5, `BlueprintStudio.tsx` |
| 17 | R5: UI/UX | Contextual Bottom Floating Bar | Appears when ≥1 nodes are selected; displays count and direct bulk action triggers (Add Inside, Steps, Dates, Edit, Delete). | Selected nodes count & types | Context-aware buttons (e.g. "Steps" enabled if tasks selected) | Gracefully disables irrelevant actions | User Request R5, `BlueprintStudio.tsx` |
| 18 | Draft | In-Memory Draft with Undo/Redo | All edits remain in an isolated draft with full stack undo/redo until the user saves. | User actions (Add, Edit, Diff, Remove) | Draft history stack (`past`, `future`) | Prevents accidental loss; un-dirty warning on exit | Codebase inspection, `BlueprintStudio.tsx` |
| 19 | Commit | Active Focus Session Protection | Prevents editing or deleting a task that is currently active in a live focus session. | `activeGoalNodeId`, action target IDs | Blocks modification of active task | Clear message: "Finish focus session before editing this task" | `App.tsx`, `store.tsx:applyGoalTreeChange` |
| 20 | Commit | Reconcile Daily Task Cards | Reconciles active daily task cards when goal tree changes; preserves historical completed cards as immutable snapshots. | Base goals, next goals, tasks list | Reconciled `Task[]` list | Preserves past dated completions | `blueprintStudio.ts:reconcileBlueprintTasks` |
| 21 | Navigation | Hierarchical Drill-down & Breadcrumbs | Navigates into any branch with a clean, horizontally scrollable breadcrumb path (`Goals › Stage › Chapter`). | Branch ID | Current view focused on branch's direct children | Root fallback if current node is deleted | `BlueprintStudio.tsx:breadcrumbRef` |
| 22 | Tree Ops | Reordering Siblings | Moves selected sibling nodes up or down within their parent container. | Node IDs, direction (`up` / `down`) | Sibling array reordered | Boundary checks (cannot move above 0 or below length) | `studioWorkspace.ts:reorderStudioItems` |
| 23 | Tree Ops | Node Deletion with Confirmation | Deletes selected nodes and all nested descendants with an explicit summary confirmation. | Node IDs | Nodes and descendants removed from tree | Undoable within draft; warns if active session task included | `blueprintStudio.ts:removeBlueprintNodes` |

---

## 3. Edge Cases Matrix

| # | Feature | Input / Scenario | Observed / Specified Behavior |
|---|---------|------------------|--------------------------------|
| 1 | R1: Expansion | Node already has checklist steps; user selects "Add Sub-items (Child Nodes)" | Prompt user: (a) Convert existing steps into child nodes, (b) Discard steps and add child nodes, or (c) Cancel. Never silently corrupt or create hybrid node. |
| 2 | R1: Expansion | Node has completed checklist steps (`stepDone[i] === true`); user requests conversion | Require explicit confirmation: "This task has completed steps. Converting will preserve completed items as completed sub-items." |
| 3 | R1: Expansion | Active focus session is running on the node being expanded/converted | Block conversion with user message: "Finish the active focus session before restructuring this task." |
| 4 | R2: Bulk Add Inside | Multiple selected nodes: Parent A already has child "Lecture 1", Parent B does not; user adds "Lecture 1" | "Lecture 1" is added to Parent B and skipped on Parent A. Operation succeeds without error; notification shows "Added 1 item to 1 branch". |
| 5 | R2: Bulk Add Inside | User enters multiple identical titles in list mode (e.g. `Alpha\nBeta\nAlpha`) | Titles normalized and deduplicated internally: `Alpha` added once per parent; duplicate within input ignored. |
| 6 | R2: Bulk Add Inside | User inputs whitespace-only or empty strings | Blank lines and pure whitespace strings are stripped. If all inputs are blank, submit button remains disabled. |
| 7 | R2: Bulk Add Inside | Numbered sequence with non-numeric or negative start/count | Validated strictly: `count` clamped between 1 and 100; `start` clamped to ≥ 0 integers; defaults applied if invalid. |
| 8 | R2: Bulk Add Inside | Selection includes both a parent and its direct child | Both nodes receive the added items inside them (each acts as a destination container). Generated child IDs are globally unique. |
| 9 | R3: Bulk Step Diffing | Node 1 has `['A', 'B']`, Node 2 has `['C']`. User deletes `'A'` in bulk editor | `'A'` is removed from Node 1. Node 2 (which never had `'A'`) is untouched; no error thrown. Result: Node 1 has `['B']`, Node 2 has `['C']`. |
| 10 | R3: Bulk Step Diffing | Node 1 has `['A', 'B']`, Node 2 has `['B', 'C']`. User adds `'B'` in bulk editor | Both nodes already have `'B'`. `'B'` is skipped on both nodes; no duplicate `'B'` created on either node. |
| 11 | R3: Bulk Step Diffing | User deletes step `'A'`, but on Node 1 `'A'` is already completed (`stepDone[0] === true`) | Protected completed step logic: Incomplete `'A'` steps are removed; completed `'A'` steps are preserved by default with notification: "1 completed step preserved". |
| 12 | R3: Bulk Step Diffing | Selected nodes include a Branch (`children.length > 0`) alongside Tasks | Bulk step editor only targets leaf/task nodes among the selection. Branch nodes are ignored for steps or prompted for leaf targeting. |
| 13 | R3: Bulk Step Diffing | All steps deleted from a task node | `node.steps = []`, `node.stepDone = []`, `node.completed = false`. Node becomes an unassigned/stepless leaf. |
| 14 | R4: Bulk Dates | User sets bulk `endDate = '2026-10-15'`, but Node 1 has existing `startDate = '2026-10-20'` | Conflict detected (`startDate > endDate`): Bulk editor auto-adjusts or clears conflicting `startDate` on Node 1, or warns user before applying. |
| 15 | R4: Bulk Dates | User sets bulk `startDate` after existing `endDate` | Conflict detected: Auto-clears conflicting `endDate` or updates `endDate = startDate` with clear visual feedback. |
| 16 | R4: Bulk Dates | User selects "Clear Dates" across multiple nodes | Both `startDate` and `endDate` set to `undefined` on all selected nodes. `todayTaskId` and scheduling history intact. |
| 17 | R4: Bulk Dates | Timezone edge case: user selects "Today" in different UTC offset | Uses `localISODate(new Date())` matching device local calendar day, avoiding UTC offset rollover discrepancies. |
| 18 | R5: UI/UX | User taps back or exit with unsaved draft changes | Confirmation modal: "Leave without saving? Your unsaved blueprint changes will be discarded." Options: "Keep editing" or "Discard draft". |
| 19 | R5: UI/UX | External goals change while Studio is open | On commit, `applyGoalTreeChange` detects `stale` state: Draft remains open; user alerted with recovery instructions. |
| 20 | R5: UI/UX | High-density tree navigation (500+ nodes) | Breadcrumb and list use efficient lightweight DOM rendering; search filter provides instant substring matching. |

---

## 4. Deep Specification for R1: Flexible Node Expansion

### 4.1 Mental Model: Branch vs Executable Task
In YouDO's architecture, a goal hierarchy is organized as an inverted tree:
- **Root Goal (`kind: 'goal'`):** The ultimate high-level objective (e.g. "Pass Bar Exam"). Always a container for children.
- **Branch / Folder (`kind: 'node'`, `children.length > 0`):** An intermediate category, phase, subject, or chapter. It groups lower-level items. Progress is calculated as the average of its children's `rollupPct`.
- **Executable Task (`kind: 'node'`, `children.length === 0`):** A concrete work unit. It can have 0 or more checklist steps (`node.steps: string[]`). It is eligible to be scheduled to the "Today" view and executed in focus sessions. Progress is calculated as the fraction of completed steps (`stepDone.filter(Boolean).length / steps.length * 100`).

### 4.2 Architectural Invariant
> **Strict Non-Hybrid Invariant:** A node MUST NOT possess both active child nodes (`children.length > 0`) and active checklist steps (`steps.length > 0`) simultaneously.
- Rationale: The rollup algorithm (`rollupPct`), the completion recalculator (`recomputeCompleted`), and the daily task mirroring logic (`mirrorGoalContentToTask`) evaluate `children.length > 0` as a branch and ignore `steps`. Having both creates phantom work that is never rendered or scheduled.

### 4.3 Explicit User Choice UI Flow
When expanding an unassigned/empty leaf node (or clicking "Add Inside" on it):
1. **Presentation:** An explicit 2-option selection modal or bottom sheet appears:
   - **Option A — Sub-items (Child Branches):**
     - Title: "Break down into sub-items"
     - Subtitle: "Create child topics, modules, or milestones inside this goal."
     - Icon: `FolderPlus` (accented with primary brand color).
   - **Option B — Checklist Steps:**
     - Title: "Add checklist steps"
     - Subtitle: "Turn this into an actionable task with checklist steps."
     - Icon: `ListChecks` (accented with primary brand color).
2. **Explicit Decision:** The user taps their preferred choice. The editor never guesses or silently assumes.

### 4.4 State Transitions & Conversion Rules
| Current Node State | User Action | Transition Logic |
|--------------------|-------------|------------------|
| Empty Leaf (`children: []`, `steps: []`) | Choose "Sub-items" | Appends child `GoalNode`s to `children`. Node becomes a Branch. |
| Empty Leaf (`children: []`, `steps: []`) | Choose "Checklist Steps" | Appends strings to `steps`, initializes `stepDone` with `false`. Node becomes an Executable Task. |
| Executable Task (has steps, `children: []`) | Choose "Add Sub-items" | **Conversion Dialog:**<br>1. *Convert steps to sub-items:* Each step title becomes a new child `GoalNode` (`kind: 'node'`, `title: step`). Node's `steps` and `stepDone` are cleared.<br>2. *Discard steps:* Existing steps removed; new child nodes created.<br>3. *Cancel:* No change. |
| Branch (`children.length > 0`) | Choose "Add Checklist Steps" | UI informs: "This item contains sub-items. Add checklist steps to its sub-items, or remove all sub-items to make this a single task." |
| Any Node with Active Focus Session | Attempt Conversion | Blocked: "Finish active focus session before restructuring this task." |

---

## 5. Deep Specification for R2: Bulk "Add Inside"

### 5.1 Selection & Target Resolution
- **Multi-Node Selection:** User selects $K$ nodes ($K \ge 1$) using checkboxes or select mode.
- **Target Container Resolution:** Every selected node ID $id \in S$ is treated as a target container.
- If both a parent node and a child node are selected, both receive the added items inside them.
- All newly created nodes receive globally unique identifiers via `uid('goal')`.

### 5.2 Input Modalities
The Add Inside sheet provides three streamlined input modes:
1. **Single Item (`mode: 'one'`):**
   - Single clean input field with autofocus. Pressing `Enter` adds the item immediately.
2. **Multi-line List (`mode: 'list'`):**
   - Clean textarea where each line represents an item (e.g., pasted syllabus or table of contents).
   - Empty lines and leading/trailing whitespace are stripped.
3. **Numbered Pattern (`mode: 'numbered'`):**
   - Prefix field: e.g. "Lecture", "Chapter", "Problem".
   - Start integer: min 0, default 1.
   - Count integer: min 1, max 100, default 5.
   - Generates: `["Lecture 1", "Lecture 2", ..., "Lecture 5"]`.

### 5.3 Normalization & Deduplication Algorithm
```ts
function normalizeBlueprintTitles(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, ' ');
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
```
**Per-Parent Sibling Deduplication:**
- When adding child nodes to parent $P$:
  - Existing child titles on $P$ are gathered into a case-insensitive set $E_P$.
  - Only titles $t \notin E_P$ are instantiated as new `GoalNode`s and appended to $P.children$.
  - If a title already exists in $P$, it is skipped on $P$ without throwing an error.
  - If parent $Q$ does not have title $t$, $t$ is added to $Q$.
- When adding checklist steps to task $T$:
  - Existing steps on $T$ are gathered into a case-insensitive set $E_T$.
  - Only steps $s \notin E_T$ are appended to $T.steps$ (and `false` to $T.stepDone$).

---

## 6. Deep Specification for R3: Bulk Step Editing (Diffing)

### 6.1 Mathematical Formulation
Let $T = \{t_1, t_2, \dots, t_k\}$ be the set of selected executable task nodes.
Each task $t_i$ has an ordered step list $L(t_i) = [s_{i,1}, s_{i,2}, \dots, s_{i,m_i}]$ and completion states $D(t_i) = [d_{i,1}, d_{i,2}, \dots, d_{i,m_i}]$.
Normalized step key: $key(s) = \text{trim}(s)\text{.toLocaleLowerCase()}$.

1. **Collective Union Representation:**
   The bulk editor displays the distinct union of all steps:
   $$U = \bigcup_{i=1}^k \{ s \in L(t_i) \}$$
   For each distinct step $s \in U$, compute prevalence:
   $$\text{count}(s) = |\{ t_i \in T \mid \exists s' \in L(t_i), key(s') = key(s) \}|$$
   Display badge:
   - If $\text{count}(s) = k$: "In all $k$ tasks" (accented chip).
   - If $\text{count}(s) < k$: "In $\text{count}(s)$ of $k$ tasks" (subtle chip).

2. **Diff State Tracking:**
   - **Pending Additions Set $A$:** Ordered list of new step titles added by the user in the editor.
   - **Pending Removals Set $R$:** Set of normalized step keys marked for deletion by the user.

3. **Applying the Diff (Diffing Engine):**
   For each selected task $t_i$:
   ```ts
   // Phase 1: Set-Difference (Removals)
   const currentSteps = t_i.steps ?? [];
   const currentDone = t_i.stepDone ?? currentSteps.map(() => false);
   const preservedSteps: string[] = [];
   const preservedDone: boolean[] = [];

   for (let idx = 0; idx < currentSteps.length; idx++) {
     const step = currentSteps[idx];
     const isDone = Boolean(currentDone[idx]);
     const stepKey = step.trim().toLocaleLowerCase();

     if (R.has(stepKey)) {
       // Step marked for deletion
       if (isDone && !overrideProtectCompleted) {
         // Protect completed work
         preservedSteps.push(step);
         preservedDone.push(isDone);
       } else {
         // Step removed from t_i!
         // (If step was not present in another task, that task never enters this block)
       }
     } else {
       // Step kept
       preservedSteps.push(step);
       preservedDone.push(isDone);
     }
   }

   // Phase 2: Set-Union (Additions)
   const existingKeys = new Set(preservedSteps.map(s => s.trim().toLocaleLowerCase()));
   for (const newStep of A) {
     const newKey = newStep.trim().toLocaleLowerCase();
     if (!existingKeys.has(newKey)) {
       preservedSteps.push(newStep);
       preservedDone.push(false);
       existingKeys.add(newKey);
     }
     // If t_i already has newStep, it is skipped silently (no duplicate)
   }

   t_i.steps = preservedSteps;
   t_i.stepDone = preservedDone;
   t_i.completed = preservedSteps.length > 0 && preservedDone.every(Boolean);
   ```

### 6.2 Key Behavioral Guarantees
- **No Duplicates:** Adding a step that already exists on some or all selected tasks skips those tasks without creating duplicate steps.
- **Silent Skip on Removal:** Deleting a step that is only present on 2 out of 5 selected tasks removes it from the 2 tasks and silently skips the remaining 3 tasks without error.
- **Completed Step Protection:** Steps marked as done are preserved by default, preventing accidental data/progress loss during bulk refactoring.
- **Order Stability:** Preserved existing steps retain their original relative order. New steps are cleanly appended.

---

## 7. Deep Specification for R4: Bulk & Individual Date Changing

### 7.1 Data Contracts & Formats
- **Field Definitions on `GoalNode`:**
  - `startDate?: string` — ISO 8601 calendar date (`YYYY-MM-DD`). The intended kickoff date.
  - `endDate?: string` — ISO 8601 calendar date (`YYYY-MM-DD`). The hard target/deadline date.
- **Local Timezone Discipline:** All date calculations use local calendar dates via `localISODate(new Date())` from `src/lib/dates.ts` to prevent UTC midnight rollover discrepancies.

### 7.2 Validation Rules
1. **Date Range Invariant:** For any node, if both `startDate` and `endDate` are defined:
   $$\text{startDate} \le \text{endDate}$$
2. **Bulk Setting Validation:**
   - When bulk setting both Start Date ($D_s$) and Deadline ($D_e$): Validate $D_s \le D_e$. If $D_s > D_e$, show validation error and disable Apply.
   - When bulk setting only Deadline ($D_e$):
     - For each selected node $n$:
       - If $n.\text{startDate}$ exists and $n.\text{startDate} > D_e$:
         - Automatically clear $n.\text{startDate}$ or set $n.\text{startDate} = D_e$ with an informative notice: "Adjusted conflicting start dates on $M$ items."
   - When bulk setting only Start Date ($D_s$):
     - For each selected node $n$:
       - If $n.\text{endDate}$ exists and $n.\text{endDate} < D_s$:
         - Automatically clear $n.\text{endDate}$ or set $n.\text{endDate} = D_s$.

### 7.3 Fast Date Presets
The Date Editor provides 1-tap quick presets:
- **Today:** `todayISO()`
- **Tomorrow:** `tomorrowISO()`
- **End of This Week:** Sunday of current local calendar week.
- **In 2 Weeks:** `shiftLocalISO(todayISO(), 14)`
- **In 1 Month:** `shiftLocalISO(todayISO(), 30)`
- **Clear Start Date:** Sets `startDate = undefined`
- **Clear Deadline:** Sets `endDate = undefined`
- **Clear All Dates:** Sets both to `undefined`

### 7.4 Date Propagation Policy
- By default, dates set on a selected node do **NOT** automatically cascade to overwrite child node dates. Child nodes are autonomous sub-milestones with their own schedules.
- An optional checkbox in the Date Editor: `"Apply dates to all nested sub-items"` allows explicit user-driven cascading when desired.

---

## 8. Deep Specification for R5: Soothing & Simple UI/UX

### 8.1 Design Principles
1. **Calm Visual Hierarchy:**
   - Soft, low-contrast background surfaces (`var(--bg-base)`, `var(--bg-surface)`).
   - Generous padding and touch targets (minimum 44px height for interactive elements).
   - Crisp, legible typography with subdued secondary labels (`var(--text-secondary)`).
   - Clear visual status tags (e.g. `Due today`, `3 days left`, `Pinned`).
2. **Single Surface, Minimal Modals:**
   - Eliminate deep nested modals and cascading disclosures.
   - All editing occurs via clean, sliding bottom sheets with a clear `Cancel` and primary action button.
3. **Frictionless Multi-Selection:**
   - Dedicated Select Mode button in the toolbar (toggleable) OR visible circular checkboxes on item cards.
   - Immediate feedback on selection count: "3 selected".
   - Tapping the item body navigates inside; tapping the select checkbox toggles selection.
   - Smooth floating bottom action bar when $\ge 1$ items selected.

### 8.2 Component Hierarchy & Structure
```
BlueprintStudio (Root Overlay)
├── StudioHeader
│   ├── BackButton (navigates up hierarchy or exits)
│   ├── BreadcrumbTrail (scrollable path: Goals › Subject › Chapter)
│   ├── DraftStatusBadge ("Draft", "Unsaved changes")
│   ├── UndoRedoControls
│   └── ReviewSaveButton ("Review & Save")
├── StudioWorkspace (Main Scroll View)
│   ├── LocationHeading (current branch title & description)
│   ├── SearchFilterBar (instant filter by name)
│   ├── ItemList (cards for direct children)
│   │   └── ItemCard
│   │       ├── SelectCheckbox (touch-friendly)
│   │       ├── TypeIcon (Target / Folder / ListChecks)
│   │       ├── Title & Subtitle (items count, steps count, timing badge)
│   │       └── NavigateChevron / QuickActions
│   └── EmptyState (inviting "Add your first item" prompt)
├── FloatingSelectionBar (appears when selected.length > 0)
│   ├── SelectionCount & DeselectButton
│   └── ActionButtons:
│       ├── AddInsideButton ("Add Inside")
│       ├── StepsButton ("Checklist")
│       ├── DatesButton ("Dates")
│       ├── EditButton ("Edit Details")
│       └── DeleteButton ("Delete")
└── SheetOverlays (single active sheet at a time)
    ├── AddInsideSheet (Choice: Sub-items vs Steps; Single / List / Numbered)
    ├── BulkStepsDiffSheet (Union of steps, chips, inline add, strikethrough remove)
    ├── DatesSheet (Start & Deadline pickers, quick presets)
    ├── EditDetailsSheet (Title & description)
    └── ReviewSaveSheet (Diff overview, save confirmation)
```

---

## 9. Data Contracts & Interfaces

```ts
import type { GoalKind, GoalNode, Task } from '../types';

/** Core props contract connecting BlueprintStudio to YouDO App */
export interface BlueprintStudioProps {
  open: boolean;
  goals: GoalNode[];
  initialPathIds?: string[];
  activeGoalNodeId?: string;
  onClose: () => void;
  onCommit: (
    baseGoals: GoalNode[],
    nextGoals: GoalNode[],
    summary: string
  ) => { ok: boolean; error?: string; token?: string };
}

/** Expansion mode choice for R1 */
export type NodeExpansionChoice = 'children' | 'steps';

/** Bulk Add Inside payload for R2 */
export interface BulkAddPayload {
  targetNodeIds: string[];
  type: 'children' | 'steps';
  mode: 'one' | 'list' | 'numbered';
  titles: string[];
  description?: string;
}

/** Bulk Step Diffing payload for R3 */
export interface BulkStepDiffPayload {
  targetNodeIds: string[];
  addSteps: string[];       // Set-Union
  removeSteps: string[];    // Set-Difference (normalized titles)
  renames?: Record<string, string>; // originalTitle -> newTitle
  overrideProtectCompleted?: boolean;
}

/** Bulk Dates payload for R4 */
export interface BulkDatePayload {
  targetNodeIds: string[];
  startDate?: string | null;  // null = clear
  endDate?: string | null;    // null = clear
  cascadeToChildren?: boolean;
}

/** Draft History Record for Undo/Redo */
export interface DraftHistoryEntry {
  before: GoalNode[];
  after: GoalNode[];
  summary: string;
}
```

---

## 10. Acceptance Criteria & Verification Matrix

### 10.1 Automated Verification (Vitest Suite)
| ID | Requirement | Test Case Description | Expected Result |
|----|-------------|-----------------------|-----------------|
| T1 | R1: Expansion | Create empty leaf -> add steps -> verify leaf is task with steps and `children: []`. | Node has `steps.length > 0`, `children.length === 0`. |
| T2 | R1: Expansion | Create empty leaf -> add child nodes -> verify node has `children.length > 0` and `steps: []`. | Node has `children.length > 0`, `steps: []`. |
| T3 | R1: Expansion | Node with steps converted to child nodes -> verify steps become child nodes and steps cleared. | Steps converted to child `GoalNode`s, `steps: []`. |
| T4 | R2: Bulk Add | Select 3 parent nodes -> add `['Topic 1', 'Topic 2']` inside -> Parent 1 already has `Topic 1`. | Parent 1 gets only `Topic 2`; Parents 2 & 3 get both. All IDs unique. |
| T5 | R2: Bulk Add | Numbered sequence generation `prefix='Part', start=1, count=3`. | Produces `['Part 1', 'Part 2', 'Part 3']`. |
| T6 | R3: Bulk Diff | Tasks A `['A', 'B']`, B `['B', 'C']` -> Bulk Add `['C', 'D']`. | Task A gets `['A', 'B', 'C', 'D']`; Task B gets `['B', 'C', 'D']`. No duplicates. |
| T7 | R3: Bulk Diff | Tasks A `['A', 'B']`, B `['C']` -> Bulk Remove `['A']`. | Task A gets `['B']`; Task B remains `['C']` (silent skip, no errors). |
| T8 | R3: Bulk Diff | Tasks A `['A', 'B']` where `'A'` is completed (`stepDone[0] = true`) -> Bulk Remove `['A']`. | `'A'` is protected and retained on Task A; incomplete steps removed. |
| T9 | R4: Dates | Single node date update with valid `startDate='2026-10-01'`, `endDate='2026-10-15'`. | Dates set correctly on node. |
| T10 | R4: Dates | Bulk date update across 4 selected nodes -> set deadline to `'2026-11-01'`. | All 4 nodes have `endDate='2026-11-01'`. |
| T11 | R4: Dates | Bulk date conflict: Node has `startDate='2026-11-10'`, user bulk sets `endDate='2026-11-01'`. | Conflict handled: Start date cleared or adjusted to maintain `startDate <= endDate`. |
| T12 | R4: Dates | Bulk Clear Dates: Nodes with existing dates cleared. | `startDate` and `endDate` become `undefined` across all selected items. |

### 10.2 Agent-as-Judge & Manual Acceptance Checklist
- [ ] **R1 Choice Clarity:** Expanding an empty node explicitly offers "Add Sub-items (Children)" vs "Add Checklist Steps".
- [ ] **R2 Bulk Add Children:** Multiple selected nodes receive child items simultaneously without duplicating existing sibling titles.
- [ ] **R3 Bulk Steps Set-Union:** Adding steps in bulk adds to all selected tasks without creating duplicates on tasks that already had them.
- [ ] **R3 Bulk Steps Set-Difference:** Removing steps in bulk removes them from all selected tasks that had them and silently skips tasks that didn't.
- [ ] **R4 Bulk Dates:** Setting start date and deadline across multiple selected nodes applies correctly and preserves ISO formatting.
- [ ] **R5 Soothing Aesthetic:** Clean UI with generous touch targets, clear typography, soothing pastel/neutral tones, and zero jarring modal jumps.
- [ ] **Session & Plan Safety:** Attempting to alter or delete an actively running focus task is prevented with an informative message.
