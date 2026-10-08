# Codebase Architecture Analysis: Project YouDO & Blueprint Studio

**Date**: 2026-10-08  
**Explorer**: explorer_survey_1  
**Project Directory**: `d:\Production\Projects\YouDO`  

---

## Executive Summary

1. **Technology Stack Correction**:
   The project is **NOT** a Flutter/Dart application (there is no `pubspec.yaml` or Dart code). Project YouDO is a **React 18 + TypeScript 5.5 + Vite 6 + Tailwind CSS 3.4 + Capacitor 8.5** web & mobile application. The `android/` directory is Capacitor's Android native bridge.
2. **State Management**:
   Global state is managed via React Context and custom hooks in `src/store.tsx` (`useStore`, `useSessionStore`), persisted locally through `localStorage` / `@capacitor/filesystem` and synced optionally with Supabase (`@supabase/supabase-js`).
3. **Blueprint Studio Architectural Decoupling**:
   `BlueprintStudio` is completely modular and isolated from the rest of the app. It is dynamically imported (`lazy`) in `src/App.tsx` and opened as a full-screen overlay modal. It accepts an immutable snapshot of `goals: GoalNode[]`, works on a local draft, and calls `onCommit(baseGoals, nextGoals, summary)` on save.
4. **Current Implementation vs User Requirements**:
   - **R1 (Flexible Node Expansion)**: Currently, endpoint nodes that contain checklist steps are strictly blocked from adding child nodes (`blocked += 1` in `addBlueprintChildren`). There is no explicit user-driven prompt/fork allowing the user to choose between "Add Checklist Steps (Executable Task)" vs "Add Child Items (Branch/Folder)".
   - **R2 (Bulk "Add Inside")**: Multi-parent addition is supported at the domain layer (`addBlueprintChildren`), but the UI is buried in multi-tab modal forms (`StudioAddForm`), obstructed by rigid execution-state blocking and cumbersome touch/selection interaction.
   - **R3 (Bulk Step Editing / Diffing)**: The domain functions `addBlueprintSteps` and `removeBlueprintSteps` exist separately, but the UI lacks a unified diff editor. Users cannot simultaneously view, add (set-union), and remove (set-difference) steps across selected nodes in one coherent screen.
   - **R4 (Bulk & Individual Date Changing)**: Target dates (`startDate`) and deadlines (`endDate`) exist on `GoalNode`, but editing them in bulk is buried under collapsible `<details>` disclosures with checkboxes inside a generic item edit form.
   - **R5 (Soothing & Simple UI/UX)**: The existing Studio UI consists of 407 lines in `BlueprintStudio.tsx`, 558 lines in `StudioForms.tsx`, and 276 lines in `studio.css`. It features nested modals, 420ms long-press selection timers, multi-level tabs, and dense menus that overwhelm users. Rebuilding this interface into a calm, streamlined tree editor with clear direct manipulation will vastly elevate the product.

---

## 1. Project Layout & Dependencies

### 1.1 Tech Stack & Runtime Environment
- **Core Framework**: React `18.3.1` + ReactDOM `18.3.1`
- **Language**: TypeScript `5.5.3` (configured via `tsconfig.json` and `tsconfig.app.json`)
- **Build Tool**: Vite `6.4.3` (`@vitejs/plugin-react` 4.7.0)
- **Styling**: Tailwind CSS `3.4.1`, PostCSS `8.4.35`, Autoprefixer `10.4.18`
- **Iconography**: `lucide-react` `0.344.0`
- **Mobile Container**: Capacitor `8.5.0` (`@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/haptics`, `@capacitor/filesystem`, `@capacitor/local-notifications`, `@capacitor/share`, `@capacitor/status-bar`, `@capacitor-community/keep-awake`)
- **Backend / Database**: Supabase `@supabase/supabase-js` `2.57.4`, `@electric-sql/pglite` `0.5.8`
- **Testing**: Vitest `4.1.11` (44 test suites, 464 passing unit tests)

### 1.2 Key Project Files
```
d:\Production\Projects\YouDO\
├── package.json               # Scripts: dev, build, test, typecheck, lint
├── vite.config.ts             # Vite configuration with PWA plugin
├── tailwind.config.js         # Design token colors, text, borders, shadows
├── src/
│   ├── main.tsx               # App entrypoint
│   ├── App.tsx                # Top-level shell, overlays, views router
│   ├── store.tsx              # Central state store (StoreProvider, useStore)
│   ├── types.ts               # Core TypeScript models (GoalNode, Task, Session)
│   ├── index.css              # Global tokens and utility styling
│   ├── components/
│   │   ├── BlueprintStudio.tsx  # Blueprint Studio entry component
│   │   ├── GoalView.tsx         # Daily goal tree viewer & navigator
│   │   ├── AddGoalSheet.tsx     # Single goal/item creation sheet
│   │   ├── StepListEditor.tsx   # Reusable checklist step editor
│   │   └── studio/              # Studio subcomponents & css
│   │       ├── StudioControls.tsx
│   │       ├── StudioForms.tsx
│   │       ├── AIPlanFlow.tsx
│   │       └── studio.css
│   └── lib/
│       ├── goalTree.ts          # Core hierarchical tree algorithms
│       ├── blueprintStudio.ts   # Studio-specific tree transformations
│       ├── studioWorkspace.ts   # Studio draft & patch operations
│       ├── dates.ts             # ISO date utilities
│       └── ids.ts               # Unique ID generators
```

