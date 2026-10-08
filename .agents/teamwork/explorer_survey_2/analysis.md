# Test Infrastructure & Strategy Report: Blueprint Studio Goal Tree Editor Rebuild

**Author**: Test Infra Explorer  
**Date**: 2026-10-08  
**Project**: YouDO (`d:\Production\Projects\YouDO`)  
**Target Milestone**: Blueprint Studio Goal Tree Editor & Bulk Editing Rebuild (R1–R5)  

---

## Executive Summary

This report establishes the test infrastructure, existing suite architecture, and testing strategy for rebuilding the **Blueprint Studio** goal tree editor and bulk editing engine in **YouDO**.

### Critical Platform Clarification
While initial task dispatch templates referenced Flutter (`flutter test`), empirical survey of the codebase confirms that **YouDO is a React 18 + TypeScript 5.5 + Vite 6 + TailwindCSS application packaged for web, PWA, and Capacitor 8 (Android)**. The testing framework is **Vitest 4.1.11** running in a Node.js test environment, supplemented by an in-memory PostgreSQL test runner (`@electric-sql/pglite`) for SQL migrations and RPCs.

### Health of Current Test Suite
- **Vitest Unit & Domain Suite**: **44 test files**, **464 tests**, all **passing** (`npm test` executes in ~5.0s).
- **Benchmark Suite**: 5 benchmarks over synthetic 5,510-node goal trees, all passing (`npm run benchmark` executes in ~3.3s).
- **SQL Migration & Security Suite**: 8 PostgreSQL suites, all passing (`npm run test:sql` executes in ~12s).
- **Web Build & PWA Precache Verification**: `npm run verify:build` validates bundle size (<700 kB raw, <200 kB gzip) and service worker precaching.

---

## 1. Existing Test Architecture Survey

### 1.1 Test Suite Location & Discovery
- Tests are co-located in `src/` matching the pattern configured in `vite.config.ts`:
  ```ts
  // vite.config.ts lines 114-117
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  }
  ```
- Vitest discovers and executes test files ending in `*.test.ts`.
- There is no separate root `test/` directory; domain, hook, and component tests live beside the code they verify.

### 1.2 Testing Tooling & Dependencies
From `package.json`:
- **Test Runner**: `vitest@4.1.11`
- **TypeScript**: `typescript@5.5.3`
- **Compiler / Bundler**: `vite@6.4.3`, `@vitejs/plugin-react@4.7.0`
- **Database Testing**: `@electric-sql/pglite@0.5.8`
- **Linter**: `eslint@9.39.5`, `typescript-eslint@8.3.0`
- **Component Testing Tools**:
  - `react-dom/server` (`renderToStaticMarkup`) is currently used for SSR-based component markup tests (e.g. `src/components/Toggle.test.ts`).
  - `@testing-library/react`, `jsdom`, and `happy-dom` are **not currently installed** in `node_modules` or `package.json`. Tests currently run in Node.js with global stubs (`vi.stubGlobal('localStorage', ...)` and `vi.stubGlobal('window', ...)`).

### 1.3 Key Existing Test Files Related to Goal Trees & Blueprint Studio

| Test File | Lines | Tests | Scope Covered |
| :--- | :---: | :---: | :--- |
| `src/lib/blueprintStudio.test.ts` | 235 | 18 | `normalizeBlueprintTitles`, `numberedBlueprintTitles`, `addBlueprintChildren`, arbitrary depth trees, execution-state protection, `addBlueprintSteps`, `removeBlueprintSteps`, `renameBlueprintStep`, `updateBlueprintNodes`, `groupBlueprintChildren`, `countBlueprintNodes`, `maxBlueprintDepth`, `blueprintReviewState`, `closestBlueprintPathIds`, ID uniqueness, `reconcileBlueprintTasks`. |
| `src/lib/studioWorkspace.test.ts` | 183 | 20 | Contextual edits, whitespace deduplication, `studioChangeDetails`, ID-based patching (`patchStudioItems`), parent path resolution (`studioItemPath`), selection normalization (`topStudioSelection`), cycles & invalid moves (`canMoveStudioItems`, `moveStudioItems`), item duplication (`duplicateStudioItems`), sibling reordering (`reorderStudioItems`), indexed checklist edits (`editStudioSteps`), Today task synchronization. |
| `src/lib/planningIntegrity.test.ts` | 124 | 12 | Tree progress recalculation, child append restrictions, deletion location tracking, trash bin records, branch restoration, active plan cleanup vs completed history retention. |
| `src/lib/domain.test.ts` | 1440 | 92 | Date calculations, deadline labels, goal timing labels, timing status transitions, session statistics, goal tree utilities (`canMoveGoalNodes`, `moveGoalNodes`, `reorderMultipleGoalNodes`, `rollupPct`, `recomputeCompleted`). |
| `src/components/Toggle.test.ts` | 22 | 3 | Static markup rendering of React components via `renderToStaticMarkup`, ARIA attributes, disabled state verification. |
| `src/performance.bench.ts` | 48 | 5 | Vitest benchmarks over 5,510 tree nodes, rollup recalculation, node search by ID, backup parsing. |

