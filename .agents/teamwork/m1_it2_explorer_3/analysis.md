# Analysis: Unit Test Design for Whitespace Date Inputs & Downstream Consumers

**Agent**: M1 It2 Explorer 3 (`m1_it2_explorer_3`)  
**Role**: Test Design Specialist / Teamwork Explorer  
**Milestone**: Milestone 1 Iteration 2  
**Date**: 2026-10-08  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\m1_it2_explorer_3`  

---

## 1. Executive Summary

In Milestone 1 Iteration 1 Gate, Challenger 2 identified an empirical domain defect in `src/lib/blueprintStudio.ts`: passing whitespace-only date inputs (e.g., `{ startDate: '   ', endDate: '   ' }`) assigned `node.startDate = ""` and `node.endDate = ""` instead of deleting the date properties (`undefined`).

This analysis delivers:
1. Complete architectural analysis of whitespace date input handling in `setGoalDatesBulk`, `validateGoalDates`, `isValidISODate`, and `patchStudioItems`.
2. Explicit unit test suite additions for `src/lib/blueprintStudio.test.ts` (Tests `R4-15`, `R4-16`, `R4-17`, `R4-18`).
3. Concrete drop-in code snippets for the implementing worker, covering `src/lib/blueprintStudio.test.ts`, `src/lib/blueprintStudio.ts`, and `src/lib/blueprintStudio.adversarial.test.ts`.

---

## 2. Root Cause Analysis & Downstream Invariant Breakage

### 2.1 The Root Cause in `src/lib/blueprintStudio.ts`
In `src/lib/blueprintStudio.ts` (lines 671–674 and lines 744–749):

```ts
// Existing lines 671–674:
const isClearAll = Boolean(dates.clearAll);
const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
```

When a user or UI submits whitespace (e.g., `{ startDate: '   ', endDate: '   ' }`):
1. `validateGoalDates` trims the input (`dates.startDate?.trim() === ''`) and considers it empty/cleared, returning `{ valid: true }`.
2. In `setGoalDatesBulk`, `dates.startDate === ''` evaluates to `false` because `'   ' !== ''`.
3. Consequently, `clearStart` evaluates to `false`.
4. `newStart` evaluates to `dates.startDate.trim()`, which is `""` (truthy in `newStart !== undefined`).
5. At lines 744–749:
   ```ts
   if (finalStart !== undefined) updated.startDate = finalStart;
   else delete updated.startDate;
   ```
   Because `finalStart === ""` is NOT `undefined`, the code executes `updated.startDate = ""` rather than `delete updated.startDate`.
6. As a result, the node is contaminated with `startDate: ""` and `endDate: ""` instead of having the properties deleted / set to `undefined`.

### 2.2 Impact on Downstream Consumers

1. **`GoalNode` Contract Invariant**:
   In `src/types.ts` lines 46–47, `GoalNode` defines:
   ```ts
   startDate?: string; // ISO date
   endDate?: string;   // ISO date
   ```
   An empty string `""` is NOT a valid ISO date. When present, `isValidISODate("")` returns `false`.

2. **`GoalView.tsx` (Date Range Formatting)**:
   In `src/components/GoalView.tsx` lines 55–65:
   ```ts
   function formatGoalDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
     const start = startDate ?? endDate;
     const end = endDate ?? startDate;
     ...
     const startParts = new Date(`${start}T00:00:00`);
   }
   ```
   If `startDate` is `""` and `endDate` is `'2026-10-15'`, the nullish coalescing operator `"" ?? '2026-10-15'` evaluates to `""` (because `""` is not nullish).
   `new Date("T00:00:00")` results in `Invalid Date` rendering in the user interface.

3. **`patchStudioItems` (`src/lib/studioWorkspace.ts`)**:
   In `src/lib/studioWorkspace.ts` lines 20–25:
   ```ts
   if (patch?.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
     if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
   }
   ```
   `patchStudioItems` expects nodes to carry either a valid ISO date string or `undefined`. Feeding `""` into downstream systems causes unexpected fallbacks or validation failures.

---

## 3. Unit Test Design for `src/lib/blueprintStudio.test.ts`

The current test suite in `src/lib/blueprintStudio.test.ts` numbers tests from `R4-01` to `R4-14` under the suite:
`describe('R4: Bulk & Individual Date Changing (setGoalDatesBulk & setGoalDates)', () => { ... })`.

To provide 100% comprehensive coverage of all whitespace and clearing permutations, 4 new tests (`R4-15` through `R4-18`) must be added:

### Test Case R4-15: Clearing Both Dates via Whitespace
- **Condition**: Target node has existing valid dates (`startDate: '2026-01-01', endDate: '2026-01-31'`).
- **Input**: `{ startDate: '   ', endDate: '   ' }`
- **Assertions**:
  - `result.count === 1`
  - `result.goals[0].children[0].startDate === undefined`
  - `result.goals[0].children[0].endDate === undefined`
  - `'startDate' in result.goals[0].children[0] === false` (property deleted)
  - `'endDate' in result.goals[0].children[0] === false` (property deleted)
  - Verify identical deletion behavior via convenience wrapper `setGoalDates(goals, 'n1', { startDate: '   ', endDate: '   ' })`.
  - Verify single-property whitespace deletion:
    - `{ startDate: '   ' }` deletes `startDate` and preserves existing `endDate`.
    - `{ endDate: '   ' }` deletes `endDate` and preserves existing `startDate`.

### Test Case R4-16: Setting `startDate` and Clearing `endDate` via Whitespace
- **Condition**: Target node has existing dates (`startDate: '2026-01-01', endDate: '2026-01-31'`).
- **Input**: `{ startDate: '2026-10-15', endDate: '   ' }`
- **Assertions**:
  - `result.count === 1`
  - `result.goals[0].children[0].startDate === '2026-10-15'`
  - `result.goals[0].children[0].endDate === undefined`
  - `'startDate' in result.goals[0].children[0] === true`
  - `'endDate' in result.goals[0].children[0] === false`
  - `isValidISODate(result.goals[0].children[0].startDate) === true`

### Test Case R4-17: Clearing `startDate` via Whitespace and Setting `endDate`
- **Condition**: Target node has existing dates (`startDate: '2026-01-01', endDate: '2026-01-31'`).
- **Input**: `{ startDate: '   ', endDate: '2026-10-15' }`
- **Assertions**:
  - `result.count === 1`
  - `result.goals[0].children[0].startDate === undefined`
  - `result.goals[0].children[0].endDate === '2026-10-15'`
  - `'startDate' in result.goals[0].children[0] === false`
  - `'endDate' in result.goals[0].children[0] === true`
  - `isValidISODate(result.goals[0].children[0].endDate) === true`

### Test Case R4-18: Downstream Consumer Integration (`isValidISODate` & `patchStudioItems`)
- **Assertions**:
  1. `isValidISODate`:
     - `isValidISODate('') === false`
     - `isValidISODate(' ') === false`
     - `isValidISODate('   ') === false`
     - `isValidISODate(' \t\n ') === false`
     - `isValidISODate('  2026-10-15  ') === true` (padded valid date trims cleanly)
  2. `patchStudioItems` on Cleared Tree:
     - Nodes whose dates are deleted via `setGoalDatesBulk` pass through `patchStudioItems` without resurrecting dates, keeping `startDate: undefined` and `endDate: undefined`.
  3. `patchStudioItems` Whitespace Sanitization:
     - Applying `{ startDate: '   ' }` via `patchStudioItems` fails `isValidISODate`, causing `patchStudioItems` to reject the invalid string and preserve the node's existing date.

---

## 4. Exact Implementation Snippets for Worker

### 4.1 Changes in `src/lib/blueprintStudio.ts` (Lines 671–672)

```ts
<<<<
  const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
  const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
