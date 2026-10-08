# Analysis: Undo Stack & Referential Integrity Specialist Report (M3 It4 Explorer 2)

**Target Area**: Undo Stack Pollution, Referential Integrity, and Spurious Snapshots  
**Target Files**:
- `src/components/studio/blueprintStudioState.ts`
- `src/lib/studioWorkspace.ts`
- `src/lib/blueprintStudio.ts`
- `src/lib/goalTree.ts`  
**Author**: M3 It4 Explorer 2  
**Date**: 2026-10-08  

---

## 1. Executive Summary

During Milestone 2 & 3 Gate, Challenger 1 discovered that calling:
- `duplicateNodes([])`
- `patchItems({})`
- `removeNodes(['nonExistentId'])`
pushes spurious snapshots onto `undoStack`.

### Root Cause
The root cause is a dual-layer deficiency:
1. **Domain Helper Layer (`src/lib/studioWorkspace.ts` and `src/lib/blueprintStudio.ts`)**:
   Functions `duplicateStudioItems`, `patchStudioItems`, and `removeBlueprintNodes` allocate new array instances and/or clone objects unconditionally via `.map(...)` / `visit(...)`, even when input IDs/patches are empty (`[]` or `{}`) or no matching nodes exist in the tree.
2. **State Controller Layer (`src/components/studio/blueprintStudioState.ts`)**:
   The controller methods (`duplicateNodes`, `patchItems`, `removeNodes`) only compare reference equality (`nextGoals !== state.draftGoals`). Because the domain helpers always return fresh array references, `nextGoals !== state.draftGoals` evaluates to `true`, causing `dispatch({ type: 'APPLY_CHANGE' })` to execute. This:
   - Pollutes `undoStack` with duplicate draft snapshots.
   - Wipes out `redoStack` prematurely.
   - Sets erroneous descriptions like `"Duplicated 0 items"` or `"Removed 1 nodes"`.
   - In `removeNodes`, also bypasses the `activeGoalNodeId` guard when an ancestor branch is targeted.

### Recommended Remedy: Two-Tier Defense in Depth
1. **Tier 1 (Domain Helpers)**: Guarantee referential stability (`return goals`) in `duplicateStudioItems`, `patchStudioItems`, and `removeBlueprintNodes` when no modifications are made.
2. **Tier 2 (Controller & Reducer)**: Add early-return guards on empty/no-op inputs in `duplicateNodes`, `patchItems`, and `removeNodes`, and verify `!sameTree(nextGoals, state.draftGoals)` before dispatching `APPLY_CHANGE`. In `blueprintStudioReducer`, guard `APPLY_CHANGE` so that identical trees never create undo frames.

---

## 2. Detailed Root Cause Analysis

### 2.1 `duplicateNodes` & `duplicateStudioItems`
- **In `src/lib/studioWorkspace.ts:93-112`**:
  ```ts
  export function duplicateStudioItems(goals: GoalNode[], ids: string[]): GoalNode[] {
    const selected = new Set(topStudioSelection(goals, ids));
    ...
    const visit = (nodes: GoalNode[]): GoalNode[] => {
      ...
      return nodes.flatMap((node) => {
        const next = { ...node, children: visit(node.children) }; // Allocates new object for every node!
        if (!selected.has(node.id)) return [next];
        ...
      });
    };
    return visit(goals);
  }
  ```
  When `ids` is `[]` or contains non-existent IDs, `selected.size === 0`. However, `visit(goals)` still traverses the whole tree, creating shallow copies `{ ...node, children: visit(...) }` for every single node. The returned array is a new reference containing new node instances.