---

## 2. Existing Blueprint Studio & Data Models

### 2.1 Data Models (`src/types.ts`)

#### `GoalNode`
```typescript
export type GoalKind = 'goal' | 'node' | 'phase' | 'section' | 'task' | 'sub' | 'leaf';

export interface GoalNode {
  id: string;
  kind: GoalKind;              // 'goal' for top-level root; 'node' for universal items
  title: string;
  description?: string;
  startDate?: string;          // ISO date (YYYY-MM-DD), target start date
  endDate?: string;            // ISO date (YYYY-MM-DD), deadline / target end date
  children: GoalNode[];        // Recursive ordered sub-nodes
  steps?: string[];            // Checklist item labels (for actionable endpoint tasks)
  stepDone?: boolean[];        // Parallel completion flags
  completed?: boolean;         // True when all steps done or manually toggled
  todayTaskId?: string | null; // ID of mirrored scheduled card in daily task list
  pinned?: boolean;            // Pinned bookmark
  createdAt: number;
}
```

#### Node Roles & Structural Hierarchy
In `src/lib/goalTree.ts`:
- **Goal (`node.kind === 'goal'`)**: Root-level container.
- **Branch (`node.children.length > 0`)**: Any non-root node that has sub-nodes.
- **Task / Endpoint (`node.children.length === 0`)**: Any node with 0 children. It may have `steps: string[]` (micro-steps).
- **Execution State (`hasGoalExecutionState(node)`)**: True if `todayTaskId`, `completed`, `steps.length > 0`, or any `stepDone` is true.

### 2.2 Studio Architecture & State Flow

```
┌─────────────────────────────────────────────────────────────┐
│                          App.tsx                            │
│  - goalPathIds: string[]                                    │
│  - activeGoalNodeId: string (from activeSession)            │
│  - blueprintStudioOpen: boolean                             │
└───────────────┬──────────────────────────────▲──────────────┘
                │ props                        │ onCommit(base, next, summary)
                ▼                              │
┌──────────────────────────────────────────────┴──────────────┐
│                    BlueprintStudio.tsx                      │
│  Local Draft State:                                         │
│    - baseGoals: GoalNode[] (snapshot)                       │
│    - draft: GoalNode[] (working copy)                       │
│    - past / future: DraftChange[] (local undo/redo)         │
│    - selected: string[] (multi-selection)                   │
│    - parentIds: string[] (current drill-down level)         │
└───────────────┬──────────────────────────────▲──────────────┘
                │ transformations              │
                ▼                              │
┌─────────────────────────────────────────────────────────────┐
│      Pure Domain Functions (src/lib/blueprintStudio.ts)     │
│  - addBlueprintChildren()                                   │
│  - addBlueprintSteps()                                      │
│  - removeBlueprintSteps()                                   │
│  - patchStudioItems()                                       │
│  - canMoveStudioItems() / moveStudioItems()                 │
│  - duplicateStudioItems()                                   │
│  - reconcileBlueprintTasks()                                │
└─────────────────────────────────────────────────────────────┘
```

When saving:
1. `BlueprintStudio` calls `onCommit(baseGoals, draft, summary)`.
2. `App.tsx` calls `applyGoalTreeChange(baseGoals, draft)` in `store.tsx`.
3. `store.tsx`:
   - Checks if `baseGoals` matches `currentGoals` (rejects stale concurrent edits).
   - Recomputes completions with `recomputeCompleted`.
   - Reconciles linked daily tasks with `reconcileBlueprintTasks(tasks, nextGoals, currentGoals)`.
   - Validates that active focus sessions are not invalidated.
   - Pushes an undo transaction token (`undoGoalTreeChange`).
   - Updates `goals` and `tasks` state.

---

## 3. Analysis of Existing Bulk Editing & Bulk-Add Logic