====
  const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
  const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
>>>>
```

### 4.2 Changes in `src/lib/blueprintStudio.test.ts`

#### Step A: Add Import at top of file
At line 28 of `src/lib/blueprintStudio.test.ts`:
```ts
import { patchStudioItems } from './studioWorkspace';
```

#### Step B: Append Test Cases to the `describe('R4: Bulk & Individual Date Changing...')` block (after `R4-14`)
```ts
  it('R4-15: deletes both date properties when passed whitespace-only strings', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBeUndefined();
    expect(updated.endDate).toBeUndefined();
    expect('startDate' in updated).toBe(false);
    expect('endDate' in updated).toBe(false);

    // Also verify single-node convenience wrapper setGoalDates
    const singleResult = setGoalDates(goals, 'n1', { startDate: '   ', endDate: '   ' });
    const singleUpdated = singleResult[0].children[0];
    expect(singleUpdated.startDate).toBeUndefined();
    expect(singleUpdated.endDate).toBeUndefined();
    expect('startDate' in singleUpdated).toBe(false);
    expect('endDate' in singleUpdated).toBe(false);

    // Verify clearing individual dates via whitespace preserves the opposing date
    const startOnlyCleared = setGoalDatesBulk(goals, ['n1'], { startDate: '   ' });
    expect(startOnlyCleared.goals[0].children[0].startDate).toBeUndefined();
    expect('startDate' in startOnlyCleared.goals[0].children[0]).toBe(false);
    expect(startOnlyCleared.goals[0].children[0].endDate).toBe('2026-01-31');

    const endOnlyCleared = setGoalDatesBulk(goals, ['n1'], { endDate: '   ' });
    expect(endOnlyCleared.goals[0].children[0].startDate).toBe('2026-01-01');
    expect(endOnlyCleared.goals[0].children[0].endDate).toBeUndefined();
    expect('endDate' in endOnlyCleared.goals[0].children[0]).toBe(false);
  });

  it('R4-16: sets startDate and deletes endDate when endDate is whitespace', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-15', endDate: '   ' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBe('2026-10-15');
    expect(updated.endDate).toBeUndefined();
    expect('startDate' in updated).toBe(true);
    expect('endDate' in updated).toBe(false);
    expect(isValidISODate(updated.startDate)).toBe(true);
  });

  it('R4-17: deletes startDate and sets endDate when startDate is whitespace', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '2026-10-15' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBeUndefined();
    expect(updated.endDate).toBe('2026-10-15');
    expect('startDate' in updated).toBe(false);
    expect('endDate' in updated).toBe(true);
    expect(isValidISODate(updated.endDate)).toBe(true);
  });

  it('R4-18: verifies downstream consumers (isValidISODate & patchStudioItems) handle whitespace and cleared dates cleanly', () => {
    // 1. isValidISODate rejection of whitespace
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(' ')).toBe(false);
    expect(isValidISODate('   ')).toBe(false);
    expect(isValidISODate(' \t\n ')).toBe(false);
    expect(isValidISODate('  2026-10-15  ')).toBe(true);

    // 2. Nodes with deleted dates flowing into patchStudioItems
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const clearedResult = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
    const clearedNode = clearedResult.goals[0].children[0];
    expect(clearedNode.startDate).toBeUndefined();
    expect(clearedNode.endDate).toBeUndefined();

    // patchStudioItems on the cleared tree preserves undefined dates
    const patchedTree = patchStudioItems(clearedResult.goals, { n1: { title: 'Updated Title' } });
    const patchedNode = patchedTree[0].children[0];
    expect(patchedNode.title).toBe('Updated Title');
    expect(patchedNode.startDate).toBeUndefined();
    expect(patchedNode.endDate).toBeUndefined();
    expect('startDate' in patchedNode).toBe(false);
    expect('endDate' in patchedNode).toBe(false);

    // 3. patchStudioItems directly receives whitespace date in patch - sanitizes via isValidISODate
    const nodeWithDates = [node('n2', 'node', 'Item 2')];
    nodeWithDates[0].startDate = '2026-05-01';
    const sanitizedPatch = patchStudioItems(nodeWithDates, { n2: { startDate: '   ' } });
    // Because isValidISODate('   ') is false, patchStudioItems retains the original startDate
    expect(sanitizedPatch[0].startDate).toBe('2026-05-01');
  });
