# Milestone 1 Iteration 2 Remediation Changes Documentation

**Agent**: M1 Remediation Worker (Replacement) (`m1_worker_2_rep`)  
**Milestone**: Milestone 1 Iteration 2  
**Date**: 2026-10-08  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\m1_worker_2_rep`

---

## 1. Summary of Changes

This remediation addresses the gate review defect and hardening recommendations identified by the Iteration 2 Explorers (`m1_it2_explorer_1`, `m1_it2_explorer_2`, `m1_it2_explorer_3`):

1. **Date Clearing Fix in `src/lib/blueprintStudio.ts` (`setGoalDatesBulk`)**:
   - Resolved the defect where whitespace-only date strings (`'   '`) bypassed `clearStart` / `clearEnd` and resulted in `startDate: ""` rather than deleting the property.
   - Updated `clearStart` and `clearEnd` to check for trimmed empty string `(typeof dates.startDate === 'string' && dates.startDate.trim() === '')`.
   - Updated `newStart` and `newEnd` to ensure non-empty strings are trimmed and empty strings yield `undefined`.

2. **Defensive Fallback for Legacy Steps in `src/lib/blueprintStudio.ts`**:
   - In `convertNodeToBranch` and `addBlueprintChildrenBulk`, added `cleanTitle || 'Step ${idx + 1}'` fallback when converting existing checklist steps into child nodes. If legacy steps contain empty or whitespace strings, child nodes will never receive an empty title `""`.

3. **Date Sanitization Hardening in `src/lib/studioWorkspace.ts` (`patchStudioItems`)**:
   - Replaced brittle date patching logic.
   - When `patch.startDate` or `patch.endDate` is `null`, `undefined`, or whitespace/empty string, the property is cleanly deleted (`delete next.startDate`) without assigning `""` or `null`.
   - When a valid ISO string is passed, it is trimmed.
   - When an invalid non-empty string is passed, it reverts to the original node date (or is deleted if originally undefined).
   - Conflicting date ranges (`startDate > endDate`) revert to original node dates (or deleted).

4. **Unit Test Enhancements in `src/lib/blueprintStudio.test.ts`**:
   - Imported `patchStudioItems` from `./studioWorkspace`.
   - Added `R1-17`: Verifies fallback to `Step 1`, `Step 2`, `Step 3` when converting legacy empty/whitespace steps to branch child nodes.
   - Added `R4-15`: Verifies that whitespace-only strings `{ startDate: '   ', endDate: '   ' }` cleanly delete both date properties in `setGoalDatesBulk` and `setGoalDates`, and that clearing a single date via whitespace preserves the opposite date.
   - Added `R4-16`: Verifies setting `startDate` while clearing `endDate` via whitespace.
   - Added `R4-17`: Verifies clearing `startDate` via whitespace while setting `endDate`.
   - Added `R4-18`: Verifies downstream consumers (`isValidISODate` rejecting whitespace, `patchStudioItems` preserving undefined dates on cleared trees, `patchStudioItems` cleanly deleting dates when patched with whitespace, and reverting on invalid date formats).

5. **Adversarial Probe Resolution in `src/lib/blueprintStudio.adversarial.test.ts`**:
   - Updated test probe at line 215 from empirical bug reproduction asserting `.toBe('')` to asserting that whitespace cleanly clears the dates: `expect(...startDate).toBeUndefined()`, `expect(...endDate).toBeUndefined()`, and `expect('startDate' in ...).toBe(false)`.
   - Cleaned up unused import of `setGoalDates`.

---

## 2. File-by-File Detailed Edits

### File 1: `src/lib/blueprintStudio.ts`

#### Edit 1.1: `convertNodeToBranch` (Lines 85–94)
- **Before**:
  ```ts
  convertedStepNodes = parentSteps.map((step, idx) => ({
    id: uid('goal'),
    kind: 'node' as const,
    title: step.trim(),
    children: [],
    steps: [],
    stepDone: [],
    completed: Boolean(parentStepDone[idx]),
    createdAt: Date.now(),
  }));
  ```
- **After**:
  ```ts
  convertedStepNodes = parentSteps.map((step, idx) => {
    const cleanTitle = step.trim();
    return {
      id: uid('goal'),
      kind: 'node' as const,
      title: cleanTitle || `Step ${idx + 1}`,
      children: [],
      steps: [],
      stepDone: [],
      completed: Boolean(parentStepDone[idx]),
      createdAt: Date.now(),
    };
  });
  ```

#### Edit 1.2: `addBlueprintChildrenBulk` (Lines 210–222)
- **Before**:
  ```ts
  convertedStepNodes = parentSteps.map((stepTitle, idx) => ({
    id: uid('goal'),
    kind: 'node' as const,
    title: stepTitle.trim(),
    children: [],
    steps: [],
    stepDone: [],
    completed: Boolean(parentStepDone[idx]),
    createdAt: Date.now(),
  }));
  ```
- **After**:
  ```ts
  convertedStepNodes = parentSteps.map((stepTitle, idx) => {
    const cleanTitle = stepTitle.trim();
    return {
      id: uid('goal'),
      kind: 'node' as const,
      title: cleanTitle || `Step ${idx + 1}`,
      children: [],
      steps: [],
      stepDone: [],
      completed: Boolean(parentStepDone[idx]),
      createdAt: Date.now(),
    };
  });
  ```

#### Edit 1.3: `setGoalDatesBulk` (Lines 671–674)
- **Before**:
  ```ts
  const isClearAll = Boolean(dates.clearAll);
  const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
  const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
  const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
  const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
  ```
- **After**:
  ```ts
  const isClearAll = Boolean(dates.clearAll);
  const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
  const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
  const newStart = !clearStart && typeof dates.startDate === 'string' && dates.startDate.trim() !== '' ? dates.startDate.trim() : undefined;
  const newEnd = !clearEnd && typeof dates.endDate === 'string' && dates.endDate.trim() !== '' ? dates.endDate.trim() : undefined;
  ```

---

### File 2: `src/lib/studioWorkspace.ts`

#### Edit 2.1: `patchStudioItems` Date Sanitization Hardening (Lines 19–30)
- **Before**:
  ```ts
  // Sanitize dates if patched
  if (patch?.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
    if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
  }
  if (patch?.endDate !== undefined && patch.endDate !== null && patch.endDate !== '') {
    if (!isValidISODate(patch.endDate)) next.endDate = node.endDate;
  }
  if (next.startDate && next.endDate && next.startDate > next.endDate) {
    next.startDate = node.startDate;
    next.endDate = node.endDate;
  }
  ```
- **After**:
  ```ts
  // Sanitize dates if patched
  if (patch && 'startDate' in patch) {
    if (patch.startDate === null || patch.startDate === undefined || (typeof patch.startDate === 'string' && patch.startDate.trim() === '')) {
      delete next.startDate;
    } else if (typeof patch.startDate === 'string' && isValidISODate(patch.startDate)) {
      next.startDate = patch.startDate.trim();
    } else {
      if (node.startDate !== undefined) next.startDate = node.startDate;
      else delete next.startDate;
    }
  }
  if (patch && 'endDate' in patch) {
    if (patch.endDate === null || patch.endDate === undefined || (typeof patch.endDate === 'string' && patch.endDate.trim() === '')) {
      delete next.endDate;
    } else if (typeof patch.endDate === 'string' && isValidISODate(patch.endDate)) {
      next.endDate = patch.endDate.trim();
    } else {
      if (node.endDate !== undefined) next.endDate = node.endDate;
      else delete next.endDate;
    }
  }
  if (next.startDate && next.endDate && next.startDate > next.endDate) {
    if (node.startDate !== undefined) next.startDate = node.startDate;
    else delete next.startDate;
    if (node.endDate !== undefined) next.endDate = node.endDate;
    else delete next.endDate;
  }
  ```

---

### File 3: `src/lib/blueprintStudio.adversarial.test.ts`

#### Edit 3.1: Remove Unused Import & Update Resolved Bug Assertion (Lines 7 and 215)
- **Before**:
  ```ts
  import {
    convertNodeToBranch,
    convertNodeToTask,
    isValidISODate,
    setGoalDates,
    setGoalDatesBulk,
    validateGoalDates,
  } from './blueprintStudio';
  ...
  it('EMPIRICAL BUG REPRODUCTION: whitespace string "   " sets property to "" instead of clearing', () => {
    const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
    const goals = [makeNode('g', 'goal', 'Goal', [dated])];

    const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
    // While '' clears the date property, '   ' sets the date property to an empty string ''!
    expect(resWhitespace.goals[0].children[0].startDate).toBe('');
    expect(resWhitespace.goals[0].children[0].endDate).toBe('');
    expect(isValidISODate(resWhitespace.goals[0].children[0].startDate)).toBe(false);
  });
  ```
- **After**:
  ```ts
  import {
    convertNodeToBranch,
    convertNodeToTask,
    isValidISODate,
    setGoalDatesBulk,
    validateGoalDates,
  } from './blueprintStudio';
  ...
  it('EMPIRICAL BUG RESOLVED: whitespace string "   " clears date properties instead of setting ""', () => {
    const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
    const goals = [makeNode('g', 'goal', 'Goal', [dated])];

    const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
    expect(resWhitespace.goals[0].children[0].startDate).toBeUndefined();
    expect(resWhitespace.goals[0].children[0].endDate).toBeUndefined();
    expect('startDate' in resWhitespace.goals[0].children[0]).toBe(false);
    expect('endDate' in resWhitespace.goals[0].children[0]).toBe(false);
  });
  ```

---

### File 4: `src/lib/blueprintStudio.test.ts`

#### Edit 4.1: Import `patchStudioItems` (Line 28)
```ts
import { patchStudioItems } from './studioWorkspace';
```

#### Edit 4.2: Add Test `R1-17`
```ts
  it('R1-17: falls back to Step N when converting blank or whitespace legacy steps', () => {
    const nodeWithBlankSteps: GoalNode = {
      ...node('item-blank', 'node', 'Task with blank steps'),
      steps: ['   ', '', '\t\n '],
      stepDone: [false, true, false],
    };
    const goals = [node('g', 'goal', 'Goal', [nodeWithBlankSteps])];
    const updated = convertNodeToBranch(goals, 'item-blank', [], { convertExistingSteps: true });
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(3);
    expect(target.children[0].title).toBe('Step 1');
    expect(target.children[1].title).toBe('Step 2');
    expect(target.children[2].title).toBe('Step 3');
  });
```

#### Edit 4.3: Add Tests `R4-15` through `R4-18`
- `R4-15`: Verifies whitespace strings delete both date properties in `setGoalDatesBulk` and `setGoalDates`, and that clearing one date preserves the other.
- `R4-16`: Verifies setting `startDate` while clearing `endDate` with whitespace.
- `R4-17`: Verifies clearing `startDate` with whitespace while setting `endDate`.
- `R4-18`: Verifies downstream consumers (`isValidISODate`, `patchStudioItems` date retention/deletion/sanitization).

---

## 3. Verification Commands & Results

1. **Target Test Files**:
   ```bash
   npx vitest run src/lib/blueprintStudio.test.ts src/lib/blueprintStudio.adversarial.test.ts src/lib/studioWorkspace.test.ts
   ```
   **Result**: 3 test files passed, 123 tests passed (0 failures).

2. **Full Repository Test Suite**:
   ```bash
   npm test
   ```
   **Result**: 46 test files passed, 573 tests passed (0 failures).

3. **Typecheck on Owned Files**:
   ```bash
   npm run typecheck
   ```
   **Result**: Zero errors in any of the 4 owned files.
