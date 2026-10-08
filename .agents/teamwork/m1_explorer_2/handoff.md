# Handoff Report: Bulk Step Diffing (R3) & Date Management (R4) Algorithms

**Agent:** M1 Explorer 2 (Algorithmic Specialist: Diffing & Dates)  
**Milestone:** Milestone 1: Core Domain & Algorithm Layer  
**Working Directory:** `d:\Production\Projects\YouDO\.agents\teamwork\m1_explorer_2`  
**Handoff Type:** Hard (Task complete)  
**Date:** 2026-10-08

---

## 1. Observation

1. **Existing Step Functions in `src/lib/blueprintStudio.ts` (lines 107–183):**
   - Line 108: `addBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): AddStepsResult`
   - Line 115–135:
     ```ts
     const next = goals.map((root) => {
       let changedRoot = root;
       for (const id of targets) {
         changedRoot = updateNode(changedRoot, id, (node) => { ... });
       }
       return changedRoot;
     });
     ```
     This executes nested $O(M \times N)$ tree traversals for $M$ targets across $N$ nodes.
   - Line 141: `removeBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): RemoveStepsResult`
   - Line 161–164:
     ```ts
     if (oldDone[index]) {
       protectedCompleted += 1;
       return true;
     }
     ```
     Completed steps are kept during removal.
   - Separate functions require two separate passes if both adding and removing steps in the bulk editor.

2. **Existing Workspace Patching in `src/lib/studioWorkspace.ts` (lines 10–21, 107–130):**
   - Line 10: `patchStudioItems(goals: GoalNode[], patches: Record<string, StudioPatch>): GoalNode[]` uses a single recursive `visit(node)` traversal ($O(N)$), which is clean and efficient, but performs zero date validation or constraint enforcement:
     ```ts
     const next = { ...node, ...patch, children: changedChildren ? children : node.children };
     if (patch?.title !== undefined) next.title = patch.title.trim() || node.title;
     return next;
     ```
   - Line 107: `editStudioSteps(goals: GoalNode[], edits: StudioStepEdit[]): GoalNode[]` updates steps by exact array index per node, which is unsuitable for bulk cross-node diffing where step indices vary across nodes.

3. **Date Utilities in `src/lib/dates.ts`:**
   - Lines 9–24 provide `todayISO()`, `tomorrowISO()`, `localISODate(d: Date)` (`YYYY-MM-DD`).
   - Does NOT export a strict `isValidISODate(value)` function to validate Gregorian calendar dates, reject leap-year mismatches (e.g. `2026-02-31`), or enforce `startDate <= endDate`.

4. **Domain Types in `src/types.ts` (lines 41–61):**
   - `GoalNode`:
     ```ts
     startDate?: string; // ISO date
     endDate?: string;   // ISO date
     children: GoalNode[];
     steps?: string[];
     stepDone?: boolean[];
     completed?: boolean;
     todayTaskId?: string | null;
     ```

5. **Existing Test Suite Baseline:**
   - Ran `npm test` via Vitest (`run_command`).
   - Result: 44 test files passed (464 tests), 0 failures, duration 3.39s.

---

## 2. Logic Chain

1. **Step Diffing Unification (Observation 1 & 2):**
   - Because `addBlueprintSteps` and `removeBlueprintSteps` currently run as separate operations, combining additions and deletions requires two passes and duplicates tree traversal overhead.
   - By creating `diffBlueprintSteps(goals, targetNodeIds, stepsToAdd, stepsToRemove, options)` that executes in a single recursive visitor pass ($O(N)$), both Set-Difference removals and Set-Union additions are applied atomically per node.
   - Existing `addBlueprintSteps` and `removeBlueprintSteps` can be refactored into thin wrappers around `diffBlueprintSteps`, maintaining 100% backwards compatibility with all 464 passing tests.