```

### 4.3 Update in `src/lib/blueprintStudio.adversarial.test.ts` (Line 215)
In `src/lib/blueprintStudio.adversarial.test.ts`, Challenger 2 added a test probe asserting the empirical bug (`expect(resWhitespace.goals[0].children[0].startDate).toBe('')`).
When the Worker fixes `src/lib/blueprintStudio.ts`, this probe must be updated to reflect the resolved invariant:

```ts
<<<<
    it('EMPIRICAL BUG REPRODUCTION: whitespace string "   " sets property to "" instead of clearing', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
      // While '' clears the date property, '   ' sets the date property to an empty string ''!
      expect(resWhitespace.goals[0].children[0].startDate).toBe('');
      expect(resWhitespace.goals[0].children[0].endDate).toBe('');
      expect(isValidISODate(resWhitespace.goals[0].children[0].startDate)).toBe(false);
    });
====
    it('EMPIRICAL BUG RESOLVED: whitespace string "   " clears date properties instead of setting ""', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
      expect(resWhitespace.goals[0].children[0].startDate).toBeUndefined();
      expect(resWhitespace.goals[0].children[0].endDate).toBeUndefined();
      expect('startDate' in resWhitespace.goals[0].children[0]).toBe(false);
      expect('endDate' in resWhitespace.goals[0].children[0]).toBe(false);
    });
