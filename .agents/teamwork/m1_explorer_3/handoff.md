# Handoff Report: M1 Test Design & Verification

**From**: M1 Explorer 3 (Test Design & Verification Specialist)  
**To**: Orchestrator (Conversation ID: `b50e5d61-aab8-4da0-9abc-a466bca2446b`)  
**Milestone**: Milestone 1: Core Domain & Algorithm Layer  
**Date**: 2026-10-08  
**Artifacts Generated**:
- `analysis.md`: Complete domain test design, test matrices, and executable test cases for R1, R2, R3, and R4.
- `handoff.md`: 5-component handoff report.
- `BRIEFING.md`: Working memory and state.
- `progress.md`: Liveness heartbeat and completed task record.

---

## 1. Observation

1. **Existing Test Suite Execution**:
   - Tool Command: `npx vitest run src/lib/blueprintStudio.test.ts src/lib/studioWorkspace.test.ts`
   - Result:
     ```text
     RUN  v4.1.11 D:/Production/Projects/YouDO

     ✓ src/lib/blueprintStudio.test.ts (18 tests) 41ms
     ✓ src/lib/studioWorkspace.test.ts (20 tests) 24ms

     Test Files  2 passed (2)
          Tests  38 passed (38)
       Duration  571ms
     ```
   - All 38 existing domain tests pass in ~65 ms test time (571 ms total process time).

2. **Legacy Blocker in `src/lib/blueprintStudio.ts`**:
   - Location: `src/lib/blueprintStudio.ts`, lines 74–80:
     ```ts
     for (const parentId of [...new Set(parentIds)]) {
       const parent = findGoal(next, parentId);
       if (!parent) continue;
       if (parent.kind !== 'goal' && isGoalEndpoint(parent) && hasGoalExecutionState(parent)) {
         blocked += 1;
         continue;
       }
     ```
   - Corresponding existing test in `src/lib/blueprintStudio.test.ts`, lines 59–72:
     ```ts
     it('protects scheduled, completed, or checklist tasks from silently becoming a branch', () => {
       const untouched = node('open', 'node', 'Can grow');
       const checklist = { ...node('steps', 'leaf', 'Checklist'), steps: ['Read'], stepDone: [false] };
       const completed = { ...node('done', 'task', 'Finished'), completed: true };
       const scheduled = { ...node('planned', 'section', 'Planned'), todayTaskId: 'task-1' };
       const goals = [node('g', 'goal', 'Exam', [untouched, checklist, completed, scheduled])];

       const result = addBlueprintChildren(goals, ['open', 'steps', 'done', 'planned'], 'node', ['Child']);

       expect(result.added).toBe(1);
       expect(result.blocked).toBe(3);
       ...
     ```
   - This test asserts that nodes with checklist steps are strictly blocked from having child nodes added.

3. **Requirement Specifications in `PROJECT.md` & `ORIGINAL_REQUEST.md`**:
   - `ORIGINAL_REQUEST.md`, lines 14–26:
     - R1: "Users must have the choice when expanding a node: they can either add checklist steps (turning it into an executable task) OR add child nodes (turning it into a branch/folder). This should be explicit and user-driven."
     - R2: "Users must be able to select multiple nodes and add items inside all of them simultaneously."
     - R3: "Adding: New steps added in the bulk editor are added to all selected nodes. If a node already has that exact step, skip it (no duplicates). Removing: Steps deleted in the bulk editor are removed from all selected nodes. If a node doesn't have that step, skip it."
     - R4: "Users must be able to change target dates and deadlines for a single node, or select multiple nodes and apply the same date changes to all of them at once."
   - `PROJECT.md`, lines 16, 40–51:
     - `addBlueprintChildrenBulk(goals: GoalNode[], parentIds: string[], titles: string[]): { goals: GoalNode[]; count: number }`
     - `diffBlueprintSteps(goals: GoalNode[], targetNodeIds: string[], stepsToAdd: string[], stepsToRemove: string[]): { goals: GoalNode[]; affectedCount: number }`
     - `setGoalDatesBulk(goals: GoalNode[], targetNodeIds: string[], dates: { startDate?: string; endDate?: string }): { goals: GoalNode[]; count: number }`
     - `convertNodeToBranch(goals: GoalNode[], nodeId: string, initialChildTitles?: string[]): GoalNode[]`
     - `convertNodeToTask(goals: GoalNode[], nodeId: string, initialSteps?: string[]): GoalNode[]`

4. **Date Validation in `src/lib/aiPlan.ts`**:
   - Location: `src/lib/aiPlan.ts`, lines 93–98:
     ```ts
     function isISODate(value: string): boolean {
       if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
       const [year, month, day] = value.split('-').map(Number);
       const date = new Date(year, month - 1, day);
       return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
     }
     ```
   - Demonstrates project standard for calendar-accurate ISO date verification.

---

## 2. Logic Chain

