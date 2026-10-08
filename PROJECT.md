# Project: YouDO Blueprint Studio Rebuild

## Architecture
Blueprint Studio is the goal tree visual editor and bulk operations workspace for the YouDO productivity suite. It operates as a modal overlay decoupled from global state:
- **Boundary**: `src/App.tsx` renders `BlueprintStudio` with props `(open, goals, initialPathIds, activeGoalNodeId, onClose, onCommit)`.
- **Transaction Safety**: All edits occur on a local draft copy of `GoalNode[]` with an undo/redo stack. Edits commit atomically through `onCommit(base, next, title)`, which invokes `applyGoalTreeChange` in `src/store.tsx` with tree verification and task reconciliation.
- **Layers**:
  1. **Domain Logic Layer (`src/lib/blueprintStudio.ts`, `src/lib/studioWorkspace.ts`)**: Pure TypeScript functions handling tree mutations, set-union/difference step diffing, bulk child generation, and date updates.
  2. **Headless State Controller Layer (`src/components/studio/blueprintStudioState.ts`)**: Pure state reducer managing multi-selection, modal views, draft transactions, and action dispatchers.
  3. **UI / Presentation Layer (`src/components/BlueprintStudio.tsx`, `src/components/studio/*`)**: Soothing, clutter-free React components utilizing Tailwind CSS tokens (`surface`, `primary`, `border`, `elevated`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1. Flexible Node Expansion | Explicit, user-driven choice when expanding a node: add checklist steps (task) vs add child nodes (branch/folder) | M1, M3, M4 | ORIGINAL_REQUEST §R1 |
| 2 | R1. Transition & Conversion | Gracefully handle adding children to a node with steps (convert or clear steps without hard crashes) | M1, M4 | spec_miner_survey_1 |
| 3 | R2. Bulk "Add Inside" | Select multiple nodes and add child items inside all selected nodes simultaneously | M1, M4 | ORIGINAL_REQUEST §R2 |
| 4 | R2. Sibling Deduplication & UID | Per-parent sibling title deduplication; fresh unique UIDs (`uid('goal')`) for every added node | M1, M2 | spec_miner_survey_1 |
| 5 | R2. Flexible Input Formats | Parse single items, multi-line lists, and numbered lists into child nodes | M1, M4 | explorer_survey_1 |
| 6 | R3. Unified Bulk Step Diffing | Single modal/editor displaying existing steps across selected nodes with prevalence indicators | M1, M3, M4 | ORIGINAL_REQUEST §R3 |
| 7 | R3. Step Additions (Set-Union) | Add new steps to all selected nodes; skip if node already has exact step (zero duplicates) | M1, M2 | ORIGINAL_REQUEST §R3 |
| 8 | R3. Step Removals (Set-Difference) | Remove steps from all selected nodes; silently skip nodes lacking the step without errors | M1, M2 | ORIGINAL_REQUEST §R3 |
| 9 | R3. Step Protection | Protect completed steps from deletion unless explicitly confirmed; protect active session task | M1, M4 | explorer_survey_1 |
| 10 | R4. Individual & Bulk Date Editing | Change target dates (`startDate`) and deadlines (`endDate`) for single node or multi-selected nodes | M1, M4 | ORIGINAL_REQUEST §R4 |
| 11 | R4. Date Validation & Presets | Enforce ISO `YYYY-MM-DD`, `startDate <= endDate`, conflict resolution, and 1-tap quick presets | M1, M4 | spec_miner_survey_1 |
| 12 | R5. Soothing & Simple UI/UX | Clean, calm visual tree hierarchy, unified Tailwind palette, fluid selection mode | M3, M4 | ORIGINAL_REQUEST §R5 |
| 13 | R5. Floating Action Bar | Calm bottom action bar appearing on selection with clear actions (Add Inside, Steps, Dates) | M4 | spec_miner_survey_1 |
| 14 | E2E & 4-Tier Test Suite | Comprehensive Vitest suite covering Tiers 1–4 and all 4 acceptance criteria | M2, M5 | explorer_survey_2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Domain & Algorithm Layer | Pure functional tree transformations in `blueprintStudio.ts` & `studioWorkspace.ts` (R1 conversion, R2 bulk add inside, R3 set-union/difference diffing, R4 dates) | none | DONE (573 tests passing) |
| M2 | E2E & Comprehensive Test Suite | 4-tier test suite in `src/lib/blueprintStudioE2E.test.ts` publishing `TEST_READY.md` | M1 | IN_PROGRESS (conv: 7ed53a42) |
| M3 | Headless State Controller | Headless state reducer `blueprintStudioState.ts` and unit tests managing selection, draft stack, and modal sheets | M1 | IN_PROGRESS (conv: 19ec832b) |
| M4 | UI/UX Rebuild: Tree & Modals | Soothing React UI rebuild in `BlueprintStudio.tsx` and modular components (`StudioTree`, `StudioActionBar`, `StudioNodeExpansionModal`, `StudioBulkAddModal`, `StudioBulkStepDiffModal`, `StudioDateModal`) | M1, M3 | PLANNED |
| M5 | Integration, E2E Pass & Audit | 100% E2E test pass, adversarial verification by Challenger, and Forensic Audit by teamwork_preview_auditor | M2, M4 | PLANNED |

## Interface Contracts
### `src/lib/blueprintStudio.ts` ↔ State Controller / UI
- `addBlueprintChildrenBulk(goals: GoalNode[], parentIds: string[], titles: string[]): { goals: GoalNode[]; count: number }`
  - Adds each title as child node under all matching parent nodes. Generates unique IDs. Skips duplicates per parent.
- `diffBlueprintSteps(goals: GoalNode[], targetNodeIds: string[], stepsToAdd: string[], stepsToRemove: string[]): { goals: GoalNode[]; affectedCount: number }`
  - Applies Set-Union additions (skipping existing) and Set-Difference removals (skipping non-existent without error).
- `setGoalDatesBulk(goals: GoalNode[], targetNodeIds: string[], dates: { startDate?: string; endDate?: string }): { goals: GoalNode[]; count: number }`
  - Applies startDate and/or endDate to target nodes. Validates ISO format and `startDate <= endDate`.
- `convertNodeToBranch(goals: GoalNode[], nodeId: string, initialChildTitles?: string[]): GoalNode[]`
  - Converts an empty node or node with steps into a branch container.
- `convertNodeToTask(goals: GoalNode[], nodeId: string, initialSteps?: string[]): GoalNode[]`
  - Converts an empty node into a task endpoint with steps.

### `src/components/BlueprintStudio.tsx` ↔ `src/App.tsx`
- Interface `BlueprintStudioProps`:
  ```ts
  export interface BlueprintStudioProps {
    open: boolean;
    goals: GoalNode[];
    initialPathIds?: string[];
    activeGoalNodeId?: string;
    onClose: () => void;
    onCommit: (base: GoalNode[], next: GoalNode[], title: string) => { ok: boolean; token?: string; error?: string };
  }
  ```

## Code Layout
- `src/lib/blueprintStudio.ts` — Core domain tree algorithms & bulk operations
- `src/lib/studioWorkspace.ts` — Studio workspace helpers
- `src/lib/blueprintStudio.test.ts` — Unit tests for domain algorithms
- `src/lib/blueprintStudioE2E.test.ts` — 4-tier requirement-driven E2E test suite
- `src/components/studio/blueprintStudioState.ts` — Headless state machine & reducer
- `src/components/studio/blueprintStudioState.test.ts` — Unit tests for headless reducer
- `src/components/studio/StudioTree.tsx` — Soothing tree view with checkboxes
- `src/components/studio/StudioActionBar.tsx` — Floating bottom action bar
- `src/components/studio/StudioNodeExpansionModal.tsx` — Explicit steps vs children choice modal
- `src/components/studio/StudioBulkAddModal.tsx` — Streamlined bulk "Add Inside" modal
- `src/components/studio/StudioBulkStepDiffModal.tsx` — Unified step diffing modal
- `src/components/studio/StudioDateModal.tsx` — Single and bulk date picker modal
- `src/components/BlueprintStudio.tsx` — Root component assembling all subcomponents
- `src/components/BlueprintStudio.test.ts` — Component rendering and markup tests