---

## 2. Test Infrastructure for Goal Tree Operations

### 2.1 Model & Data Structure Testing
The core model is defined in `src/types.ts`:
```ts
export type GoalKind = 'goal' | 'node' | 'phase' | 'section' | 'task' | 'sub' | 'leaf';

export interface GoalNode {
  id: string;
  kind: GoalKind;
  title: string;
  description?: string;
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;   // ISO date YYYY-MM-DD
  children: GoalNode[];
  steps?: string[];
  stepDone?: boolean[];
  completed?: boolean;
  todayTaskId?: string | null;
  pinned?: boolean;
  createdAt: number;
}
```

The underlying tree logic lives in `src/lib/goalTree.ts`, `src/lib/blueprintStudio.ts`, and `src/lib/studioWorkspace.ts`.

#### Verification Capabilities:
1. **Endpoint vs Branch Detection**: `isGoalEndpoint(node)` returns `node.children.length === 0`.
2. **Execution State Protection**: `hasGoalExecutionState(node)` checks for `todayTaskId`, `completed`, `steps.length > 0`, or `stepDone.some(Boolean)`.
3. **Rollup Calculation**: `rollupPct(node)` calculates hierarchical completion percentages.
4. **Completion Recomputation**: `recomputeCompleted(node)` recursively validates completion state.

### 2.2 State Management & Store Integration
In `src/store.tsx`:
- `applyGoalTreeChange(baseGoals, proposedGoals)`:
  - Ensures atomic transition from `baseGoals` to `proposedGoals`.
  - Rejects stale writes (`sameTree(currentGoals, baseGoals) === false`).
  - Rejects no-op writes (`sameTree(currentGoals, nextGoals) === true`).
  - Prevents breaking active focus timer sessions (`active-session` conflict check).
  - Automatically reconciles active daily tasks via `reconcileBlueprintTasks`.
  - Stores transaction in an 8-slot undo ring buffer with generated UUID tokens.
  - Clears `clearRollupCache()`.

### 2.3 Bulk Operations Test Harness
The following core functions are currently tested in unit tests and provide the baseline for R1–R4:

1. **Bulk Add Inside (`addBlueprintChildren`)**:
   - Accepts `goals: GoalNode[]`, `parentIds: string[]`, `kind: GoalKind`, `rawTitles: string[]`.
   - Normalizes titles, skips duplicate titles within each parent node, creates unique IDs using `uid('goal')`.
   - Returns `{ goals, createdIds, added, blocked }`.

2. **Bulk Step Addition (`addBlueprintSteps` — Set-Union)**:
   - Accepts `goals: GoalNode[]`, `nodeIds: string[]`, `rawSteps: string[]`.
   - Deduplicates and normalizes step strings.
   - For each target endpoint node, computes missing steps:
     `missing = steps.filter((s) => !existing.has(s.toLowerCase()))`
   - Appends missing steps to `node.steps`, appends `false` to `node.stepDone`.
   - Preserves completion state of all existing steps.

3. **Bulk Step Removal (`removeBlueprintSteps` — Set-Difference)**:
   - Accepts `goals: GoalNode[]`, `nodeIds: string[]`, `rawSteps: string[]`.
   - Identifies matches in each target endpoint node.
   - Preserves steps marked completed in `stepDone[i] === true` (`protectedCompleted` counter).
   - Removes unfinished steps, safely skipping nodes that lack the target steps without throwing errors.
   - Recalculates `node.completed`.