1. **Premise 1**: M1 delivers pure domain transformations. The test runner must execute these transformations in-memory with sub-second feedback.
   - *Supporting Observation 1*: Running Vitest synchronously executes 38 tests in 65 ms test time (571 ms total process duration).
2. **Premise 2**: Existing `addBlueprintChildren` contains a hard block for nodes with checklist steps (`hasGoalExecutionState`). However, requirements R1 and R2 mandate that expanding nodes or bulk adding children inside nodes must be flexible and allow transition from task with steps to branch with children.
   - *Supporting Observation 2 & 3*: Line 77 of `blueprintStudio.ts` and test line 59 of `blueprintStudio.test.ts` conflict with R1/R2.
   - *Inference*: Implementers must introduce `addBlueprintChildrenBulk` (and `convertNodeToBranch`) that unblock or transition nodes cleanly, or update `addBlueprintChildren` while adjusting the legacy test assertion.
3. **Premise 3**: R3 requires dual set operations: Set-Union for additions (case-insensitive deduplication) and Set-Difference for removals (silent skip for non-existent steps). In addition, completed steps (`stepDone[i] === true`) represent user progress and must be protected from accidental bulk removal.
   - *Supporting Observation 3*: Verified via `ORIGINAL_REQUEST.md` line 20–24 and `PROJECT.md` line 21–23.
   - *Inference*: Test cases for R3 must rigorously verify that duplicate additions are skipped, non-existent deletions never throw errors, and completed steps remain intact even if their label matches `stepsToRemove`.
4. **Premise 4**: R4 requires bulk date application with format and constraint validation (`startDate <= endDate`) and the ability to clear dates (`null` / `undefined`).
   - *Supporting Observation 3 & 4*: Date validation logic exists in `aiPlan.ts` but is absent from `studioWorkspace.ts`.
   - *Inference*: Unit tests must assert that invalid formats (e.g. `'10/20/2026'`, `'2026-02-31'`) and inverted ranges (`startDate > endDate`) are rejected, while clearing dates works cleanly.

---

## 3. Caveats

1. **UI Layer Deferred to M4**: This investigation and test design exclusively cover the domain and algorithm layer (M1). State machine reducers (M3) and React UI components (M4) are separate downstream milestones.
2. **E2E 4-Tier Test Suite Scope**: A separate file `src/lib/blueprintStudioE2E.test.ts` is slated for Milestone 2. The unit test specifications provided in `analysis.md` can be integrated directly into `src/lib/blueprintStudio.test.ts` or a dedicated test file to verify M1 completion prior to M2.
3. **No Direct Production Code Edits**: In strict adherence to the Explorer archetype guidelines, no production files in `src/` were edited during this investigation.

---

## 4. Conclusion

1. The existing Vitest infrastructure is healthy, fast, and fully prepared to host the M1 test suites.
2. We have designed and documented **44 test scenarios** covering all 4 core requirements:
   - **R1 (12 test cases)**: Empty node expansion to task/branch, node conversion with steps, step normalization, branch protection, and immutability.
   - **R2 (12 test cases)**: Multi-parent bulk addition, UID uniqueness, per-parent sibling deduplication, mixed parent sets, unblocking nodes with steps, and input normalization.
   - **R3 (11 test cases)**: Set-Union step addition without duplicates, Set-Difference step removal with silent skips, completed step protection, simultaneous add/remove, and status rollups.
   - **R4 (12 test cases)**: Single and bulk date assignment, partial updates, date clearing (`null`), ISO regex & calendar validity, and `startDate <= endDate` constraint enforcement.
3. Implementers can directly copy the executable test suites from `analysis.md` into Vitest.

---

## 5. Verification Method

### How to Independently Verify:
1. **Inspect Test Specifications**:
   Read `d:\Production\Projects\YouDO\.agents\teamwork\m1_explorer_3\analysis.md` sections 4–7 for the complete test case matrices and executable test code.
2. **Run Baseline Tests**:
   Execute the baseline Vitest command:
   ```powershell
   npx vitest run src/lib/blueprintStudio.test.ts src/lib/studioWorkspace.test.ts
   ```
   Confirm all 38 existing tests pass.
3. **Execute Post-Implementation Verification**:
   Once M1 domain functions are implemented, run:
   ```powershell
   npx vitest run src/lib/blueprintStudio.test.ts
   ```
   Or run the full test suite:
   ```powershell
   npm test
   ```
4. **Invalidation Conditions**:
   - If `diffBlueprintSteps` removes a completed step (`stepDone[i] === true`), test R3-06 fails.
   - If `addBlueprintChildrenBulk` creates duplicate sibling titles under the same parent, test R2-04 fails.
   - If `addBlueprintChildrenBulk` generates identical UIDs for children under different parents, test R2-03 fails.
   - If `setGoalDatesBulk` permits `startDate > endDate`, test R4-09 fails.