### 3.1 Existing "Bulk-Add" (`addBlueprintChildren`)
Found in `src/lib/blueprintStudio.ts` (lines 60-92):
- **Inputs**: `goals: GoalNode[]`, `parentIds: string[]`, `kind: GoalKind`, `rawTitles: string[]`
- **Behavior**:
  - Trims, collapses whitespace, and eliminates case-insensitive duplicates among input titles (`normalizeBlueprintTitles`).
  - Iterates over each distinct `parentId`.
  - Checks if parent is blocked:
    ```typescript
    if (parent.kind !== 'goal' && isGoalEndpoint(parent) && hasGoalExecutionState(parent)) {
      blocked += 1;
      continue;
    }
    ```
  - For unblocked parents, filters out any title already existing among its siblings (`existing.has(title.toLocaleLowerCase())`).
  - Creates new `GoalNode`s and appends them to `parent.children`.
- **Strengths**:
  - Pure, immutable tree transformation.
  - Generates unique IDs for each new node.
  - Automatically skips sibling duplicates.
- **Flaws & Limitations**:
  - **Rigid Blocking**: If a node has checklist steps (`steps.length > 0`), it is completely blocked from adding children (`blocked += 1`), forcing the user to delete checklist steps first or abort.
  - **No User Choice**: The user is never offered a clean choice to convert or restructure an endpoint.

### 3.2 Existing Step Addition & Removal (`addBlueprintSteps`, `removeBlueprintSteps`)
Found in `src/lib/blueprintStudio.ts` (lines 108-183):
- `addBlueprintSteps(goals, nodeIds, rawSteps)`:
  - Appends missing steps to endpoint tasks.
  - Skips steps that already exist on that node (case-insensitive).
  - Appends `false` to `stepDone`.
- `removeBlueprintSteps(goals, nodeIds, rawSteps)`:
  - Finds matching steps by title.
  - Skips removing steps that are marked `stepDone = true` (`protectedCompleted += 1`).
  - Deletes matching uncompleted steps.
- **Flaws & Limitations**:
  - In the UI (`StudioForms.tsx`), `addBlueprintSteps` is only accessible through `StudioAddForm(kind='steps')`.
  - `removeBlueprintSteps` is only accessible through `StudioChecklistForm`.
  - There is **no single diffing view** where a user can see the steps across multiple selected nodes, add new steps, delete existing steps, and preview the resulting set-union and set-difference.

### 3.3 Existing Date Editing
Found in `src/lib/studioWorkspace.ts` (`patchStudioItems`):
- `patchStudioItems(goals, patches)` takes `Record<string, StudioPatch>`.
- `StudioPatch` supports `startDate` and `endDate`.
- In `StudioEditForm`:
  - Single node: Start date and Deadline inputs are tucked under `<details className="studio-disclosure">` ("Dates & pin").
  - Bulk mode: User must check a checkbox `[ ] Change dates` before start date and deadline inputs appear.
  - There is no dedicated, quick date changer for single or multiple items.

---

## 4. UI/UX Layer Analysis

### 4.1 Existing Layout & Navigation Pattern
- **Folder Drill-Down Model**:
  The current Studio is structured as a hierarchical folder browser rather than a bird's-eye tree editor:
  - Only direct children of the active `parentIds` are visible.
  - Navigating deeper requires clicking the chevron (`visit([node.id])`).
  - Navigating up requires breadcrumb clicks or swiping.
  - When multiple nodes from different branches are selected, it attempts to render grouped sections (`is-multi`), which is visually disjointed.
- **Selection Ergonomics**:
  - To enter selection mode, users must **long-press (420ms)** with less than 6px drift. This is completely non-obvious on desktop and frustrating on mobile.
  - A bottom `studio-selection-bar` appears with 5 tiny icon buttons (Edit, Move, Duplicate, More, Delete) plus stacked contextual buttons.