4. **Bulk Property & Date Patching (`patchStudioItems`)**:
   - Accepts `goals: GoalNode[]`, `patches: Record<string, StudioPatch>`.
   - Updates `startDate`, `endDate`, `title`, `description`, `pinned` on explicit IDs.
   - Validates `endDate >= startDate`.

---

## 3. Test Infrastructure for UI/UX & Component Verification

### 3.1 Current Component Testing Constraints
1. **Node Environment**: `vite.config.ts` runs tests under `environment: 'node'`.
2. **Missing DOM packages**: `@testing-library/react` and `happy-dom`/`jsdom` are not in `package.json`.
3. **SSR Markup Pattern**: `src/components/Toggle.test.ts` proves that React components can be rendered to static HTML in Node via `react-dom/server` (`renderToStaticMarkup(createElement(Component, props))`).

### 3.2 Two-Tier Strategy for UI/UX Testing

To ensure rapid, regression-free, and thorough testing of the rebuilt UI without introducing fragile browser dependencies, we establish a two-tier strategy:

#### Strategy A: Headless Reducer / View-Model Controller (Recommended Primary)
Extract the interactive state machine of the rebuilt Blueprint Studio into a decoupled controller/reducer (e.g. `src/components/studio/blueprintStudioReducer.ts` or `useBlueprintStudioController.ts`).
- **Why**: Allows 100% test coverage of:
  - Node expansion choice (choosing steps vs child items).
  - Multi-selection state management (toggle single, toggle all, clear, top-selection pruning).
  - Modal opening, switching, and dirty-state dismissal confirmations.
  - Bulk date patching state (together vs individual, enabling date checkboxes).
  - Multi-level draft undo/redo stack.
- **Execution**: Runs in pure TypeScript under Node in <10 milliseconds per suite.

#### Strategy B: Static Markup & Accessibility Verification via `react-dom/server`
Test rendered component output for accessibility and layout compliance:
- Verifies modal dialog attributes (`role="dialog"`, `aria-modal="true"`, `aria-label`).
- Verifies choice buttons exist ("Add checklist steps" vs "Add child nodes").
- Verifies selection bar button states and labels ("N selected", "Add items inside each", "Edit dates").
- Verifies error and warning alert regions (`role="alert"`).

#### Strategy C: Optional Enhanced DOM Interaction Setup (For Future Full Integration)
If interactive DOM testing (clicking buttons, synthetic typing) is required in the test runner:
1. Add `happy-dom` to `devDependencies`: `npm install -D happy-dom @testing-library/react`.
2. In test files, specify:
   ```ts
   // @vitest-environment happy-dom
   ```
3. Update `vite.config.ts` include pattern to `['src/**/*.test.{ts,tsx}']`.

---

## 4. Concrete 4-Tier Test Plan (Covering R1–R5 & Acceptance Criteria)

### Tier 1: Feature Coverage (Core Requirements)
*Goal: Verify every individual requirement R1–R5 independently.*