- **In `src/components/studio/blueprintStudioState.ts:741-747`**:
  ```ts
  duplicateNodes(ids: string[]): ActionSimpleResult {
    const nextGoals = duplicateStudioItems(state.draftGoals, ids);
    if (nextGoals !== state.draftGoals) { // ALWAYS TRUE!
      dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Duplicated ${ids.length} items` });
    }
    return { success: true };
  }
  ```
  Because `nextGoals !== state.draftGoals` evaluates to `true`, `APPLY_CHANGE` is dispatched, adding a frame to `undoStack` with `"Duplicated 0 items"`.

### 2.2 `patchItems` & `patchStudioItems`
- **In `src/lib/studioWorkspace.ts:10-50`**:
  ```ts
  export function patchStudioItems(goals: GoalNode[], patches: Record<string, StudioPatch>): GoalNode[] {
    const visit = (node: GoalNode): GoalNode => { ... };
    return goals.map(visit);
  }
  ```
  Even when `patches = {}`, `goals.map(visit)` allocates and returns a new top-level array `[...]`.
- **In `src/components/studio/blueprintStudioState.ts:757-763`**:
  `nextGoals !== state.draftGoals` is always `true`, dispatching `APPLY_CHANGE` and polluting `undoStack`.

### 2.3 `removeNodes` & `removeBlueprintNodes`
- **In `src/lib/blueprintStudio.ts:821-825`**:
  ```ts
  export function removeBlueprintNodes(goals: GoalNode[], nodeIds: string[]): GoalNode[] {
    const targets = new Set(nodeIds);
    if (targets.size === 0) return goals;
    return goals.map((root) => removeNodes(root, targets)).filter((root) => !targets.has(root.id));
  }
  ```
  When `nodeIds = ['ghost-id']`, `targets.size === 1`. `removeNodes(root, targets)` returns `root` unchanged, but `goals.map(...)` returns a newly allocated array instance.
- **In `src/components/studio/blueprintStudioState.ts:718-739`**:
  1. `nextGoals !== state.draftGoals` evaluates to `true`, dispatching `APPLY_CHANGE` with `description: "Removed 1 nodes"` and returning `{ success: true, count: 1 }` even though 0 nodes were removed!
  2. If `ids` contains an ancestor (parent branch or root goal) of `activeGoalNodeId`, `ids.includes(state.activeGoalNodeId)` returns `false`, bypassing the active session task guard and deleting the active session task.

### 2.4 `applyChange` & `APPLY_CHANGE` Reducer Case
- In `blueprintStudioState.ts:550`:
  `applyChange(nextGoals, description)` blindly dispatches `APPLY_CHANGE`.
- In `blueprintStudioReducer` line 199:
  `case 'APPLY_CHANGE':` unconditionally pushes `state.draftGoals` onto `undoStack`. If `nextGoals === state.draftGoals` or `sameTree(nextGoals, state.draftGoals)`, an unnecessary undo frame is created and `redoStack` is cleared.

---

## 3. Concrete Code Remediation

### 3.1 Domain Helper 1: `src/lib/blueprintStudio.ts`

#### Change 1: Re-export `sameTree`
Add re-export so consumers of `blueprintStudio` can access `sameTree` directly:
```ts
// Export sameTree from goalTree for referential and content comparison
export { sameTree } from './goalTree';
```

#### Change 2: Referentially Stable `removeBlueprintNodes` (lines 821-825)
**Before**:
```ts
export function removeBlueprintNodes(goals: GoalNode[], nodeIds: string[]): GoalNode[] {
  const targets = new Set(nodeIds);
  if (targets.size === 0) return goals;
  return goals.map((root) => removeNodes(root, targets)).filter((root) => !targets.has(root.id));
}
```
**After**:
```ts
export function removeBlueprintNodes(goals: GoalNode[], nodeIds: string[]): GoalNode[] {
  const targets = new Set(nodeIds);
  if (targets.size === 0) return goals;
  let changed = false;
  const mapped = goals.map((root) => {
    const next = removeNodes(root, targets);
    if (next !== root) changed = true;
    return next;
  });
  const filtered = mapped.filter((root) => {
    if (targets.has(root.id)) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? filtered : goals;
}
```

---

### 3.2 Domain Helper 2: `src/lib/studioWorkspace.ts`

#### Change 1: Referentially Stable `patchStudioItems` (lines 10-50)
**Before**:
```ts
export function patchStudioItems(goals: GoalNode[], patches: Record<string, StudioPatch>): GoalNode[] {
  const visit = (node: GoalNode): GoalNode => {
    ...
    return next;
  };
  return goals.map(visit);
}
```
**After**:
```ts
export function patchStudioItems(goals: GoalNode[], patches: Record<string, StudioPatch>): GoalNode[] {
  if (!patches || Object.keys(patches).length === 0) return goals;
  const visit = (node: GoalNode): GoalNode => {
    ...
    return next;
  };
  let changed = false;
  const nextGoals = goals.map((node) => {
    const next = visit(node);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? nextGoals : goals;
}
```

#### Change 2: Referentially Stable `duplicateStudioItems` (lines 93-112)
**Before**:
```ts
export function duplicateStudioItems(goals: GoalNode[], ids: string[]): GoalNode[] {
  const selected = new Set(topStudioSelection(goals, ids));
  const clone = (node: GoalNode): GoalNode => ({ ... });
  const visit = (nodes: GoalNode[]): GoalNode[] => { ... };
  return visit(goals);
}
```
**After**:
```ts
export function duplicateStudioItems(goals: GoalNode[], ids: string[]): GoalNode[] {
  if (!ids || ids.length === 0) return goals;
  const roots = topStudioSelection(goals, ids);
  if (roots.length === 0) return goals;
  const selected = new Set(roots);
  const clone = (node: GoalNode): GoalNode => ({ ... });
  const visit = (nodes: GoalNode[]): GoalNode[] => { ... };
  return visit(goals);
}
```

---

### 3.3 State Controller Layer: `src/components/studio/blueprintStudioState.ts`

#### Change 1: Imports (lines 3-17)
Add `findBlueprintPath` and `sameTree` to imports from `../../lib/blueprintStudio`:
```ts
import {
  addBlueprintChildrenBulk,
  type AddBlueprintChildrenBulkOptions,
  convertNodeToBranch,
  type ConvertToBranchOptions,
  convertNodeToTask,
  diffBlueprintSteps,
  type DiffBlueprintStepsOptions,
  findBlueprintPath,
  flattenBlueprint,
  type GoalDateInput,
  removeBlueprintNodes,
  sameTree,
  setGoalDatesBulk,
  type SetGoalDatesOptions,
  validateGoalDates,
} from '../../lib/blueprintStudio';
```

#### Change 2: Reducer `APPLY_CHANGE` Case (lines 199-208)
Guard against identical tree references or tree content:
**Before**:
```ts
    case 'APPLY_CHANGE': {
      return {
        ...state,
        undoStack: [...state.undoStack, state.draftGoals],
        redoStack: [],
        draftGoals: action.nextGoals,
        lastActionDescription: action.description,
        errorMessage: null,
      };
    }
```
**After**:
```ts
    case 'APPLY_CHANGE': {
      if (action.nextGoals === state.draftGoals || sameTree(action.nextGoals, state.draftGoals)) {
        return state;
      }
      return {
        ...state,
        undoStack: [...state.undoStack, state.draftGoals],
        redoStack: [],
        draftGoals: action.nextGoals,
        lastActionDescription: action.description,
        errorMessage: null,
      };
    }
```

#### Change 3: Controller `applyChange` (lines 550-552)
**Before**:
```ts
    applyChange(nextGoals: GoalNode[], description: string) {
      dispatch({ type: 'APPLY_CHANGE', nextGoals, description });
    },
```
**After**:
```ts
    applyChange(nextGoals: GoalNode[], description: string) {
      if (nextGoals === state.draftGoals || sameTree(nextGoals, state.draftGoals)) {
        return;
      }
      dispatch({ type: 'APPLY_CHANGE', nextGoals, description });
    },
```

#### Change 4: Controller `removeNodes` (lines 718-739)
**Before**:
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
    },
```
**After**:
```ts
    removeNodes(ids: string[]): { success: boolean; count: number; error?: string } {
      if (!ids || ids.length === 0) {
        return { success: true, count: 0 };
      }

      if (state.activeGoalNodeId) {
        const activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId).map((n) => n.id);
        if (ids.some((id) => activePath.includes(id))) {
          const errMsg = 'Cannot delete active session task.';
          dispatch({ type: 'SET_ERROR', error: errMsg });
          return { success: false, count: 0, error: errMsg };
        }
      }

      const validRoots = topStudioSelection(state.draftGoals, ids);
      if (validRoots.length === 0) {
        return { success: true, count: 0 };
      }

      const nextGoals = removeBlueprintNodes(state.draftGoals, ids);
      if (nextGoals === state.draftGoals || sameTree(nextGoals, state.draftGoals)) {
        return { success: true, count: 0 };
      }

      const nextSelected = new Set(state.selectedIds);
      const nextExpanded = new Set(state.expandedIds);
      ids.forEach((id) => {
        nextSelected.delete(id);
        nextExpanded.delete(id);
      });
      dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Removed ${validRoots.length} nodes` });
      dispatch({ type: 'SET_SELECTED_IDS', selectedIds: nextSelected });
      dispatch({ type: 'SET_EXPANDED_IDS', expandedIds: nextExpanded });

      return { success: true, count: validRoots.length };
    },
```

#### Change 5: Controller `duplicateNodes` (lines 741-747)
**Before**:
```ts
    duplicateNodes(ids: string[]): ActionSimpleResult {
      const nextGoals = duplicateStudioItems(state.draftGoals, ids);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Duplicated ${ids.length} items` });
      }
      return { success: true };
    },
```
**After**:
```ts
    duplicateNodes(ids: string[]): ActionSimpleResult {
      if (!ids || ids.length === 0) {
        return { success: true };
      }
      const roots = topStudioSelection(state.draftGoals, ids);
      if (roots.length === 0) {
        return { success: true };
      }
      const nextGoals = duplicateStudioItems(state.draftGoals, ids);
      if (nextGoals !== state.draftGoals && !sameTree(nextGoals, state.draftGoals)) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Duplicated ${roots.length} items` });
      }
      return { success: true };
    },
