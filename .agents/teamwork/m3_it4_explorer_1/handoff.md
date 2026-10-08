# Handoff Report: Path-Aware Active Task Guard Specialist

**Agent ID / Role**: M3 It4 Explorer 1 (Path-Aware Active Task Guard Specialist)  
**Parent Conversation ID**: `b50e5d61-aab8-4da0-9abc-a466bca2446b`  
**Milestone**: Milestone 3 Remediation (Iteration 4)  
**Handoff Type**: Hard (Investigation & Analysis Complete)  
**Date**: 2026-10-08  

---

## 1. Observation

1. **`removeNodes` Vulnerability in `src/components/studio/blueprintStudioState.ts` (lines 718–724)**:
   ```ts
   removeNodes(ids: string[]): { success: boolean; count: number; error?: string } {
     if (state.activeGoalNodeId && ids.includes(state.activeGoalNodeId)) {
       const errMsg = 'Cannot delete active session task.';
       dispatch({ type: 'SET_ERROR', error: errMsg });
       return { success: false, count: 0, error: errMsg };
     }
   ```
   Observed directly: The method performs a direct membership check `ids.includes(state.activeGoalNodeId)`. When deleting a container node (e.g. `'branch-math'` which contains `'task-active-session'`), `ids.includes(...)` evaluates to `false`. The method proceeds to call `removeBlueprintNodes(state.draftGoals, ids)`, which removes `'branch-math'` and all child nodes. As observed in `src/components/studio/blueprintStudioState.adversarial.test.ts:570` (`Probe 2.13`), `studio.removeNodes(['branch-math'])` returns `{ success: true, count: 1 }` and completely removes `'task-active-session'` from `draftGoals`.

2. **Ancestor Path Traversal in `src/lib/blueprintStudio.ts` (lines 846–860)**:
   ```ts
   export function findBlueprintPath(goals: GoalNode[], id: string): GoalNode[] {
     const walk = (node: GoalNode): GoalNode[] => {
       if (node.id === id) return [node];
       for (const child of node.children) {
         const path = walk(child);
         if (path.length) return [node, ...path];
       }
       return [];
     };
     for (const root of goals) {
       const path = walk(root);
       if (path.length) return path;
     }
     return [];
   }
   ```
   Observed directly: `findBlueprintPath(goals, id)` returns the full ordered lineage from root goal down to the target node (`[rootNode, ..., parentNode, targetNode]`). Therefore, any node ID present in `findBlueprintPath(goals, activeGoalNodeId)` is either `activeGoalNodeId` itself or an ancestor whose deletion would destroy `activeGoalNodeId`.

3. **Re-Export in `src/lib/studioWorkspace.ts`**:
   `src/lib/studioWorkspace.ts` line 3 currently imports `findBlueprintPath` from `./blueprintStudio` for internal helper functions (`topStudioSelection`, `canMoveStudioItems`, `studioItemPath`), but does not re-export it. Re-exporting `findBlueprintPath` from `studioWorkspace.ts` exposes it cleanly for the state controller.

4. **Controller Methods Audit across `blueprintStudioState.ts`**:
   - `addChildrenInside`: Already guards `parentIds.includes(state.activeGoalNodeId)`. Adding children inside an ancestor only adds sibling nodes to `activeGoalNodeId`'s subtree; it does not mutate or convert `activeGoalNodeId`.
   - `diffSteps`: Operates strictly on matching IDs in `targetIds`. Deleting steps from an ancestor does not affect `activeGoalNodeId`'s checklist.
   - `convertToBranch`: Converts a node to a branch while preserving all existing children (`...node.children`). Direct conversion of `activeGoalNodeId` is already guarded.
   - `convertToTask`: Rejects any node with `children.length > 0` or `kind === 'goal'` (`src/lib/blueprintStudio.ts:141`). Ancestors cannot be converted to tasks.
   - `duplicateNodes` & `patchItems`: Do not delete nodes, but pollute `undoStack` when called with empty inputs (`ids = []` or `patches = {}`).
   - `moveNodes`: Relocates nodes while preserving node IDs. Reconciled cleanly by ID in global store.
   - `topSelectedIds`: Read-only helper.

5. **Test Suite Baseline**:
   - `npx vitest run src/components/studio/`: 3 test files, 86 tests passed (790ms).
   - `npx tsc --noEmit`: 0 errors.

