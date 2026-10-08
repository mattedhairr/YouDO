# Architecture Survey Handoff Report

**Agent**: explorer_survey_1  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\explorer_survey_1`  
**Target Recipient**: Orchestrator (`b50e5d61-aab8-4da0-9abc-a466bca2446b`)  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **Technology Stack & Layout**:
   - `d:\Production\Projects\YouDO\package.json`: Lines 19-34 contain React `18.3.1`, `@supabase/supabase-js` `2.57.4`, `@capacitor/core` `8.5.0`, `lucide-react` `0.344.0`. There is NO `pubspec.yaml` anywhere in the project; it is a React/TypeScript/Vite/Capacitor application, not Flutter/Dart.
   - `d:\Production\Projects\YouDO\tailwind.config.js`: Lines 7-34 define semantic colors (`base`, `surface`, `elevated`, `primary`, `primary-soft`, `secondary`, `accent`, `border`, `border-subtle`).
   - Running `npm test`: Exited with code 0 (`44 test files passed, 464 tests passed, duration 4.84s`).
   - Running `npm run build`: Exited with code 0 (`built in 9.36s`, generating `dist/assets/BlueprintStudio-CIaNPXgb.js` and `dist/assets/BlueprintStudio-vT1drZAR.css`).

2. **Blueprint Studio Component & Integration**:
   - `d:\Production\Projects\YouDO\src\App.tsx` (lines 43, 1600-1611):
     ```typescript
     const BlueprintStudio = lazy(() => import('./components/BlueprintStudio'));
     ...
     <BlueprintStudio
       open={blueprintStudioOpen}
       goals={goals}
       initialPathIds={goalPathIds}
       activeGoalNodeId={tasks.find((task) => task.id === activeSession?.taskId)?.goalNodeId}
       onClose={closeBlueprintStudio}
       onCommit={(base, next, title) => {
         const result = applyGoalTreeChange(base, next);
         if (result.ok && result.token) setBlueprintUndo({ token: result.token, title });
         return result;
       }}
     />
     ```
   - `d:\Production\Projects\YouDO\src\store.tsx` (lines 650-692): `applyGoalTreeChange` performs staleness verification (`sameTree(currentGoals, baseGoals)`), completion recomputation (`recomputeCompleted`), linked task reconciliation (`reconcileBlueprintTasks`), and stores undo transactions (`goalTreeTransactionsRef`).

3. **Data Models (`d:\Production\Projects\YouDO\src\types.ts`)**:
   - `GoalNode` (lines 41-61): Contains `id`, `kind: GoalKind`, `title`, `description?`, `startDate?`, `endDate?`, `children: GoalNode[]`, `steps?: string[]`, `stepDone?: boolean[]`, `completed?: boolean`, `todayTaskId?: string | null`, `pinned?: boolean`, `createdAt: number`.

4. **Existing Bulk-Add & Step Logic**:
   - `d:\Production\Projects\YouDO\src\lib\blueprintStudio.ts`:
     - `addBlueprintChildren` (lines 60-92): Adds children across `parentIds`, normalizes titles, but strictly blocks any parent that has execution state (`hasGoalExecutionState(parent)`) on line 77.
     - `addBlueprintSteps` (lines 108-138): Appends missing steps to endpoints, skipping duplicates.
     - `removeBlueprintSteps` (lines 141-182): Removes matching steps from endpoints, protecting completed steps.
     - `reconcileBlueprintTasks` (lines 386-407): Reconciles live task mirrors when goals change.
   - `d:\Production\Projects\YouDO\src\lib\studioWorkspace.ts`:
     - `patchStudioItems` (lines 10-21): Applies patches to title, description, startDate, endDate, pinned.
     - `topStudioSelection` (lines 24-30): Normalizes multi-selection so descendants of selected parents aren't duplicated.
     - `canMoveStudioItems` & `moveStudioItems` (lines 37-61): Validates and moves subtrees.
     - `duplicateStudioItems` (lines 64-83): Clones nodes and subtrees.

5. **Existing UI/UX Deficiencies**:
   - `src/components/BlueprintStudio.tsx` (407 lines) + `src/components/studio/StudioForms.tsx` (558 lines):
     - Uses long-press (threshold 420ms, line 203) for selection, making multi-selection hard to discover.
     - Uses a folder drill-down model rather than a clean, soothing tree view.
     - Has no explicit user-driven fork when expanding a node between adding checklist steps vs adding child items (R1).
     - Adding steps and deleting steps are separated into two distinct forms (`StudioAddForm` vs `StudioChecklistForm`), preventing unified step diffing (R3).
     - Date editing in bulk is buried inside a generic edit modal behind a checkbox (R4).

---

## 2. Logic Chain

1. **Stack Identification**:
   - From Observation 1, the presence of `package.json`, Vite, React 18, and Tailwind, coupled with passing vitest unit tests, proves the project is a modern TypeScript/React web & Capacitor mobile application. Any downstream implementation must use TypeScript, React, and Tailwind, not Dart/Flutter.
2. **Architectural Boundary**:
   - From Observation 2, `BlueprintStudio` is completely isolated behind an overlay with props `(open, goals, initialPathIds, activeGoalNodeId, onClose, onCommit)`. It does not mutate global state directly during editing, but works with a local draft and commits via `onCommit`.
   - Therefore, Blueprint Studio's UI/UX can be completely rebuilt and modernized without breaking any other screen (`GoalView`, `TaskCard`, `CalendarView`, `BoardView`).
3. **Domain Layer Strength**:
   - From Observation 4, core algorithms for tree traversal, node addition, step addition/removal, task reconciliation, and transaction undoing are already implemented and tested in `goalTree.ts`, `blueprintStudio.ts`, and `studioWorkspace.ts`.
   - Therefore, the rebuild does not need to reinvent tree manipulation from scratch, but can extend `blueprintStudio.ts` with cleaner atomic helpers (`setGoalDates`, `diffBlueprintSteps`) while replacing the clunky UI layer (`BlueprintStudio.tsx` and `StudioForms.tsx`).
4. **Fulfilling Requirements R1-R5**:
   - **R1**: Add a clear, user-driven expansion modal/sheet (`StudioNodeExpansionModal`) that explicitly asks: "Add Checklist Steps" vs "Add Child Items".
   - **R2**: Build a streamlined "Bulk Add Inside" sheet (`StudioBulkAddModal`) supporting single, multi-line list, and numbered sequences with duplicate skipping and clear visual feedback.
   - **R3**: Build a unified "Bulk Step Diffing" editor (`StudioBulkStepDiffModal`) that presents all steps, allows adding new steps (set-union with duplicate skip) and removing steps (set-difference with absent skip).
   - **R4**: Build a dedicated date picker sheet (`StudioDateModal`) for setting/clearing target dates (`startDate`) and deadlines (`endDate`) in bulk or individually.
   - **R5**: Replace the cluttered 420ms long-press and nested modal sheets with an intuitive tree editor, direct selection checkboxes, soothing palette from `tailwind.config.js`, and clear action bars.

---

## 3. Caveats

- **No Caveats** regarding the codebase architecture, language, or dependencies.
- **Active Focus Session Constraint**: When rebuilding the editor, the constraint from line 76 of `BlueprintStudio.tsx` must be preserved: if an `activeGoalNodeId` is currently running in a live focus session, that specific node cannot have its steps deleted or be removed until the session finishes.

---

## 4. Conclusion

1. Project YouDO is a React 18 / TypeScript / Vite / Tailwind web and Capacitor mobile application.
2. The architectural boundary between `App.tsx` and `BlueprintStudio.tsx` is clean, decoupled, and transaction-safe via `onCommit` / `applyGoalTreeChange`.
3. The existing domain logic (`blueprintStudio.ts` and `goalTree.ts`) is well-tested (464 passing unit tests), but the UI layer (`BlueprintStudio.tsx`, `StudioForms.tsx`, `studio.css`) is cluttered, complex, and misses the explicit user-driven requirements of R1, R2, R3, R4, and R5.
4. Blueprint Studio can and should be rebuilt with modular subcomponents (`StudioTree`, `StudioNodeExpansionModal`, `StudioBulkAddModal`, `StudioBulkStepDiffModal`, `StudioDateModal`) in `src/components/studio/`, delivering a calm, soothing, and robust goal tree editor.

---

## 5. Verification Method

1. **Verify Tech Stack & Build**:
   ```powershell
   npm test
   npm run build
   ```
   Both commands must exit with code 0.
2. **Inspect Architecture Report**:
   View `d:\Production\Projects\YouDO\.agents\teamwork\explorer_survey_1\analysis.md`.
3. **Invalidation Conditions**:
   - Finding any Dart or Flutter code (none exists).
   - `BlueprintStudio` directly mutating `useStore()` without going through `onCommit` (it does not; it uses local draft state).