| Test ID | Test Name | Target Module | Description & Assertions |
| :--- | :--- | :--- | :--- |
| **T1.1.1** | Expansion Choice: Add Steps to Empty Node | `blueprintStudio.ts` | Adding steps to an empty node turns it into an executable task endpoint (`steps.length > 0`, `children = []`, `role = 'Task'`). |
| **T1.1.2** | Expansion Choice: Add Children to Empty Node | `blueprintStudio.ts` | Adding children to an empty node turns it into a branch folder (`children.length > 0`, `steps = undefined`, `role = 'Branch'`). |
| **T1.1.3** | Expansion Choice: UI Action Presentation | `BlueprintStudio.tsx` | UI presents explicit distinct actions for adding steps vs adding child nodes without ambiguous restrictions. |
| **T1.2.1** | Bulk Add Inside: Multiple Selected Parents | `blueprintStudio.ts` | Selecting 3 parent nodes across different branches and adding 2 items creates exactly 6 new nodes with unique IDs under the appropriate parents. |
| **T1.2.2** | Bulk Add Inside: Skip Existing Sibling Names | `blueprintStudio.ts` | If parent A already has child "Milestone 1" and parent B does not, bulk adding "Milestone 1" adds it to parent B and skips parent A without error. |
| **T1.2.3** | Bulk Add Inside: Numbered Sequence Generator | `blueprintStudio.ts` | Selecting multiple parents and generating "Phase" start 1 count 3 correctly adds "Phase 1", "Phase 2", "Phase 3" to all parents. |
| **T1.3.1** | Bulk Step Addition: Set-Union Logic | `blueprintStudio.ts` | Target 1 has `['A', 'B']`, Target 2 has `['B', 'C']`. Bulk adding `['B', 'D']` results in Target 1 having `['A', 'B', 'D']` and Target 2 having `['B', 'C', 'D']`. |
| **T1.3.2** | Bulk Step Addition: Preserves Existing Completion | `blueprintStudio.ts` | Existing completed step state (`stepDone[0] = true`) remains `true` when new steps are appended. Appended steps receive `false`. |
| **T1.4.1** | Bulk Step Removal: Set-Difference Logic | `blueprintStudio.ts` | Target 1 has `['A', 'B']`, Target 2 has `['B', 'C']`. Bulk removing `['B']` leaves Target 1 with `['A']` and Target 2 with `['C']`. |
| **T1.4.2** | Bulk Step Removal: Skip Missing Steps | `blueprintStudio.ts` | Bulk removing `['Z']` (which exists on neither node) performs a safe no-op without error, throwing no exceptions. |
| **T1.4.3** | Bulk Step Removal: Protect Completed Work | `blueprintStudio.ts` | If step `B` on Target 1 is marked `stepDone = true`, bulk removing `B` keeps it protected and increments `protectedCompleted`. |
| **T1.5.1** | Single Node Date Editing | `studioWorkspace.ts` | Updating `startDate` and `endDate` on node X updates only node X; other nodes remain untouched. |
| **T1.5.2** | Bulk Date Editing Across Multiple Nodes | `studioWorkspace.ts` | Selecting 5 nodes and applying `startDate: '2026-11-01', endDate: '2026-11-15'` updates all 5 nodes simultaneously. |
| **T1.5.3** | Bulk Date Clearing | `studioWorkspace.ts` | Bulk clearing dates removes `startDate` and `endDate` across all selected nodes. |
| **T1.6.1** | Simple UI Layout & Action Hierarchy | `StudioControls.tsx` | Header, breadcrumbs, selection bar, and modals use unified design tokens and clean layout without nested modal clutter. |

---

### Tier 2: Boundary & Corner Cases
*Goal: Stress-test edge conditions, normalization, scale limits, and invalid inputs.*

| Test ID | Test Name | Edge Condition | Expected Behavior |
| :--- | :--- | :--- | :--- |
| **T2.1** | Whitespace & Case Insensitivity | Step names `"  Review Notes "` vs `"review notes"` vs `"REVIEW   NOTES"`. | Deduplicates accurately; normalizes to single spaces; recognizes as identical. |
| **T2.2** | Multiline Input Formatting | Multiline textarea input with trailing newlines, `\r\n` line endings, and empty lines. | Empty lines are filtered out; valid lines trimmed and added in order. |
| **T2.3** | Numbered Sequence Clamping | User inputs count = 500, start = -5, prefix = `""`. | Count clamped to max 100, start clamped to min 0, prefix defaults to fallback. |
| **T2.4** | Inverted Date Range Validation | User sets `startDate: '2026-12-01'` and `endDate: '2026-11-01'`. | Validation blocks application with error message: "deadline must be on or after start date". |
| **T2.5** | Empty Selection Safeguard | Bulk operations triggered with `selected = []`. | Returns `{ added: 0, goals }` gracefully with zero state mutation. |
| **T2.6** | Deep Hierarchy (Depth > 10) | Adding children inside children repeatedly down to depth 12. | Tree traversals (`findBlueprintPath`, `maxBlueprintDepth`, `rollupPct`) complete within <5ms without stack overflow. |
| **T2.7** | Special Characters & Unicode | Goal and step titles containing emojis, non-Latin scripts, and quotes (`"Lecture 1: <Intro> & 'Basics' 🚀"`). | Preserved verbatim without escaping corruption. |
| **T2.8** | Redundant Nested Selections | User selects both parent node P and child node C. | `topStudioSelection` normalizes selection to parent P only, preventing double-processing. |

---

### Tier 3: Cross-Feature Combinations & State Transitions
*Goal: Verify multi-feature workflows, store transactions, and undo/redo integrity.*

