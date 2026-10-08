# Adversarial Analysis: Milestone 2 & 3 Gate

**Target**: `src/components/studio/blueprintStudioState.ts`  
**Challenger**: Challenger 1 (Empirical Challenger)  
**Verification Harness**: `src/components/studio/blueprintStudioState.adversarial.test.ts` (23 passing tests)  
**Verdict**: **REQUEST_CHANGES** ⚠️  
**Overall Risk Assessment**: **HIGH**

---

## Executive Summary

As Challenger 1, I conducted an adversarial probe and stress-testing campaign targeting `src/components/studio/blueprintStudioState.ts`. The investigation focused on two critical architectural requirements:
1. **Undo / Redo Transactions Stress**: Multi-cycle undo/redo loops, branching history invalidation, immutability, and state cleanliness relative to base.
2. **Active Session Task Guard Stress**: Resistance to conversion, child addition, step deletion, and node removal on `activeGoalNodeId`.

While the core undo/redo mechanism and direct `activeGoalNodeId` guards perform well under standard conditions, empirical probes identified **two high-severity failure modes** and **two medium-severity defects**:
1. **[HIGH] Active Session Task Guard Bypass via Ancestor Deletion**: Calling `removeNodes(ids)` where `ids` contains an ancestor (parent branch or root goal) of `activeGoalNodeId` completely deletes the active session task without error.
2. **[HIGH] Spurious Undo Frame on `duplicateNodes([])`**: Calling `duplicateNodes([])` with an empty array rebuilds the entire tree into new object references, treating it as a mutation and polluting `undoStack`.
3. **[MEDIUM] Spurious Undo Frame on `patchItems({})`**: Calling `patchItems({})` with empty patches creates a new array reference via `goals.map`, polluting `undoStack`.
4. **[MEDIUM] Spurious Undo Frame on `removeNodes([nonExistent])`**: Calling `removeNodes` with non-existent IDs creates a new array reference via `removeBlueprintNodes`, pushing an unneeded undo snapshot and falsely reporting items deleted.

---

## Empirical Verification Findings

### Challenge 1 (HIGH): Active Session Task Guard Bypass via Ancestor Deletion
- **Location**: `src/components/studio/blueprintStudioState.ts:719-724`
- **Assumption Challenged**: The active session task cannot be removed from the goal tree while in an active focus session.
- **Vulnerability**:
  In `blueprintStudioState.ts`:
  ```ts
  removeNodes(ids: string[]): { success: boolean; count: number; error?: string } {
    if (state.activeGoalNodeId && ids.includes(state.activeGoalNodeId)) {
      const errMsg = 'Cannot delete active session task.';
      dispatch({ type: 'SET_ERROR', error: errMsg });
      return { success: false, count: 0, error: errMsg };
    }
  ```
  The guard only checks `ids.includes(state.activeGoalNodeId)`. If `ids` contains the parent branch (e.g. `'branch-math'`) or a grandparent goal containing `activeGoalNodeId`, `ids.includes(...)` evaluates to `false`. The controller proceeds to execute `removeBlueprintNodes(state.draftGoals, ids)`.
- **Empirical Proof (`Probe 2.13`)**:
  Executing `studio.removeNodes(['branch-math'])` where `branch-math` is the parent of `task-active-session`:
  ```ts
  const res = studio.removeNodes(['branch-math']);
  expect(res.success).toBe(true);
  expect(findGoal(studio.draftGoals, 'task-active-session')).toBeNull(); // Task was deleted!
  ```
  `res.success` is `true`, `findGoal(...)` returns `null`. The active session task was silently deleted from the blueprint draft.
- **Blast Radius**: A user editing the blueprint during an active focus session can delete a parent folder or goal, destroying their active focus session task linkage and violating session integrity.
- **Mitigation**:
  Before deleting nodes, resolve the path of `activeGoalNodeId` and verify that neither `activeGoalNodeId` nor any of its ancestors are in `ids`:
  ```ts
  if (state.activeGoalNodeId) {
    const activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId).map((n) => n.id);
    if (ids.some((id) => activePath.includes(id))) {
      const errMsg = 'Cannot delete active session task or its container.';
      dispatch({ type: 'SET_ERROR', error: errMsg });
      return { success: false, count: 0, error: errMsg };
    }
  }
  ```

---

