# Handoff Report: Milestone 3 Remediation (Iteration 4) - Explorer 2

**Agent ID / Role**: M3 It4 Explorer 2 (Undo Stack & Referential Integrity Specialist)  
**Parent Conversation ID**: `b50e5d61-aab8-4da0-9abc-a466bca2446b`  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\m3_it4_explorer_2`  
**Milestone**: Milestone 3 Remediation (Iteration 4)  
**Status**: Ready for Worker Implementation  

---

## 1. Observation

1. **`duplicateStudioItems` in `src/lib/studioWorkspace.ts:93-112`**:
   - `duplicateStudioItems(goals, [])` invokes `visit(goals)` which returns new shallow object copies `{ ...node, children: visit(node.children) }` for every node in the tree.
   - Result: Returned array reference `nextGoals` never equals `goals` (`nextGoals !== goals` is always `true`).
   - Line 743 in `blueprintStudioState.ts` evaluates `nextGoals !== state.draftGoals` as `true` and dispatches `APPLY_CHANGE`, pushing `"Duplicated 0 items"` onto `undoStack`.

2. **`patchStudioItems` in `src/lib/studioWorkspace.ts:10-50`**:
   - `patchStudioItems(goals, {})` executes `goals.map(visit)`. Even though no properties are mutated, `goals.map` unconditionally allocates a new array.
   - Result: `nextGoals !== state.draftGoals` in `blueprintStudioState.ts:759` evaluates to `true`, dispatching `APPLY_CHANGE` and polluting `undoStack`.

3. **`removeBlueprintNodes` in `src/lib/blueprintStudio.ts:821-825`**:
   - `removeBlueprintNodes(goals, ['ghost-id'])` calls `goals.map(...)`.
   - Result: A newly allocated array is returned. `nextGoals !== state.draftGoals` evaluates to `true` in `blueprintStudioState.ts:726`.
   - Dispatches `APPLY_CHANGE` with `description: "Removed 1 nodes"` and returns `{ success: true, count: 1 }` when 0 nodes were deleted.

4. **`removeNodes` Ancestor Guard Bypass in `src/components/studio/blueprintStudioState.ts:719-723`**:
   - Only checks `state.activeGoalNodeId && ids.includes(state.activeGoalNodeId)`.
   - When `ids` contains the parent or grandparent container of `activeGoalNodeId` (e.g. `'branch-math'`), the check returns `false`, deleting `activeGoalNodeId` from the tree.

5. **`APPLY_CHANGE` in `src/components/studio/blueprintStudioState.ts:199-208` & `applyChange:550-552`**:
   - Reducer does not check if `action.nextGoals === state.draftGoals` or `sameTree(action.nextGoals, state.draftGoals)`.
   - Unconditionally pushes `state.draftGoals` onto `undoStack` and wipes `redoStack`.

6. **Current Test Baseline**:
   - All 50 test files in the project pass (`729 / 729 passed`).
   - `Probe 3.3` in `src/components/studio/blueprintStudioState.adversarial.test.ts` and `P2.2b` in `src/components/studio/blueprintStudioStressProbes.test.ts` currently pass by asserting the existence of these empirical anomalies.

---

## 2. Logic Chain

1. **Step 1 (Root Cause at Domain Layer)**: `duplicateStudioItems`, `patchStudioItems`, and `removeBlueprintNodes` violate referential stability by allocating fresh arrays/objects on empty inputs or unmatching IDs.
2. **Step 2 (Root Cause at Controller Layer)**: The controller methods rely solely on reference inequality (`nextGoals !== state.draftGoals`). Because the domain functions break referential stability, no-ops are mistaken for real state mutations, creating phantom undo history.
3. **Step 3 (Dual-Layer Solution)**:
   - Fixing only the domain layer or only the controller layer leaves a gap.
   - By making domain helpers referentially stable (`return goals` when unchanged) **AND** adding input checks (`!ids || ids.length === 0`, `topStudioSelection.length === 0`, `!sameTree(...)`) in the controller and reducer, we guarantee zero undo stack pollution across all call sites (UI components, direct controller API calls, and domain helper consumers).
4. **Step 4 (Test Invariant Realignment)**:
   - Tests asserting the presence of the bug (`Probe 3.3` expecting `pollutes === true`, `P2.2b` expecting `dupResult !== goals`) must be converted to assert remediation (`undoStack.length === 0`, `dupResult === goals`).

---

## 3. Caveats

- **Test Assertion Updates Required**: Because previous challengers committed probes that specifically asserted the presence of the bugs (e.g. `expect(duplicateNodesPollutes).toBe(true)`), fixing the bugs will cause those specific test assertions to fail unless Worker updates them to test the fix (detailed in Section 4 of `analysis.md`).
- **`sameTree` Performance**: `sameTree` uses `JSON.stringify`. It is only evaluated when pointer equality (`nextGoals !== state.draftGoals`) fails, so the fast path remains O(1) pointer comparison.
- **Selection Cleanup**: In `removeNodes`, selection and expansion IDs are pruned only if actual nodes were deleted, preventing unnecessary set mutations on no-ops.

---

## 4. Conclusion

The undo stack pollution and ancestor deletion bugs are fully diagnosed with complete drop-in code recommendations ready for Worker implementation.

### Exact Actions for Worker:
1. In `src/lib/blueprintStudio.ts`:
   - Re-export `sameTree`: `export { sameTree } from './goalTree';`.
   - Update `removeBlueprintNodes` to return `goals` if no nodes are removed.
2. In `src/lib/studioWorkspace.ts`:
   - In `patchStudioItems`: return `goals` if `!patches || Object.keys(patches).length === 0` or if no nodes were modified.
   - In `duplicateStudioItems`: return `goals` if `!ids || ids.length === 0` or `topStudioSelection(goals, ids).length === 0`.
3. In `src/components/studio/blueprintStudioState.ts`:
   - Import `findBlueprintPath` and `sameTree` from `../../lib/blueprintStudio`.
   - In `APPLY_CHANGE` reducer case: return `state` if `action.nextGoals === state.draftGoals || sameTree(action.nextGoals, state.draftGoals)`.
   - In `applyChange`: return early if `nextGoals === state.draftGoals || sameTree(nextGoals, state.draftGoals)`.
   - In `removeNodes`:
     - Early return `{ success: true, count: 0 }` if `!ids || ids.length === 0`.
     - Block removal if `ids.some((id) => activePath.includes(id))` where `activePath` is `findBlueprintPath(state.draftGoals, state.activeGoalNodeId)`.
     - Check `validRoots = topStudioSelection(state.draftGoals, ids)`. If `validRoots.length === 0`, return `{ success: true, count: 0 }`.
     - Check `sameTree(nextGoals, state.draftGoals)`. If unchanged, return `{ success: true, count: 0 }`.
     - Return `{ success: true, count: validRoots.length }`.
   - In `duplicateNodes`:
     - Early return `{ success: true }` if `!ids || ids.length === 0` or `topStudioSelection(state.draftGoals, ids).length === 0`.
     - Only dispatch `APPLY_CHANGE` if `!sameTree(nextGoals, state.draftGoals)`.
   - In `patchItems`:
     - Early return `{ success: true }` if `!patches || Object.keys(patches).length === 0`.
     - Only dispatch `APPLY_CHANGE` if `!sameTree(nextGoals, state.draftGoals)`.
4. In Test Probes:
   - Update `Probe 3.3` in `src/components/studio/blueprintStudioState.adversarial.test.ts` to assert `undoStack` remains empty.
   - Update `P2.2b` in `src/components/studio/blueprintStudioStressProbes.test.ts` to assert referential identity.

---

## 5. Verification Method

To independently verify the implementation:
1. **Adversarial and Stress Test Suites**:
   ```bash
   npx vitest run src/components/studio/blueprintStudioState.adversarial.test.ts
   npx vitest run src/components/studio/blueprintStudioStressProbes.test.ts
   npx vitest run src/components/studio/blueprintStudioState.test.ts
   npx vitest run src/lib/studioWorkspace.test.ts
   ```
2. **Full Workspace Vitest Suite**:
   ```bash
   npx vitest run
   ```
3. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
4. **Invalidation Condition**:
   If executing:
   - `studio.duplicateNodes([])`
   - `studio.patchItems({})`
   - `studio.removeNodes(['ghost-id'])`
   results in `studio.undoStack.length > 0`, the fix is invalid.
   If executing `studio.removeNodes(['parent-branch'])` where `parent-branch` contains `activeGoalNodeId` deletes the active task or returns `success: true`, the fix is invalid.
