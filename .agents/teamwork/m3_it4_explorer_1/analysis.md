# Analysis Report: Path-Aware Active Task Guard Specialist

**Target**: `src/components/studio/blueprintStudioState.ts` & `src/lib/studioWorkspace.ts`  
**Agent**: M3 It4 Explorer 1 (Path-Aware Active Task Guard Specialist)  
**Parent Conversation ID**: `b50e5d61-aab8-4da0-9abc-a466bca2446b`  
**Milestone**: Milestone 3 Remediation (Iteration 4)  
**Date**: 2026-10-08  

---

## 1. Executive Summary

During the Milestone 2 & 3 Gate Review, Challenger 1 issued `REQUEST_CHANGES` due to a critical defect in `src/components/studio/blueprintStudioState.ts` lines 719–724:
`removeNodes(ids)` checked only whether `ids.includes(state.activeGoalNodeId)`. When a caller/user requested deletion of any ancestor container (e.g., a parent branch folder or root goal containing the active task), `ids.includes(...)` returned `false`. Consequently, the ancestor was deleted along with all its descendants, silently destroying the active session task and violating active focus session integrity.

This analysis provides:
1. A forensic dissection of the ancestor deletion bypass in `removeNodes`.
2. A robust path-aware active task guard utilizing `findBlueprintPath` to reject deletion of `activeGoalNodeId` or any of its container ancestors with the standard message: `'Cannot delete active session task or its container.'`.
3. A systematic audit of all 10 controller methods and all 20 reducer action branches, verifying whether any other operation needs path-aware protection.
4. Exact, drop-in TypeScript code recommendations and test suite updates for Worker implementation.

---

## 2. Examination of `removeNodes` in `blueprintStudioState.ts`

### 2.1 Current Implementation (lines 718–739)