---

## 2. Logic Chain

1. **Step 1 (From Observation 1)**: Deleting any container node (parent branch, grandparent, or root goal) that encloses `activeGoalNodeId` recursively deletes `activeGoalNodeId`. Because `removeNodes` currently only checks direct array containment (`ids.includes(activeGoalNodeId)`), ancestor deletion bypasses the guard and deletes the active task.
2. **Step 2 (From Observation 2 & 3)**: `findBlueprintPath(state.draftGoals, state.activeGoalNodeId)` returns all ancestors and `activeGoalNodeId` itself. Therefore, checking whether `ids` contains `state.activeGoalNodeId` OR any ID returned by `findBlueprintPath` guarantees complete coverage against both direct task deletion and ancestor container deletion.
3. **Step 3 (From Observation 4)**: Auditing all remaining controller methods and reducer actions demonstrates that `removeNodes` is the sole operation capable of destroying `activeGoalNodeId` via an ancestor. `addChildrenInside`, `diffSteps`, `convertToBranch`, and `convertToTask` either preserve existing children or are domain no-ops on branch nodes.
4. **Step 4 (From Step 1, 2, and Observation 4)**: Updating `removeNodes` to inspect the path from `findBlueprintPath`, returning `'Cannot delete active session task or its container.'` on violation, and adding empty-input early returns to `duplicateNodes`, `patchItems`, and `removeNodes` will fully resolve all Challenger 1 defects without regressions.

---

## 3. Caveats

1. **Adversarial Test Assertions**: In `src/components/studio/blueprintStudioState.adversarial.test.ts` lines 513 and 534 (Probes 2.10 and 2.11), the existing test asserts `.toBe('Cannot delete active session task.')`. When the error string is updated to `'Cannot delete active session task or its container.'`, the test file must be updated accordingly (e.g. to `.toBe('Cannot delete active session task or its container.')` or `.toContain('Cannot delete active session task')`).
2. **Read-Only Explorer Boundary**: Per Teamwork protocol, this agent has performed read-only investigation and synthesized recommendations; no source code or test files in `src/` were edited during this step. The implementation will be executed by Worker.

---

## 4. Conclusion

The path-aware active task guard is fully formulated and ready for implementation.
1. Re-export `findBlueprintPath` from `src/lib/studioWorkspace.ts`.
2. Update `removeNodes` in `src/components/studio/blueprintStudioState.ts` to:
   - Extract `activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId)`.
   - Reject deletion if `ids.includes(state.activeGoalNodeId)` or any `activePath` ID is present in `ids`.
   - Set error message and return: `'Cannot delete active session task or its container.'`.
   - Early return `{ success: true, count: 0 }` for empty inputs or non-existent target IDs.
3. Add empty-input early returns to `duplicateNodes` and `patchItems`.
4. Wrap `controller.setActiveGoalNodeId` in `useEffect` in `useBlueprintStudioState`.
5. Update Probes 2.10, 2.11, 2.13, and 3.3 in `blueprintStudioState.adversarial.test.ts` to align with remediated behavior.

---

## 5. Verification Method

To independently verify the implementation after Worker changes:

1. **Run Studio Test Suites**:
   ```bash
   npx vitest run src/components/studio/blueprintStudioState.test.ts src/components/studio/blueprintStudioState.adversarial.test.ts src/components/studio/blueprintStudioStressProbes.test.ts
   ```
   *Expected*: All tests pass (86+ tests).

2. **Verify Ancestor Deletion Protection**:
   In `src/components/studio/blueprintStudioState.adversarial.test.ts`:
   - Probe 2.13: `studio.removeNodes(['branch-math'])` must return `{ success: false, error: 'Cannot delete active session task or its container.' }` and leave `findGoal(studio.draftGoals, 'task-active-session')` intact.

3. **Verify Empty Input Invariants**:
   - `studio.duplicateNodes([])` must leave `studio.undoStack.length === 0`.
   - `studio.patchItems({})` must leave `studio.undoStack.length === 0`.
   - `studio.removeNodes(['ghost-id'])` must leave `studio.undoStack.length === 0`.

4. **Run Project-Wide Validation**:
   ```bash
   npx tsc --noEmit
   npm test
   ```
   *Expected*: Zero TypeScript compilation errors; all project tests pass.