```

#### Change 6: Controller `patchItems` (lines 757-763)
**Before**:
```ts
    patchItems(patches: Record<string, StudioPatch>): ActionSimpleResult {
      const nextGoals = patchStudioItems(state.draftGoals, patches);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Patched items' });
      }
      return { success: true };
    },
```
**After**:
```ts
    patchItems(patches: Record<string, StudioPatch>): ActionSimpleResult {
      if (!patches || Object.keys(patches).length === 0) {
        return { success: true };
      }
      const nextGoals = patchStudioItems(state.draftGoals, patches);
      if (nextGoals !== state.draftGoals && !sameTree(nextGoals, state.draftGoals)) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Patched items' });
      }
      return { success: true };
    },
```

---

## 4. Test Harness Updates

When these fixes are implemented by the Worker, two test files that previously asserted the presence of anomalies / bug reproduction must be updated to verify the **remediation**:

### 4.1 `src/components/studio/blueprintStudioState.adversarial.test.ts` (Probe 3.3)
Lines 666-697 currently assert:
`expect(duplicateNodesPollutes).toBe(true);`
`expect(patchItemsPollutes).toBe(true);`
`expect(removeNodesPollutes).toBe(true);`

**Updated Test Assertion**:
```ts
    it('Probe 3.3: REMEDIATION VERIFIED: duplicateNodes([]), patchItems({}), removeNodes([nonExistent]) DO NOT pollute undoStack', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      // 1. duplicateNodes([]) with empty array
      expect(studio.undoStack).toHaveLength(0);
      studio.duplicateNodes([]);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Reset
      studio.reset();
      expect(studio.undoStack).toHaveLength(0);

      // 2. patchItems({}) with empty patches
      studio.patchItems({});
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Reset
      studio.reset();
      expect(studio.undoStack).toHaveLength(0);

      // 3. removeNodes(['ghost-id']) with non-existent id
      const remRes = studio.removeNodes(['ghost-id']);
      expect(remRes.success).toBe(true);
      expect(remRes.count).toBe(0);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);
    });
```

### 4.2 `src/components/studio/blueprintStudioStressProbes.test.ts` (P2.2b)
Lines 417-431 currently assert:
`expect(dupResult).not.toBe(goals);`
`expect(patchResult).not.toBe(goals);`

**Updated Test Assertion**:
```ts
    it('P2.2b verifies referential integrity: duplicateStudioItems and patchStudioItems preserve references on empty inputs', () => {
      const goals = createForestTree();

      const dupResult = duplicateStudioItems(goals, []);
      expect(dupResult).toBe(goals);
      expect(dupResult).toEqual(goals);

      const patchResult = patchStudioItems(goals, {});
      expect(patchResult).toBe(goals);
      expect(patchResult).toEqual(goals);
    });
```

---

## 5. Verification Commands

After applying changes:
1. `npx vitest run src/components/studio/blueprintStudioState.adversarial.test.ts`
2. `npx vitest run src/components/studio/blueprintStudioStressProbes.test.ts`
3. `npx vitest run src/components/studio/blueprintStudioState.test.ts`
4. `npx vitest run src/lib/studioWorkspace.test.ts`
5. `npx vitest run` (Full 50 test files suite)
6. `npx tsc --noEmit`