```ts
removeNodes(ids: string[]): { success: boolean; count: number; error?: string } {
  if (state.activeGoalNodeId && ids.includes(state.activeGoalNodeId)) {
    const errMsg = 'Cannot delete active session task.';
    dispatch({ type: 'SET_ERROR', error: errMsg });
    return { success: false, count: 0, error: errMsg };
  }

  const nextGoals = removeBlueprintNodes(state.draftGoals, ids);
  if (nextGoals !== state.draftGoals) {
    const nextSelected = new Set(state.selectedIds);
    const nextExpanded = new Set(state.expandedIds);
    ids.forEach((id) => {
      nextSelected.delete(id);
      nextExpanded.delete(id);
    });
    dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Removed ${ids.length} nodes` });
    dispatch({ type: 'SET_SELECTED_IDS', selectedIds: nextSelected });
    dispatch({ type: 'SET_EXPANDED_IDS', expandedIds: nextExpanded });
  }

  return { success: true, count: ids.length };
}
```

### 2.2 Mechanism of Failure
1. **Direct Containment Check Only**: The guard evaluates `ids.includes(state.activeGoalNodeId)`.
2. **Hierarchical Tree Deletion**: In a tree structure:
   ```
   root-1 (goal)
    └── branch-math (node/branch)
         └── task-active-session (node/task endpoint, activeGoalNodeId)
   ```
   When `ids = ['branch-math']`:
   - `ids.includes('task-active-session')` is `false`.
   - The guard is bypassed.
   - `removeBlueprintNodes(state.draftGoals, ['branch-math'])` traverses the tree and removes `branch-math` and all its child nodes.
   - Result: `task-active-session` is completely deleted from `draftGoals`.
   - Return value: `{ success: true, count: 1 }`, with zero error reported.
3. **Multi-Target Incomplete Protection**: If a user selects `['branch-math', 'task-unrelated']`, the entire batch deletion succeeds, deleting the container of the active task.
4. **Empty / Non-Existent Input Side Effects**:
   - Calling `removeNodes([])` is handled correctly by `removeBlueprintNodes` (returning reference equality), but non-existent IDs like `removeNodes(['ghost-id'])` allocate a new array in `goals.map(...)`, causing `nextGoals !== state.draftGoals` to evaluate to `true` and pushing an unneeded undo snapshot.

---

## 3. Formulating the Path-Aware Active Task Guard

### 3.1 Understanding `findBlueprintPath`
`findBlueprintPath(goals: GoalNode[], id: string): GoalNode[]` is defined in `src/lib/blueprintStudio.ts:846` and imported into `src/lib/studioWorkspace.ts:3`.
When called with `(state.draftGoals, state.activeGoalNodeId)`:
- It returns the ordered lineage of nodes starting from the top-level root goal down to the active goal node itself:
  `[rootNode, ..., parentNode, activeGoalNode]`
- If `activeGoalNodeId` is not found in `state.draftGoals`, it returns an empty array `[]`.

### 3.2 Guard Condition
Any operation that deletes ANY node along this path will, by definition of tree hierarchy, delete `activeGoalNodeId`.
Therefore, deletion must be rejected if `ids` contains:
1. `state.activeGoalNodeId` directly, OR
2. Any ancestor node present in `findBlueprintPath(state.draftGoals, state.activeGoalNodeId)`.

### 3.3 Algorithm & Implementation
```ts
if (state.activeGoalNodeId) {
  const activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId);
  const activePathIds = new Set(activePath.map((node) => node.id));
  if (ids.includes(state.activeGoalNodeId) || ids.some((id) => activePathIds.has(id))) {
    const errMsg = 'Cannot delete active session task or its container.';
    dispatch({ type: 'SET_ERROR', error: errMsg });
    return { success: false, count: 0, error: errMsg };
  }
}
```

### 3.4 Invariants Guaranteed
1. **Direct Rejection**: Calling `removeNodes([activeGoalNodeId])` is rejected.
2. **Container Rejection**: Calling `removeNodes([parentId])` or `removeNodes([rootGoalId])` is rejected.
3. **Atomic Batch Rejection**: Calling `removeNodes([otherNodeId, parentId])` fails atomically; no nodes are deleted, no state is dirtied, and no undo snapshot is created.
4. **Granular Sibling Allowance**: Deleting sibling nodes (nodes under `parentId` that are NOT ancestors of `activeGoalNodeId`) is permitted.
5. **Dynamic Shift**: When `setActiveGoalNodeId` changes or is cleared to `undefined`, the guard automatically re-evaluates against the newly active path or clears.

---

## 4. Comprehensive Audit of Controller Methods and Reducer Actions

We audited all 10 controller methods and all 20 reducer action branches in `src/components/studio/blueprintStudioState.ts` to identify if any other method requires path-aware protection for `activeGoalNodeId`.

### 4.1 Controller Methods Audit

| Method | Current Guard | Can it delete or mutate active session task via ancestor? | Path-Aware Protection Needed? | Rationale |
|---|---|:---:|:---:|---|
| **`removeNodes(ids)`** | Direct `ids.includes` | **YES** | **YES (CRITICAL)** | Deleting an ancestor container recursively destroys `activeGoalNodeId`. Path-aware guard required. |
| **`addChildrenInside(parentIds, titles)`** | Direct `parentIds.includes` | **NO** | **NO** | Adding children to an ancestor creates new siblings to `activeGoalNodeId` or its container; it does not convert or mutate `activeGoalNodeId`. Adding children to `activeGoalNodeId` itself is already guarded. |
| **`diffSteps(targetIds, stepsToAdd, stepsToRemove)`** | Direct `targetIds.includes` | **NO** | **NO** | Step modifications only apply to nodes explicitly matched in `targetIds`. Steps are never inherited or deleted recursively down the tree. Direct task step deletion is already guarded. |
| **`convertToBranch(nodeId, ...)`** | Direct `nodeId === activeGoalNodeId` | **NO** | **NO** | Ancestors of `activeGoalNodeId` already have children (at least the branch/task leading to `activeGoalNodeId`). In `convertNodeToBranch`, existing children are always preserved (`...node.children`). Direct conversion of `activeGoalNodeId` is already guarded. |
| **`convertToTask(nodeId, initialSteps)`** | Direct `nodeId === activeGoalNodeId` | **NO** | **NO** | In `src/lib/blueprintStudio.ts:141`, `convertNodeToTask` explicitly returns `goals` unchanged if `target.kind === 'goal' || target.children.length > 0`. Because any ancestor has children, converting an ancestor to a task is a guaranteed domain no-op. Direct conversion of `activeGoalNodeId` is already guarded. |
| **`setDates(targetIds, dates)`** | Date format validation | **NO** | **NO** | Setting target dates on an ancestor does not remove or invalidate active session focus state. |
| **`duplicateNodes(ids)`** | None | **NO** | **NO** | Duplicating clones nodes with fresh UIDs (`uid('goal')`). The original `activeGoalNodeId` remains in place untouched. (Note: needs empty input guard `!ids \|\| ids.length === 0` to prevent undo stack pollution). |
| **`moveNodes(ids, destinationId)`** | `canMoveStudioItems` | **NO** | **NO** | Moving relocates nodes while preserving node IDs. The active session task remains intact and reconcilable by ID in `applyGoalTreeChange` (`src/store.tsx`). |
| **`patchItems(patches)`** | None | **NO** | **NO** | Applies partial metadata updates (`title`, `description`, `pinned`, `startDate`, `endDate`). Does not delete or convert nodes. (Note: needs empty patches guard `Object.keys(patches).length === 0`). |
| **`topSelectedIds(goalTrees)`** | Read-only | **NO** | **NO** | Pure selection helper. |

### 4.2 Reducer Actions Audit
The reducer manages 20 action branches:
- Selection: `TOGGLE_SELECT`, `SELECT_ONLY`, `CLEAR_SELECTION`, `SELECT_ALL`, `SET_SELECTION_MODE`, `SET_SELECTED_IDS`
- Modals: `OPEN_MODAL`, `CLOSE_MODAL`
- Transactions: `APPLY_CHANGE`, `UNDO`, `REDO`, `RESET`
- Tree Expansion: `TOGGLE_EXPAND`, `EXPAND_ALL`, `COLLAPSE_ALL`, `SET_EXPANDED_IDS`
- Notifications & Session: `SET_ACTIVE_GOAL_NODE_ID`, `SET_ERROR`, `SET_STATUS`, `CLEAR_MESSAGES`

**Finding**: All reducer actions are primitive state transactions that either update UI sets or push precomputed tree states to the history stacks. Business rule validation and session integrity checks properly belong exclusively in the controller methods before `APPLY_CHANGE` is dispatched. None of the reducer actions require path-aware protection.

---

## 5. Additional Defect Fixes Identified in Challenger 1 Analysis

To ensure complete remediation in Iteration 4, the following related defects identified by Challenger 1 should be applied alongside the path-aware guard:

1. **`duplicateNodes` Empty Input Guard**:
   When `ids = []`, `duplicateStudioItems` generates a new array with cloned objects, causing `nextGoals !== state.draftGoals` to be true and polluting `undoStack`.
   **Fix**: Return early `{ success: true }` if `!ids || ids.length === 0`.

2. **`patchItems` Empty Input Guard**:
   When `patches = {}`, `patchStudioItems` calls `goals.map(...)`, generating a new array and polluting `undoStack`.
   **Fix**: Return early `{ success: true }` if `!patches || Object.keys(patches).length === 0`.

3. **`removeNodes` Empty & Non-Existent Input Guard**:
   When `ids` is empty or contains non-existent node IDs, `removeBlueprintNodes` allocates a new array and dispatches `APPLY_CHANGE`.
   **Fix**: Check if `ids` is empty or if none of the IDs exist in `state.draftGoals` before dispatching `APPLY_CHANGE`.

4. **`studioWorkspace.ts` Re-Export**:
   Re-export `findBlueprintPath` from `src/lib/studioWorkspace.ts` so callers can import it from either `studioWorkspace` or `blueprintStudio`.

5. **`useBlueprintStudioState` Render Effect**:
   Wrap `controller.setActiveGoalNodeId` in `useEffect` to avoid dispatching state actions during component render.

---

## 6. Exact Code Recommendations for Worker

### 6.1 `src/lib/studioWorkspace.ts`
Re-export `findBlueprintPath`:
```ts
// In src/lib/studioWorkspace.ts line 3:
import { findBlueprintPath, flattenBlueprint, isValidISODate, removeBlueprintNodes } from './blueprintStudio';