>>>>
```

---

## 5. Summary Matrix of Test Coverage

| Test ID | Method / Scenario | Input Dates | Pre-State | Expected Result | Property Deletion Verified |
|---------|-------------------|-------------|-----------|-----------------|----------------------------|
| `R4-15` | `setGoalDatesBulk` & `setGoalDates` | `{ startDate: '   ', endDate: '   ' }` | Both dates present | Both `undefined` | `'startDate' in node === false`, `'endDate' in node === false` |
| `R4-15` | `setGoalDatesBulk` | `{ startDate: '   ' }` | Both dates present | `startDate: undefined`, `endDate: preserved` | `'startDate' in node === false` |
| `R4-15` | `setGoalDatesBulk` | `{ endDate: '   ' }` | Both dates present | `startDate: preserved`, `endDate: undefined` | `'endDate' in node === false` |
| `R4-16` | `setGoalDatesBulk` | `{ startDate: '2026-10-15', endDate: '   ' }` | Both dates present | `startDate: '2026-10-15'`, `endDate: undefined` | `'startDate' in node === true`, `'endDate' in node === false` |
| `R4-17` | `setGoalDatesBulk` | `{ startDate: '   ', endDate: '2026-10-15' }` | Both dates present | `startDate: undefined`, `endDate: '2026-10-15'` | `'startDate' in node === false`, `'endDate' in node === true` |
| `R4-18` | `isValidISODate` | `''`, `' '`, `'   '`, `' \t\n '`, `'  2026-10-15  '` | N/A | `false` for whitespace, `true` for trimmed ISO | Pure function verification |
| `R4-18` | `patchStudioItems` | Detail title patch on cleared tree | Cleared node (`undefined` dates) | Preserves `undefined` dates | `'startDate' in node === false`, `'endDate' in node === false` |
| `R4-18` | `patchStudioItems` | `{ startDate: '   ' }` | Valid date present | Retains original date (sanitizes invalid) | Existing valid ISO date preserved |