| Test ID | Test Name | Multi-Feature Interaction | Verification Criteria |
| :--- | :--- | :--- | :--- |
| **T3.1** | Bulk Add Inside followed by Bulk Step Diffing | Select 3 nodes -> Bulk add 2 children to each -> Select all 6 new children -> Bulk add 3 checklist steps to each. | Hierarchy correctly forms 3 parents -> 6 children -> 18 steps total; IDs remain distinct and tree passes `recomputeCompleted`. |
| **T3.2** | Heterogeneous Selection Handling | Select a mixed set of nodes: 2 empty nodes, 2 nodes with existing steps, 2 nodes with existing child branches. | Bulk action contextually enables appropriate operations; prevents invalid child additions to locked execution nodes. |
| **T3.3** | Bulk Date Edit Combined with Renaming | Select multiple nodes, enable "Change name" and "Change dates" simultaneously. | Patches apply atomically to all targets. |
| **T3.4** | Multi-Step Undo and Redo Sequence | Perform: (1) Bulk Add Inside -> (2) Bulk Date Change -> (3) Bulk Step Diff -> (4) Undo -> (5) Undo -> (6) Redo. | Each undo/redo restores exact snapshot; selection pointers update cleanly. |
| **T3.5** | Store Transaction Commit & Stale Protection | Simulate concurrent external goal tree modification while Studio draft is open. | `applyGoalTreeChange(baseGoals, draft)` returns `{ ok: false, error: 'stale' }`, preventing data overwrite. |
| **T3.6** | Active Session Conflict Protection | Attempt to save blueprint changes that mutate the task currently active in focus session. | `applyGoalTreeChange` detects active task conflict, returns `{ ok: false, error: 'active-session' }`, preserving draft. |
| **T3.7** | Linked Today Task Reconciliation | Rename, date-shift, or delete goal nodes linked to active daily cards. | `reconcileBlueprintTasks` synchronizes active plan titles/dates while preserving completed historical task logs. |

---

### Tier 4: Real-World Scenarios (End-to-End User Journeys)
*Goal: Validate complete, authentic user workflows from start to finish.*

| Test ID | Scenario Name | Workflow Steps | Acceptance Condition |
| :--- | :--- | :--- | :--- |
| **T4.1** | Exam Preparation Curriculum Builder | 1. Create root goal "Board Exams".<br>2. Bulk add 4 subjects: "Physics", "Chemistry", "Math", "English".<br>3. Select all 4 subjects; bulk add 5 chapters to each (20 chapters).<br>4. Select all 20 chapters; bulk add standard steps: "Read Notes", "Watch Video", "Solve Exercises".<br>5. Select all chapters; bulk set deadline to "2026-12-15".<br>6. Save blueprint. | All 20 chapters have exactly 3 steps (60 steps total), all deadlines match "2026-12-15", root progress rolls up to 0%, store transaction commits with valid token. |
| **T4.2** | Software Sprint Bulk Template Injection | 1. User has 3 feature branches with varying existing checklist steps.<br>2. User selects all 3 features and bulk adds QA steps: "Unit Tests", "Manual QA", "Code Review".<br>3. Feature 1 already has "Unit Tests".<br>4. Feature 2 is missing all three.<br>5. Feature 3 has "Code Review" completed. | Feature 1 adds only "Manual QA" and "Code Review" (no duplicate "Unit Tests"). Feature 2 receives all 3. Feature 3 preserves completed "Code Review" and appends the other 2. |
| **T4.3** | Mid-Project Milestone Rescheduling | 1. User selects 12 tasks across different branches affected by a delay.<br>2. Opens Bulk Edit.<br>3. Enables "Change dates".<br>4. Updates start date from "2026-10-10" to "2026-10-24" and deadline from "2026-10-20" to "2026-11-03".<br>5. Applies and commits. | All 12 tasks have new dates applied; all unfinished and finished checklist steps remain intact. |
| **T4.4** | Full Round-Trip Backup & Restoration | 1. Create extensive tree via bulk operations.<br>2. Complete 5 steps on various nodes.<br>3. Export entire workspace to JSON payload.<br>4. Run `parseBackupPayload` and `sanitizeTreeAndTasks`.<br>5. Verify tree structure and execution state match identically. | Zero data loss or corruption across serialization/deserialization boundary. |

---

## 5. Verification Commands & Environment Readiness