### Challenge 2 (HIGH): `duplicateNodes([])` Pollutes Undo Stack
- **Location**: `src/components/studio/blueprintStudioState.ts:741-747` & `src/lib/studioWorkspace.ts:93-112`
- **Assumption Challenged**: No-op actions with empty inputs do not modify state or push spurious snapshots to `undoStack`.
- **Vulnerability**:
  In `blueprintStudioState.ts`:
  ```ts
  duplicateNodes(ids: string[]): ActionSimpleResult {
    const nextGoals = duplicateStudioItems(state.draftGoals, ids);
    if (nextGoals !== state.draftGoals) {
      dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Duplicated ${ids.length} items` });
    }
    return { success: true };
  }
  ```
  When `ids` is `[]`, `duplicateStudioItems` traverses the tree and creates new object shallow clones `{ ...node, children: visit(node.children) }` for all nodes. Because it returns a new array with new object instances, `nextGoals !== state.draftGoals` is `true`.
- **Empirical Proof (`Probe 3.3`)**:
  ```ts
  expect(studio.undoStack).toHaveLength(0);
  studio.duplicateNodes([]);
  expect(studio.undoStack.length).toBe(1); // Polluted!
  ```
  `studio.undoStack.length` increases from 0 to 1, and the user must invoke `undo()` to revert a non-existent duplication.
- **Blast Radius**: UI multi-selection toolbars firing duplicate on empty or cleared selections pollute undo history, confuse the user with phantom "Duplicated 0 items" history steps, and waste memory.
- **Mitigation**:
  Add an early return check:
  ```ts
  duplicateNodes(ids: string[]): ActionSimpleResult {
    if (!ids || ids.length === 0) return { success: true };
    const nextGoals = duplicateStudioItems(state.draftGoals, ids);
    ...
  ```

---

### Challenge 3 (MEDIUM): `patchItems({})` Pollutes Undo Stack
- **Location**: `src/components/studio/blueprintStudioState.ts:757-763` & `src/lib/studioWorkspace.ts:10-50`
- **Assumption Challenged**: Passing empty patches does not mutate state or push undo frames.
- **Vulnerability**:
  `patchStudioItems(goals, patches)` returns `goals.map(visit)`. Even if `patches` is `{}` with zero patches, `goals.map` returns a newly allocated array reference. In `blueprintStudioState.ts`:
  ```ts
  const nextGoals = patchStudioItems(state.draftGoals, patches);
  if (nextGoals !== state.draftGoals) { // ALWAYS TRUE!
    dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Patched items' });
  }
  ```
- **Empirical Proof (`Probe 3.3`)**:
  ```ts
  expect(studio.undoStack).toHaveLength(0);
  studio.patchItems({});
  expect(studio.undoStack.length).toBe(1); // Polluted!
  ```
- **Blast Radius**: Detail edit modal sheets dismissing or submitting empty patches push spurious undo states.
- **Mitigation**:
  Add an early return:
  ```ts
  patchItems(patches: Record<string, StudioPatch>): ActionSimpleResult {
    if (!patches || Object.keys(patches).length === 0) return { success: true };
    ...
  ```

---

### Challenge 4 (MEDIUM): `removeNodes([nonExistentId])` Pollutes Undo Stack
- **Location**: `src/components/studio/blueprintStudioState.ts:725-738`
- **Assumption Challenged**: Attempting to delete non-existent IDs is a clean no-op that does not push undo frames.
- **Vulnerability**:
  When `ids` contains an ID that does not exist in the tree, `removeBlueprintNodes(goals, ids)` calls `goals.map(...)`, creating a new array reference. Because `nextGoals !== state.draftGoals` is `true`, `APPLY_CHANGE` is dispatched, creating an undo frame with `description: "Removed 1 nodes"` when 0 nodes were removed.
- **Empirical Proof (`Probe 3.3`)**:
  ```ts
  studio.removeNodes(['ghost-id']);
  expect(studio.undoStack.length).toBe(1); // Polluted!
  ```
- **Blast Radius**: Unnecessary undo steps and incorrect status messaging when deleting stale or already-deleted items.
- **Mitigation**:
  Filter `ids` against existing nodes in `state.draftGoals` or check whether `countBlueprintNodes(nextGoals) < countBlueprintNodes(state.draftGoals)` before dispatching `APPLY_CHANGE`.

---

## Robust Areas Verified

The following areas were stress-tested and found to be robust and compliant:
1. **Repeated Undo/Redo Cycling (`Probe 1.1`)**:
   - 100 consecutive cycles of `undo()` -> `redo()` maintained exact state consistency.
   - At the base of the undo stack, `isDirty` was strictly `false`, `canUndo` was `false`, and `JSON.stringify(draftGoals) === JSON.stringify(baseGoals)`.
2. **Branching History Invalidation (`Probe 1.2`)**:
   - Applying a new mutation after undoing 2 steps cleanly erased `redoStack` (`redoStack.length === 0`, `canRedo === false`).
   - Undoing subsequent changes restored the correct historical branch without leaking orphan forward states.
3. **Deep Multi-Action Unwinding (`Probe 1.3`)**:
   - A 6-mutation heterogeneous pipeline (`addChildrenInside`, `diffSteps`, `setDates`, `convertToTask`, `convertToBranch`, `removeNodes`) unwound step-by-step with 100% snapshot parity at every level.
4. **Immutability Audit (`Probe 1.4`)**:
   - Deep-freezing base goals (`Object.freeze`) produced zero runtime errors during 50+ mutations and undos, verifying that no in-place array/object mutations occur.
5. **Direct Active Session Task Guards (`Probes 2.1 – 2.12`)**:
   - Direct `convertToBranch(activeGoalNodeId)`: Blocked (`success: false`, error set).
   - Direct `convertToTask(activeGoalNodeId)`: Blocked (`success: false`, error set).
   - Direct `addChildrenInside([activeGoalNodeId])`: Blocked (`success: false`, error set).
   - Multi-parent batch `addChildrenInside([other1, activeGoalNodeId, other2])`: Blocked atomically; no children added to any parent.
   - Direct step deletion in `diffSteps([activeGoalNodeId], [], ['step'])`: Blocked (`success: false`, error set).
   - Simultaneous addition and deletion on `activeGoalNodeId`: Blocked atomically; additions discarded.
   - Multi-target step deletion batch: Blocked atomically.
   - Step additions on `activeGoalNodeId` (`diffSteps([activeGoalNodeId], ['bonus'], [])`): Explicitly permitted and cleanly undoable.
   - Direct `removeNodes([activeGoalNodeId])`: Blocked (`success: false`, error set).
   - Multi-target removal batch: Blocked atomically; no nodes removed.
   - Dynamic `setActiveGoalNodeId` updates: Guard shifts immediately to new target and unlocks previous target.
6. **High-Volume Randomized Stress (`Probe 3.2`)**:
   - 200 randomized interleaved operations (mutations, guarded attempts, undos, redos) maintained strict stack invariants throughout.

---

## Test Execution Matrix

| Test Suite / Probe | Command | Result |
|---|---|:---:|
| **Adversarial Test Probes** | `npx vitest run src/components/studio/blueprintStudioState.adversarial.test.ts` | **23 / 23 Passed** (63ms) |
| **Reducer Unit Tests** | `npx vitest run src/components/studio/blueprintStudioState.test.ts` | **47 / 47 Passed** (32ms) |
| **Domain Unit Tests** | `npx vitest run src/lib/blueprintStudio.test.ts` | **74 / 74 Passed** (84ms) |
| **E2E Test Suite** | `npx vitest run src/lib/blueprintStudioE2E.test.ts` | **70 / 70 Passed** (101ms) |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **Clean (0 errors)** |
| **ESLint Audit** | `npx eslint src/components/studio/blueprintStudioState.adversarial.test.ts` | **Clean (0 errors, 0 warnings)** |

---

## Actionable Recommendations for Implementer

1. **Fix Ancestor Deletion Guard**:
   In `src/components/studio/blueprintStudioState.ts` line 719 (`removeNodes`):
   ```ts
   if (state.activeGoalNodeId) {
     const activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId).map((n) => n.id);
     if (ids.some((id) => activePath.includes(id))) {
       const errMsg = 'Cannot delete active session task.';
       dispatch({ type: 'SET_ERROR', error: errMsg });
       return { success: false, count: 0, error: errMsg };
     }
   }
   ```
2. **Add Empty Input Guards for Actions**:
   - In `duplicateNodes`: If `!ids || ids.length === 0`, return `{ success: true }`.
   - In `patchItems`: If `!patches || Object.keys(patches).length === 0`, return `{ success: true }`.
   - In `removeNodes`: If `!ids || ids.length === 0`, return `{ success: true, count: 0 }`. If no nodes matched for removal, do not dispatch `APPLY_CHANGE`.