2. **Zero Duplicates & Silent Skips (Observation 1 & User Request R3):**
   - Normalizing step keys via `step.trim().replace(/\s+/g, ' ').toLocaleLowerCase()` guarantees case-insensitive and whitespace-invariant equality.
   - During Set-Difference removals: target nodes that do not contain a step in `stepsToRemove` encounter no matches in `removeKeys`, resulting in zero removals, zero errors thrown, and an unaffected node.
   - During Set-Union additions: existing step keys on the node are collected into a Set. Steps from `stepsToAdd` already in the Set are skipped, preventing duplicate step creation.
   - When all steps are done (`finalSteps.length > 0 && finalDone.every(Boolean)`), `completed` becomes `true`. If new uncompleted steps are added, `completed` becomes `false`.

3. **Completed Step Protection (Observation 1 & Request R3):**
   - Checking `if (isDone && !options?.forceRemoveCompleted)` inside the removal loop preserves completed steps and increments `protectedCompletedCount`.
   - Adding `forceRemoveCompleted: boolean` option allows explicit overrides if needed.

4. **Date Validation and Range Enforcement (Observation 2 & 3):**
   - Implementing `isValidISODate(value)` with regex `/^\d{4}-\d{2}-\d{2}$/` and `Date` calendar round-trip guarantees that only valid Gregorian dates are accepted.
   - In `setGoalDatesBulk(goals, targetNodeIds, dates, options)`:
     - Validates format for non-empty dates.
     - Validates range invariant `startDate <= endDate` when both dates are provided.
     - Handles clearing dates via `null`, `""`, or `clearAll: true`.
     - Automatically resolves single-date conflicts against existing opposing dates on target nodes via `'clear'` (default, clearing the conflicting opposing date), `'clamp'` (adjusting opposing date to match), or `'skip'`.

---

## 3. Caveats

1. **Active Focus Session Protection:**
   - Active focus session protection (`activeGoalNodeId === node.id`) is enforced at the transaction boundary in `App.tsx` and `applyGoalTreeChange` in `src/store.tsx`. `diffBlueprintSteps` and `setGoalDatesBulk` are pure domain functions operating on draft trees; they do not require global store knowledge, keeping them pure and testable.
2. **Timezone Discipline:**
   - All dates manipulated in `setGoalDatesBulk` are strictly calendar date strings (`YYYY-MM-DD`). No UTC midnight conversions should be performed to avoid timezone date shifts.

---

## 4. Conclusion

The domain algorithms for R3 and R4 are fully designed, documented, and ready for implementation:
1. `diffBlueprintSteps(goals, targetNodeIds, stepsToAdd, stepsToRemove, options)`:
   - Provides Set-Union additions with zero duplicates.
   - Provides Set-Difference removals with silent skip on non-matching nodes.
   - Provides default protection for completed steps (`stepDone[idx] === true`).
   - Operates in $O(N)$ single-pass immutable traversal.
   - UI summary helper `collectBlueprintStepsSummary` provides prevalence indicators.
2. `setGoalDatesBulk(goals, targetNodeIds, dates, options)`:
   - Sets `startDate` and/or `endDate` across single or multiple nodes.
   - Enforces ISO `YYYY-MM-DD` validation and `startDate <= endDate`.
   - Clears dates reliably when `null`, `""`, or `clearAll: true` is passed.
   - Resolves conflicts with existing dates automatically.
   - Convenience wrapper `setGoalDates` for single-node calls.

Complete implementation code and test matrices are detailed in `d:\Production\Projects\YouDO\.agents\teamwork\m1_explorer_2\analysis.md`.

---

## 5. Verification Method

1. **Inspect Analysis Report:**
   - View `d:\Production\Projects\YouDO\.agents\teamwork\m1_explorer_2\analysis.md`.
2. **Run Existing Test Suite Baseline:**
   - Command: `npm test`
   - Verification condition: All 44 test files and 464 tests pass.
3. **Vitest Verification Command for New Tests:**
   - When M1 Worker implements these functions and M1 Explorer 3 provides unit tests:
     `npx vitest run src/lib/blueprintStudio.test.ts`
     `npx vitest run src/lib/studioWorkspace.test.ts`