### 5.1 Exact Test Execution Commands

| Task | Command Line | Expected Execution Time |
| :--- | :--- | :--- |
| **Run Entire Test Suite** | `npm test` | ~5.0 seconds |
| **Run Vitest in CI / Headless Mode** | `npx vitest run` | ~5.0 seconds |
| **Run Blueprint Studio Suite Only** | `npx vitest run src/lib/blueprintStudio.test.ts` | <500 ms |
| **Run Studio Workspace Suite Only** | `npx vitest run src/lib/studioWorkspace.test.ts` | <500 ms |
| **Run Rebuilt Studio Suite (Future)**| `npx vitest run src/components/studio/` | <1.0 second |
| **Run Interactive Watch Mode** | `npx vitest --watch` | Real-time |
| **Run Benchmark Suite** | `npm run benchmark` | ~3.3 seconds |
| **Run Database SQL Suite** | `npm run test:sql` | ~12 seconds |
| **Run Full Web Build Verification** | `npm run verify:build` | ~4.0 seconds |
| **Run TypeScript Typecheck** | `npm run typecheck` | ~3.5 seconds |
| **Run ESLint** | `npm run lint` | ~5.0 seconds |

### 5.2 Environment Readiness Assessment

#### Verified Ready ✅
1. **Node.js & npm runtime**: Node and npm are active and responsive.
2. **Vitest test runner**: Vitest v4.1.11 executes and passes 44 test files / 464 tests cleanly.
3. **PGLite SQL engine**: In-memory database testing executes cleanly across all 8 suites.
4. **Benchmark runner**: Synthetic tree performance checks execute cleanly.

#### Pre-existing Observations / Warnings to Note ⚠️
1. **TypeScript Typecheck (`npm run typecheck`)**:
   Currently exits with code 1 due to 4 unused variable declarations (`TS6133` with `noUnusedLocals: true`):
   - `src/App.tsx(2,70)`: `'Zap' is declared but its value is never read.`
   - `src/App.tsx(121,5)`: `'duplicateTask' is declared but its value is never read.`
   - `src/App.tsx(815,9)`: `'handlePushBacklogTask' is declared but its value is never read.`
   - `src/components/TaskCard.tsx(2,27)`: `'Copy' is declared but its value is never read.`
2. **ESLint (`npm run lint`)**:
   Reports 4 errors matching the unused variables above, plus 1 hook dependency warning:
   - `src/components/studio/StudioForms.tsx(71,6)`: `React Hook useMemo has a missing dependency: 'getNamesForConfig'`.
3. **Vite test include glob**:
   `vite.config.ts` has `include: ['src/**/*.test.ts']`. If new tests are written with `.test.tsx`, `vite.config.ts` must be updated to `include: ['src/**/*.test.{ts,tsx}']` or new tests should be authored as `.test.ts`.

---

## 6. Implementation Guidance for the Implementation Team

When implementing the rebuild for Blueprint Studio and the tests in this plan:

1. **Keep Core Algorithms Pure**:
   Keep `addBlueprintChildren`, `addBlueprintSteps`, `removeBlueprintSteps`, `patchStudioItems`, and `reconcileBlueprintTasks` as pure functions in `src/lib/`. This makes Tier 1, Tier 2, and Tier 3 unit tests lightning-fast, zero-dependency, and 100% deterministic.
2. **Decouple UI State into a Hook/Reducer**:
   Create a dedicated state controller (e.g. `useBlueprintStudioState.ts` or `studioReducer.ts`). Test user actions (selecting nodes, switching between "add steps" and "add children", selecting date ranges, triggering bulk diffing) through this controller without requiring a browser.
3. **Follow the Established File Naming**:
   Save new test suites in `src/lib/` or `src/components/studio/` with the `.test.ts` extension (e.g. `src/lib/blueprintStudioBulk.test.ts`, `src/components/studio/blueprintStudioFlow.test.ts`) to match `vite.config.ts` automatically.
4. **Include the Agent-as-Judge Verification Harness**:
   Provide helper fixtures (such as `createMockGoalTree()`) that can be instantiated by automated tests or agent-as-judge runners to directly evaluate acceptance criteria:
   - Bulk child addition verification.
   - Set-union / set-difference step diffing verification.
   - Bulk date updating verification.
   - Node expansion choice verification.