- **Design Tokens & Theme**:
  The app defines unified semantic variables in `index.css` and `tailwind.config.js`:
  - Backgrounds: `var(--bg-base)` (#171612), `var(--bg-surface)` (#22201b), `var(--bg-elevated)` (#2c2923)
  - Primary: `var(--primary)` (#d4a843 amber/gold), `var(--primary-soft)` (rgba(212,168,67,0.12)), `var(--on-primary)`
  - Secondary/Success: `var(--secondary)` (#5ea578 sage/green), `var(--secondary-soft)`
  - Text: `var(--text-primary)` (#f5efe6), `var(--text-secondary)` (#a89f91), `var(--text-muted)` (#6e6659)
  - Borders: `var(--border)` (rgba(255,255,255,0.08)), `var(--border-subtle)` (rgba(255,255,255,0.04))

---

## 5. Architectural Blueprint for Rebuilding Blueprint Studio

To satisfy **R1 through R5** while keeping the codebase clean, robust, and maintainable, we recommend the following modular architecture:

```
src/components/studio/
├── BlueprintStudio.tsx          # Main entry & top-level controller (modal shell)
├── StudioTree.tsx               # Streamlined visual tree editor (clean cards/nodes)
├── StudioToolbar.tsx            # Header actions, search, undo/redo, save/review
├── StudioSelectionBar.tsx       # Bottom floating action bar when nodes are selected
├── StudioNodeExpansionModal.tsx # R1: Choice between Checklist Steps vs Child Nodes
├── StudioBulkAddModal.tsx       # R2: Bulk "Add Inside" sheet (single/list/numbered)
├── StudioBulkStepDiffModal.tsx  # R3: Unified Bulk Step Diff Editor (union/diff)
├── StudioDateModal.tsx          # R4: Bulk & individual target date / deadline picker
└── studio.css / Tailwind        # Clean, soothing styling aligned with YouDO theme
```

### 5.1 Requirement Mapping to Architectural Modules

| Requirement | Proposed Module | Core Logic & Domain Operations |
|---|---|---|
| **R1. Flexible Node Expansion** | `StudioNodeExpansionModal.tsx` | Presents an explicit, soothing fork: **"Add Checklist Steps"** (configures node as executable task with steps) vs **"Add Child Items"** (turns node into a branch/folder with nested nodes). If converting a node with existing steps, safely offers to convert steps to child nodes or clear them. |
| **R2. Bulk "Add Inside"** | `StudioBulkAddModal.tsx` | Allows selecting multiple nodes and adding items inside all of them simultaneously. Supports single name, multi-line list, or numbered pattern. Uses `addBlueprintChildren` with duplicate skipping and live preview ("Adding 3 items to 4 selected nodes = 12 total"). |
| **R3. Bulk Step Editing (Diffing)** | `StudioBulkStepDiffModal.tsx` | A unified step diffing screen. Shows union of steps across selected items. User can add new steps (added to all selected, skipping duplicates) and remove steps (deleted from all selected, skipping missing). Implements pure set-union / set-difference diffing. |
| **R4. Bulk & Individual Dates** | `StudioDateModal.tsx` | Clean modal for Target Date (`startDate`) and Deadline (`endDate`). When 1 node is selected, edits its dates. When multiple nodes are selected, edits or clears dates across all selected items simultaneously via a pure `setGoalDates` domain helper. |
| **R5. Soothing & Simple UI/UX** | All components + unified CSS | Clear visual hierarchy, explicit selection mode toggle (no 420ms long-press guessing), soothing colors, generous touch targets, calm spacing, and zero nested modal layers. |

### 5.2 Clean Pure Domain Helpers to Add/Standardize in `src/lib/blueprintStudio.ts`

1. **`setGoalDates(goals: GoalNode[], nodeIds: string[], dates: { startDate?: string | null; endDate?: string | null }): GoalNode[]`**:
   - Updates `startDate` and `endDate` across all matching nodes immutably.
   - Supports clearing (`null` or `""` deletes or clears the date).
   - Validates that `endDate >= startDate` when both are present.
2. **`diffBlueprintSteps(goals: GoalNode[], nodeIds: string[], additions: string[], deletions: string[]): GoalNode[]`**:
   - Single atomic transaction:
     - Adds `additions` to each selected endpoint using set-union (skipping existing titles case-insensitively).
     - Removes `deletions` from each selected endpoint using set-difference (skipping missing titles).
     - Keeps `stepDone` completion state aligned.
3. **`convertEndpointToBranch(goals: GoalNode[], nodeId: string, convertStepsToChildren: boolean): GoalNode[]`**:
   - Gracefully supports R1: if an endpoint with steps is expanded into a branch, user can choose whether existing steps become child nodes or are cleared.

---

## 6. Verification & Test Plan

1. **Unit Testing (`vitest`)**:
   - Test `addBlueprintChildren` with multi-parent selections across different hierarchy depths.
   - Test `diffBlueprintSteps` for set-union additions without duplicates, and set-difference removals skipping absent steps.
   - Test `setGoalDates` for single and bulk date updates, date clearing, and validation.
   - Test node expansion logic (steps vs children).
2. **Typecheck & Build**:
   - Run `npm run typecheck` to verify no TS errors.
   - Run `npm run build` to verify Vite bundle compilation and CSS extraction.
3. **Manual / Functional Verification**:
   - Open Blueprint Studio from `GoalView`.
   - Select multiple nodes from different branches.
   - Add items inside all selected nodes -> verify child nodes appear in each.
   - Bulk-edit steps -> verify set-union additions and set-difference removals work without duplicates.
   - Bulk-edit dates -> verify start date and deadline update across all selected items.
   - Save blueprint -> verify changes persist to main goal view and tasks reconcile cleanly.