// Add export:
export { findBlueprintPath } from './blueprintStudio';
```

### 6.2 `src/components/studio/blueprintStudioState.ts`

#### Import update (lines 18–25):
```ts
import {
  duplicateStudioItems,
  findBlueprintPath,
  moveStudioItems,
  patchStudioItems,
  type StudioPatch,
  topStudioSelection,
} from '../../lib/studioWorkspace';
```

#### Remediation in `removeNodes` (lines 718–739):
```ts
    removeNodes(ids: string[]): { success: boolean; count: number; error?: string } {
      if (!ids || ids.length === 0) {
        return { success: true, count: 0 };
      }

      if (state.activeGoalNodeId) {
        const activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId);
        const activePathIds = new Set(activePath.map((node) => node.id));
        if (ids.includes(state.activeGoalNodeId) || ids.some((id) => activePathIds.has(id))) {
          const errMsg = 'Cannot delete active session task or its container.';
          dispatch({ type: 'SET_ERROR', error: errMsg });
          return { success: false, count: 0, error: errMsg };
        }
      }

      const existingSet = new Set(flattenBlueprint(state.draftGoals).map((n) => n.id));
      const existingCount = ids.filter((id) => existingSet.has(id)).length;
      if (existingCount === 0) {
        return { success: true, count: 0 };
      }

      const nextGoals = removeBlueprintNodes(state.draftGoals, ids);
      if (nextGoals !== state.draftGoals) {
        const nextSelected = new Set(state.selectedIds);
        const nextExpanded = new Set(state.expandedIds);
        ids.forEach((id) => {
          nextSelected.delete(id);
          nextExpanded.delete(id);
        });
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Removed ${existingCount} nodes` });
        dispatch({ type: 'SET_SELECTED_IDS', selectedIds: nextSelected });
        dispatch({ type: 'SET_EXPANDED_IDS', expandedIds: nextExpanded });
      }

      return { success: true, count: existingCount };
    },
```

#### Remediation in `duplicateNodes` (lines 741–747):
```ts
    duplicateNodes(ids: string[]): ActionSimpleResult {
      if (!ids || ids.length === 0) {
        return { success: true };
      }
      const nextGoals = duplicateStudioItems(state.draftGoals, ids);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Duplicated ${ids.length} items` });
      }
      return { success: true };
    },
```

#### Remediation in `patchItems` (lines 757–763):
```ts
    patchItems(patches: Record<string, StudioPatch>): ActionSimpleResult {
      if (!patches || Object.keys(patches).length === 0) {
        return { success: true };
      }
      const nextGoals = patchStudioItems(state.draftGoals, patches);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Patched items' });
      }
      return { success: true };
    },
```

#### Remediation in `useBlueprintStudioState` (lines 807–809):
```ts
  useEffect(() => {
    if (controller.activeGoalNodeId !== options.activeGoalNodeId) {
      controller.setActiveGoalNodeId(options.activeGoalNodeId);
    }
  }, [controller, options.activeGoalNodeId]);
```

---

## 7. Test Suite Updates & Additions

### 7.1 Updates in `blueprintStudioState.adversarial.test.ts`
1. **Probe 2.10 & 2.11**:
   Update assertion string from `'Cannot delete active session task.'` to `'Cannot delete active session task or its container.'` (or use `.toContain('Cannot delete active session task')`).
2. **Probe 2.13**:
   Update from exploratory observation to strict failure assertion:
   ```ts
   const res = studio.removeNodes(['branch-math']);
   expect(res.success).toBe(false);
   expect(res.error).toBe('Cannot delete active session task or its container.');
   expect(findGoal(studio.draftGoals, 'task-active-session')).toBeDefined();
   ```
3. **Probe 3.3**:
   Update from bug-reproduction assertions (`expect(pollutes).toBe(true)`) to verification of clean undo stack:
   ```ts
   expect(studio.undoStack).toHaveLength(0);
   studio.duplicateNodes([]);
   expect(studio.undoStack).toHaveLength(0);

   studio.patchItems({});
   expect(studio.undoStack).toHaveLength(0);

   studio.removeNodes(['ghost-id']);
   expect(studio.undoStack).toHaveLength(0);
   ```

### 7.2 Additional Unit Tests in `blueprintStudioState.test.ts`
Add dedicated test cases under `describe('Active Session Task Guard')`:
```ts
it('disallows removing parent or ancestor container of activeGoalNodeId', () => {
  const goals = createSampleGoals();
  const studio = createBlueprintStudioController({
    goals,
    activeGoalNodeId: 'task-1', // task-1 is inside branch-1 which is inside root-1
  });

  // Attempt to delete parent branch
  const resBranch = studio.removeNodes(['branch-1']);
  expect(resBranch.success).toBe(false);
  expect(resBranch.error).toBe('Cannot delete active session task or its container.');
  expect(studio.canUndo).toBe(false);

  // Attempt to delete root goal
  const resRoot = studio.removeNodes(['root-1']);
  expect(resRoot.success).toBe(false);
  expect(resRoot.error).toBe('Cannot delete active session task or its container.');
  expect(studio.canUndo).toBe(false);

  // Permitted: deleting sibling branch or sibling task that does not contain activeGoalNodeId
  const resSibling = studio.removeNodes(['task-3']);
  expect(resSibling.success).toBe(true);
  expect(studio.canUndo).toBe(true);
});
```
